import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { formatDate, formatDateTime } from "@/lib/format";
import { loadNames } from "@/lib/task-data";
import { isOverdue, statusTone, type TaskStatus } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { imageDataUri, issuedNow, loadBrand } from "./data";
import { documentHtml, dt, esc, grid, ltr, pill, stampBoxHtml, txt } from "./html";
import { renderPdf } from "./render";

const MAX_PHOTOS = 9;
const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;

/** The completion report of one task: details, every report round with proof, and the verdict. */
export async function buildTaskReportPdf(locale: Locale, member: Member, taskId: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();
  // RLS: a task the caller can't see simply isn't returned.
  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task) return null;
  const [{ data: reports }, { data: files }, { data: assignee }] = await Promise.all([
    supabase.from("task_reports").select("*").eq("task_id", taskId).order("round"),
    supabase.from("report_attachments").select("id, report_id, file_path, file_name, mime_type").eq("task_id", taskId).order("created_at"),
    supabase.from("employees").select("id, national_id, job_title").eq("id", task.assignee_id).maybeSingle(),
  ]);
  const names = await loadNames(locale, [task.created_by, task.assignee_id, ...(reports ?? []).map((r) => r.reviewed_by)]);
  const brand = await loadBrand(locale, member);

  const t = await getTranslations({ locale, namespace: "tasks" });
  const te = await getTranslations({ locale, namespace: "employees" });
  const tp = await getTranslations({ locale, namespace: "pdf" });
  const status = task.status as TaskStatus;
  const overdue = isOverdue(status, task.due_date);
  const number = `TSK-${task.id.slice(0, 8).toUpperCase()}`;

  // Embed raster proof photos (capped); everything else is listed by name.
  let photosLeft = MAX_PHOTOS;
  const sections: string[] = [];
  for (const r of reports ?? []) {
    const mine = (files ?? []).filter((f) => f.report_id === r.id);
    const photos: { name: string; uri: string }[] = [];
    const others: string[] = [];
    for (const f of mine) {
      const uri = photosLeft > 0 && f.mime_type.startsWith("image/") ? await imageDataUri(f.file_path, MAX_PHOTO_BYTES) : null;
      if (uri) {
        photos.push({ name: f.file_name, uri });
        photosLeft--;
      } else {
        others.push(f.file_name);
      }
    }
    sections.push(`<div class="card">
      <div class="round"><strong>${esc(t("report.round", { round: r.round }))}</strong><span>${esc(formatDateTime(locale, r.created_at))}</span></div>
      <p>${txt(r.summary)}</p>
      ${grid([
        {
          label: t("report.hoursSpent"),
          value: dt(task.expected_hours ? t("report.hoursOf", { spent: Number(r.hours_spent), expected: Number(task.expected_hours) }) : t("report.hoursOnly", { spent: Number(r.hours_spent) })),
        },
        { label: t("report.obstacles"), value: txt(r.obstacles), wide: false },
        { label: t("report.links"), value: r.links.length ? r.links.map((l) => `<a href="${esc(l)}" dir="ltr">${esc(l)}</a>`).join("<br>") : "—" },
      ])}
      ${photos.length ? `<div class="photos">${photos.map((p) => `<figure><img src="${esc(p.uri)}" alt=""><figcaption dir="auto">${esc(p.name)}</figcaption></figure>`).join("")}</div>` : ""}
      ${others.length ? `<p class="muted">${esc(tp("otherFiles"))}: ${others.map((n) => txt(n)).join("، ")}</p>` : ""}
      ${r.review_note && r.status !== "submitted" ? `<div class="note ${r.status === "approved" ? "ok" : "bad"}"><strong>${esc(t("report.reviewNote"))}:</strong> ${txt(r.review_note)}</div>` : ""}
    </div>`);
  }

  const approvalDate =
    status === "approved" && task.approved_at
      ? formatDate(locale, task.approved_at.slice(0, 10))
      : undefined;
  const verdict = status === "approved" ? stampBoxHtml(t("stamp.label"), approvalDate) : "";

  const body = `
    <h2>${esc(tp("taskDetails"))}</h2>
    <div class="card" style="margin-bottom:8px"><strong style="font-size:11.5pt">${txt(task.title)}</strong> ${pill(statusTone[status], t(`status.${status}`))}</div>
    ${grid([
      { label: t("detail.assignee"), value: txt(names.get(task.assignee_id)) },
      { label: te("columns.nationalId"), value: assignee?.national_id ? ltr(assignee.national_id) : "—" },
      { label: te("columns.jobTitle"), value: txt(assignee?.job_title) },
      { label: t("form.priority"), value: esc(t(`priority.${task.priority}`)) },
      {
        label: t("detail.due"),
        value: `${dt(formatDate(locale, task.due_date))}${task.due_time ? ` · ${esc(t("dueAt", { time: task.due_time.slice(0, 5) }))}` : ""}${overdue ? ` ${pill("brick", t("overdue"))}` : ""}`,
      },
      { label: t("detail.expectedHours"), value: task.expected_hours ? dt(t("detail.hours", { count: Number(task.expected_hours) })) : "—" },
      { label: t("detail.location"), value: txt(task.location) },
      ...(task.description ? [{ label: t("form.description"), value: txt(task.description), wide: true }] : []),
    ])}
    <h2>${esc(tp("reports"))}</h2>
    ${sections.length ? sections.join("") : `<p class="muted">${esc(tp("noReports"))}</p>`}
    ${verdict}
  `;

  const html = documentHtml({
    locale,
    brand,
    title: tp("taskReportTitle"),
    hideNumber: true,
    issuedLabel: tp("issued"),
    issued: esc(issuedNow(locale)),
    body,
  });
  const pdf = await renderPdf(html, { locale, footerLabel: tp("taskReportTitle"), pageLabel: tp("page"), ofLabel: tp("of") });
  return { pdf, filename: `${number.toLowerCase()}.pdf` };
}
