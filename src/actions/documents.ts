"use server";

// Employee documents (owner / HR within reach). Files up to 10 MB go straight from the browser to
// private storage through a short-lived signed upload URL (Vercel functions cap request bodies at
// 4.5 MB), then the server checks the stored bytes before recording the document. CLAUDE.md §5.12-14.
import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { normalizeNationalId } from "@/lib/auth/national-id";
import { DOCUMENT_TYPES } from "@/lib/documents";
import { toActionError, type ActionError } from "@/lib/errors";
import { cleanFileName, MAX_DOCUMENT_BYTES, sniffFile } from "@/lib/files";
import { BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const PEOPLE_ROLES = ["owner", "hr"] as const;
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "pdf", "docx", "xlsx"] as const;

export type DocumentState =
  | { ok: true }
  | { ok: false; error: "invalid" | "fileType" | "fileSize" | ActionError; fields?: string[] }
  | undefined;

const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);
const documentSchema = z
  .object({
    docType: z.enum(DOCUMENT_TYPES),
    number: z.preprocess((v) => (typeof v === "string" ? normalizeNationalId(v) || undefined : v), z.string().max(40).optional()),
    issueDate: z.preprocess(blankToUndefined, z.iso.date().optional()),
    expiryDate: z.preprocess(blankToUndefined, z.iso.date().optional()),
  })
  .refine((d) => !d.issueDate || !d.expiryDate || d.expiryDate >= d.issueDate, { path: ["expiryDate"] });

/** Step 1: authorize, then hand the browser a one-off upload URL inside the employee's folder. */
export async function prepareDocumentUpload(
  employeeId: string,
  file: { name: string; size: number },
  uiLocale: string,
): Promise<{ ok: true; path: string; url: string } | { ok: false; error: "fileType" | "fileSize" | ActionError }> {
  const member = await requireMember(localeSchema.parse(uiLocale), PEOPLE_ROLES);
  const id = z.uuid().safeParse(employeeId);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "fileSize" };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) return { ok: false, error: "fileType" };

  const supabase = await createClient();
  // Checked here too, not left to the storage signing step alone.
  const { data: allowed } = await supabase.rpc("can_manage_employee", { p_employee_id: id.data });
  if (allowed !== true) return { ok: false, error: "forbidden" };
  const { error: limitError } = await supabase.rpc("consume_rate_limit", { p_kind: "upload" });
  if (limitError) return { ok: false, error: toActionError(limitError, "prepareDocumentUpload") };

  // The storage insert policy checks the caller may manage this employee before signing.
  const path = `${member.company.id}/documents/${id.data}/${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "forbidden" };
  return { ok: true, path, url: data.signedUrl };
}

/** Step 2 (after the browser uploaded, or with no file): verify the stored bytes and record it. */
export async function saveDocument(employeeId: string, _prev: DocumentState, formData: FormData): Promise<DocumentState> {
  const member = await requireMember(localeSchema.parse(formData.get("uiLocale")), PEOPLE_ROLES);
  const id = z.uuid().safeParse(employeeId);
  if (!id.success) return { ok: false, error: "notFound" };
  const parsed = documentSchema.safeParse({
    docType: formData.get("docType"),
    number: formData.get("number"),
    issueDate: formData.get("issueDate"),
    expiryDate: formData.get("expiryDate"),
  });
  const path = String(formData.get("path") ?? "");
  const supabase = await createClient();
  // Only a path this flow could have produced: the caller's company, this employee, a random name.
  // Checked before anything else, so a crafted path can never reach the storage delete below.
  const expected = new RegExp(`^${member.company.id}/documents/${id.data}/[0-9a-f-]{36}\\.(jpg|png|webp|heic|pdf|docx|xlsx)$`);
  if (path && !expected.test(path)) return { ok: false, error: "forbidden" };
  // Removes a just-uploaded file that won't be recorded, never one an existing document points at.
  const discard = async () => {
    if (!path) return;
    const { count } = await supabase.from("employee_documents").select("id", { count: "exact", head: true }).eq("file_path", path);
    if (count === 0) await supabase.storage.from(BUCKET).remove([path]);
  };
  if (!parsed.success) {
    await discard();
    return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };
  }

  let file: { file_path: string; file_name: string; mime_type: string; size_bytes: number } | null = null;
  if (path) {
    const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(path);
    if (downloadError || !blob) return { ok: false, error: "unexpected" };
    if (blob.size > MAX_DOCUMENT_BYTES) {
      await discard();
      return { ok: false, error: "fileSize" };
    }
    // The content decides the type; the name's extension must agree with it.
    const kind = sniffFile(new Uint8Array(await blob.arrayBuffer()));
    if (!kind || !path.endsWith(`.${kind.ext}`)) {
      await discard();
      return { ok: false, error: "fileType" };
    }
    file = {
      file_path: path,
      file_name: cleanFileName(String(formData.get("fileName") ?? "")),
      mime_type: kind.mime,
      size_bytes: blob.size,
    };
  }

  const d = parsed.data;
  const { error } = await supabase.from("employee_documents").insert({
    company_id: member.company.id,
    employee_id: id.data,
    doc_type: d.docType,
    number: d.number ?? null,
    issue_date: d.issueDate ?? null,
    expiry_date: d.expiryDate ?? null,
    ...file,
  });
  if (error) {
    await discard();
    return { ok: false, error: toActionError(error, "saveDocument") };
  }
  refresh();
  return { ok: true };
}

export async function deleteDocument(documentId: string, _prev: DocumentState, formData: FormData): Promise<DocumentState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), PEOPLE_ROLES);
  const id = z.uuid().safeParse(documentId);
  if (!id.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("employee_documents").delete().eq("id", id.data).select("file_path");
  if (error) return { ok: false, error: toActionError(error, "deleteDocument") };
  if (data.length !== 1) return { ok: false, error: "notFound" };
  if (data[0]?.file_path) await supabase.storage.from(BUCKET).remove([data[0].file_path]);
  refresh();
  return { ok: true };
}

/** A 5-minute download link, made on click so it's fresh; storage policies decide access. */
export async function documentDownloadUrl(documentId: string, uiLocale: string): Promise<string | null> {
  await requireMember(localeSchema.parse(uiLocale));
  const id = z.uuid().safeParse(documentId);
  if (!id.success) return null;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("employee_documents").select("file_path, doc_type, number").eq("id", id.data).maybeSingle();
  if (!doc?.file_path) return null;
  // ASCII download name ("iqama-2000000005.pdf"): Storage double-encodes non-ASCII names, which
  // would reach the user as "%D8%A5…".
  const ext = doc.file_path.split(".").pop();
  const downloadName = `${doc.doc_type}${doc.number ? `-${doc.number.replace(/[^\w-]/g, "")}` : ""}.${ext}`;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 300, { download: downloadName });
  return data?.signedUrl ?? null;
}
