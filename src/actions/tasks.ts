"use server";

// Tasks and proof of work. authenticate → authorize → zod → RPC; the RPCs enforce who may do what
// and the lifecycle again in the database. Proof files go browser → storage via signed upload URLs
// and are verified here before the report is recorded (same flow as employee documents).
import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { toActionError, type ActionError } from "@/lib/errors";
import { cleanFileName, MAX_DOCUMENT_BYTES, sniffFile } from "@/lib/files";
import { BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { reportSchema, reviewSchema, taskFields, taskPayload, taskSchema, type TaskField } from "@/lib/validation/task";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const idSchema = z.uuid();
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "pdf", "docx", "xlsx"] as const;
const MAX_FILES = 10;

type TaskError = "invalid" | "taskClosed" | "taskStarted" | "notSubmitted" | "fileType" | "fileSize" | "tooManyFiles" | ActionError;

function taskError(error: { code?: string; message?: string } | null, context: string): TaskError {
  switch (error?.message) {
    case "task_closed":
      return "taskClosed";
    case "task_started":
      return "taskStarted";
    case "not_submitted":
      return "notSubmitted";
    case "too_many_files":
      return "tooManyFiles";
    case "invalid_attachment":
      return "fileType";
    case "rating_required":
    case "note_required":
      return "invalid";
    default:
      return error?.code === "23514" ? "invalid" : toActionError(error, context);
  }
}

export type TaskFormState =
  | { ok: false; error: TaskError; fields?: Partial<Record<TaskField, true>>; values: Partial<Record<TaskField, string>> }
  | { ok: true }
  | undefined;

function readTask(formData: FormData) {
  const raw = Object.fromEntries(taskFields.map((f) => [f, String(formData.get(f) ?? "")]));
  const values = Object.fromEntries(taskFields.map((f) => [f, raw[f]!.slice(0, 4000)]));
  const parsed = taskSchema.safeParse(raw);
  const fields = parsed.success ? undefined : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), true]));
  return { parsed, values, fields };
}

export async function createTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, ["owner", "manager"]);
  const { parsed, values, fields } = readTask(formData);
  if (!parsed.success) return { ok: false, error: "invalid", fields, values };

  const supabase = await createClient();
  const { data: taskId, error } = await supabase.rpc("task_create", { p: taskPayload(parsed.data) });
  if (error || !taskId) return { ok: false, error: taskError(error, "createTask"), values };
  redirect({ href: `/tasks/${taskId}`, locale });
}

export async function updateTask(taskId: string, _prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "manager"]);
  const id = idSchema.safeParse(taskId);
  const { parsed, values, fields } = readTask(formData);
  if (!id.success) return { ok: false, error: "notFound", values };
  if (!parsed.success) return { ok: false, error: "invalid", fields, values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("task_update", { p_task_id: id.data, p: taskPayload(parsed.data) });
  if (error) return { ok: false, error: taskError(error, "updateTask"), values };
  refresh();
  return { ok: true };
}

export type TaskActionState = { ok: true } | { ok: false; error: TaskError } | undefined;

export async function deleteTask(taskId: string, _prev: TaskActionState, formData: FormData): Promise<TaskActionState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, ["owner", "manager"]);
  const id = idSchema.safeParse(taskId);
  if (!id.success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_delete", { p_task_id: id.data });
  if (error) return { ok: false, error: taskError(error, "deleteTask") };
  redirect({ href: "/tasks", locale });
}

export async function startTask(taskId: string, _prev: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const id = idSchema.safeParse(taskId);
  if (!id.success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_start", { p_task_id: id.data });
  if (error) return { ok: false, error: taskError(error, "startTask") };
  refresh();
  return { ok: true };
}

/** One signed upload URL per proof file, inside the task's folder, for its assignee only. */
export async function prepareReportUpload(
  taskId: string,
  file: { name: string; size: number },
  uiLocale: string,
): Promise<{ ok: true; path: string; url: string } | { ok: false; error: TaskError }> {
  const member = await requireMember(localeSchema.parse(uiLocale));
  const id = idSchema.safeParse(taskId);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "fileSize" };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) return { ok: false, error: "fileType" };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_submit_task", { p_task_id: id.data });
  if (allowed !== true) return { ok: false, error: "forbidden" };
  const { error: limitError } = await supabase.rpc("consume_rate_limit", { p_kind: "upload" });
  if (limitError) return { ok: false, error: toActionError(limitError, "prepareReportUpload") };

  const path = `${member.company.id}/reports/${id.data}/${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "forbidden" };
  return { ok: true, path, url: data.signedUrl };
}

export type ReportState = { ok: true } | { ok: false; error: TaskError; fields?: string[] } | undefined;

export async function submitReport(taskId: string, _prev: ReportState, formData: FormData): Promise<ReportState> {
  const member = await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const id = idSchema.safeParse(taskId);
  if (!id.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const paths = formData.getAll("path").map(String).slice(0, MAX_FILES + 1);
  const names = formData.getAll("fileName").map(String);
  if (paths.length > MAX_FILES) return { ok: false, error: "tooManyFiles" };
  // Only paths this flow produced for this task; checked before anything touches storage.
  const expected = new RegExp(`^${member.company.id}/reports/${id.data}/[0-9a-f-]{36}\\.(jpg|png|webp|heic|pdf|docx|xlsx)$`);
  if (paths.some((p) => !expected.test(p))) return { ok: false, error: "forbidden" };
  // Removes files that were just uploaded for a report that won't be recorded; never one that an
  // existing report already cites (that is evidence).
  const discard = async () => {
    if (paths.length === 0) return;
    const { data: used } = await supabase.from("report_attachments").select("file_path").in("file_path", paths);
    const cited = new Set((used ?? []).map((r) => r.file_path));
    const orphans = paths.filter((p) => !cited.has(p));
    if (orphans.length) await supabase.storage.from(BUCKET).remove(orphans);
  };

  const parsed = reportSchema.safeParse({
    summary: formData.get("summary"),
    hoursSpent: formData.get("hoursSpent"),
    obstacles: formData.get("obstacles"),
    links: formData.getAll("link").map(String),
  });
  if (!parsed.success) {
    await discard();
    return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };
  }

  // Check every stored file's real content before anything is recorded.
  const attachments: { path: string; name: string; mime: string; size: number }[] = [];
  for (const [i, path] of paths.entries()) {
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !blob) {
      await discard();
      return { ok: false, error: "unexpected" };
    }
    const kind = blob.size <= MAX_DOCUMENT_BYTES ? sniffFile(new Uint8Array(await blob.arrayBuffer())) : null;
    if (!kind || !path.endsWith(`.${kind.ext}`)) {
      await discard();
      return { ok: false, error: blob.size > MAX_DOCUMENT_BYTES ? "fileSize" : "fileType" };
    }
    attachments.push({ path, name: cleanFileName(names[i] ?? ""), mime: kind.mime, size: blob.size });
  }

  const d = parsed.data;
  const { error } = await supabase.rpc("task_submit_report", {
    p_task_id: id.data,
    p: { summary: d.summary, hours_spent: d.hoursSpent.toString(), obstacles: d.obstacles ?? "", links: d.links },
    p_attachments: attachments,
  });
  if (error) {
    await discard();
    return { ok: false, error: taskError(error, "submitReport") };
  }
  refresh();
  return { ok: true };
}

export async function reviewTask(taskId: string, _prev: ReportState, formData: FormData): Promise<ReportState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "manager"]);
  const id = idSchema.safeParse(taskId);
  if (!id.success) return { ok: false, error: "notFound" };
  const parsed = reviewSchema.safeParse({
    decision: formData.get("decision"),
    rating: formData.get("rating") || undefined,
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_review", {
    p_task_id: id.data,
    p_decision: d.decision,
    p_rating: (d.decision === "approve" ? d.rating : null) as number,
    p_note: d.note ?? "",
  });
  if (error) return { ok: false, error: taskError(error, "reviewTask") };
  refresh();
  return { ok: true };
}

/** A 5-minute link to a proof file, made on demand; storage policies decide access. */
export async function attachmentUrl(attachmentId: string, uiLocale: string, download: boolean): Promise<string | null> {
  await requireMember(localeSchema.parse(uiLocale));
  const id = idSchema.safeParse(attachmentId);
  if (!id.success) return null;
  const supabase = await createClient();
  const { data: a } = await supabase.from("report_attachments").select("file_path").eq("id", id.data).maybeSingle();
  if (!a) return null;
  const ext = a.file_path.split(".").pop();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(a.file_path, 300, download ? { download: `proof-${id.data.slice(0, 8)}.${ext}` } : undefined);
  return data?.signedUrl ?? null;
}

export async function markNotificationsRead(formData: FormData): Promise<void> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const ids = formData.getAll("id").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const supabase = await createClient();
  await supabase.rpc("notifications_mark_read", { p_ids: (ids.length ? ids : null) as number[] });
  refresh();
}
