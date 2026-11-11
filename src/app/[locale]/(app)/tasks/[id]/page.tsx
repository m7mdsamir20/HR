import { ArrowRight, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { updateTask } from "@/actions/tasks";
import { FactsSection } from "@/components/form-section";
import { StatusPill } from "@/components/status-pill";
import { ReportForm } from "@/components/tasks/report-form";
import { TaskForm } from "@/components/tasks/task-form";
import { AttachmentLinks, DeleteTaskButton, ReviewForm, StartButton } from "@/components/tasks/task-controls";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatTimeString, todayInRiyadh } from "@/lib/format";
import { assigneeOptions, loadNames } from "@/lib/task-data";
import { isOverdue, statusTone, type TaskStatus } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function TaskPage({ params }: PageProps<"/[locale]/tasks/[id]">) {
  const { locale: rawLocale, id: rawId } = await params;
  const locale = rawLocale as Locale;
  const member = await requireMember(locale);
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();

  // RLS: nothing comes back for a task the caller isn't part of.
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("*").eq("id", id.data).maybeSingle();
  if (!task) notFound();
  const [{ data: reports }, { data: attachments }, { data: assignee }] = await Promise.all([
    supabase.from("task_reports").select("*").eq("task_id", id.data).order("round", { ascending: false }),
    supabase.from("report_attachments").select("id, report_id, file_name").eq("task_id", id.data).order("created_at"),
    supabase.from("employees").select("id, national_id, job_title").eq("id", task.assignee_id).maybeSingle(),
  ]);
  const names = await loadNames(locale, [task.created_by, task.assignee_id, ...(reports ?? []).map((r) => r.reviewed_by)]);

  const t = await getTranslations({ locale, namespace: "tasks" });
  const te = await getTranslations({ locale, namespace: "employees" });
  const tPdf = await getTranslations({ locale, namespace: "pdf" });
  const status = task.status as TaskStatus;
  const isAssignee = task.assignee_id === member.employee_id;
  const isReviewer = !isAssignee && (member.role === "owner" || member.role === "admin" || member.role === "manager");
  const canEdit = isReviewer && status !== "approved";
  const overdue = isOverdue(status, task.due_date);
  const latest = reports?.[0];
  const assignees = canEdit ? await assigneeOptions(locale, member.employee_id) : [];
  const date = (d: string) => formatDate(locale, d);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/tasks" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {t("detail.back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page">{task.title}</h1>
          <StatusPill tone={statusTone[status]}>{t(`status.${status}`)}</StatusPill>
          <Button asChild className="ms-auto">
            {/* A route handler, not a page: a plain anchor. The browser's PDF viewer opens it and has print and save. */}
            <a href={`${locale === "en" ? "/en" : ""}/tasks/${task.id}/pdf`} target="_blank" rel="noopener">
              <Printer aria-hidden />
              {tPdf("view")}
            </a>
          </Button>
        </div>
        <p className="text-secondary">{t("detail.createdBy", { name: names.get(task.created_by) ?? "—" })}</p>
      </div>

      <FactsSection
        title={t("form.sections.task")}
        items={[
          { label: t("detail.assignee"), value: names.get(task.assignee_id) ?? "—" },
          ...(assignee?.national_id ? [{ label: te("columns.nationalId"), value: assignee.national_id }] : []),
          ...(assignee?.job_title ? [{ label: te("columns.jobTitle"), value: assignee.job_title }] : []),
          {
            label: t("detail.due"),
            value: (
              <span className={cn(overdue && "text-brick")}>
                {overdue && `${t("overdue")} · `}
                {date(task.due_date)}
                {task.due_time && ` · ${t("dueAt", { time: formatTimeString(locale, task.due_time) })}`}
              </span>
            ),
          },
          { label: t("form.priority"), value: t(`priority.${task.priority}`) },
          { label: t("detail.expectedHours"), value: task.expected_hours ? t("detail.hours", { count: Number(task.expected_hours) }) : null },
          { label: t("detail.location"), value: task.location },
        ]}
      />
      {task.description && (
        <section className="rounded-card border border-line bg-surface p-4 md:p-6">
          <h2 className="mb-3 text-card">{t("form.description")}</h2>
          <p className="whitespace-pre-line" dir="auto">
            {task.description}
          </p>
        </section>
      )}

      {isAssignee && status === "assigned" && <StartButton taskId={task.id} />}
      {isAssignee && status === "submitted" && <p className="rounded-card border border-saffron/30 bg-saffron/5 p-4 text-label">{t("detail.waitingReview")}</p>}
      {isAssignee && ["assigned", "in_progress", "changes_requested"].includes(status) && (
        <ReportForm taskId={task.id} resubmit={status === "changes_requested"} expectedHours={task.expected_hours ? String(Number(task.expected_hours)) : null} />
      )}

      {isReviewer && status === "submitted" && <ReviewForm taskId={task.id} />}

      {reports && reports.length > 0 && (
        <section aria-labelledby="history" className="flex flex-col gap-3">
          <h2 id="history" className="text-section">
            {t("report.history")}
          </h2>
          <ol className="flex flex-col gap-4">
            {reports.map((r) => {
              const files = (attachments ?? []).filter((a) => a.report_id === r.id);
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-card">{t("report.round", { round: r.round })}</h3>
                    <span className="text-secondary tabular-nums">{formatDateTime(locale, r.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-line" dir="auto">
                    {r.summary}
                  </p>
                  <dl className="grid gap-3 text-secondary sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt>{t("report.hoursSpent")}</dt>
                      <dd className="font-semibold text-ink tabular-nums">
                        {task.expected_hours
                          ? t("report.hoursOf", { spent: Number(r.hours_spent), expected: Number(task.expected_hours) })
                          : t("report.hoursOnly", { spent: Number(r.hours_spent) })}
                      </dd>
                    </div>
                    {r.obstacles && (
                      <div className="sm:col-span-2">
                        <dt>{t("report.obstacles")}</dt>
                        <dd className="text-ink" dir="auto">
                          {r.obstacles}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {r.links.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {r.links.map((l) => (
                        <li key={l}>
                          {/* https only (database check); opened without referrer or opener */}
                          <a href={l} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all text-label text-indigo underline-offset-2 hover:underline">
                            {l}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {files.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-label">{t("report.attachments")}</p>
                      <ul className="grid gap-2 md:grid-cols-2">
                        {files.map((f) => (
                          <AttachmentLinks key={f.id} attachmentId={f.id} name={f.file_name} />
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.review_note && r.status !== "submitted" && (
                    <p className={cn("rounded-control border p-3 text-label", r.status === "approved" ? "border-stamp/30 bg-stamp/5" : "border-brick/30 bg-brick/5")}>
                      <span className="font-semibold">{t("report.reviewNote")}: </span>
                      <span dir="auto">{r.review_note}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {canEdit && (
        <section aria-labelledby="edit-task" className="flex flex-col gap-4">
          <h2 id="edit-task" className="text-section">
            {t("detail.edit")}
          </h2>
          <TaskForm
            mode="edit"
            action={updateTask.bind(null, task.id)}
            assignees={assignees}
            minDate={todayInRiyadh()}
            defaults={{
              title: task.title,
              description: task.description ?? "",
              location: task.location ?? "",
              assigneeId: task.assignee_id,
              priority: task.priority,
              dueDate: task.due_date,
              dueTime: task.due_time?.slice(0, 5) ?? "",
              expectedHours: task.expected_hours ? String(Number(task.expected_hours)) : "",
            }}
          />
          {status === "assigned" && <DeleteTaskButton taskId={task.id} />}
        </section>
      )}
    </main>
  );
}
