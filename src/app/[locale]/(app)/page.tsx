import { CalendarClock, CalendarDays, Clock, HandCoins, MapPin, Network, Settings } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPill } from "@/components/status-pill";
import { TaskCard, type TaskRow } from "@/components/tasks/task-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { documentStatus, documentStatusTone, EXPIRY_WARNING_DAYS } from "@/lib/documents";
import { formatDate, todayInRiyadh } from "@/lib/format";
import { loadNames } from "@/lib/task-data";
import { type Priority, type TaskStatus } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";

const TASK_COLUMNS = "id, title, status, priority, due_date, due_time, assignee_id";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tApp = await getTranslations({ locale, namespace: "app" });
  const tTasks = await getTranslations({ locale, namespace: "tasks" });
  const tDocs = await getTranslations({ locale, namespace: "documents" });
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tEmployees = await getTranslations({ locale, namespace: "employees" });

  const manages = member.role === "owner" || member.role === "manager";
  const managesPeople = member.role === "owner" || member.role === "hr";
  const today = todayInRiyadh();
  const soon = new Date(Date.parse(today) + EXPIRY_WARNING_DAYS * 86_400_000).toISOString().slice(0, 10);

  // Everything below is scoped by RLS to what this person may see.
  const supabase = await createClient();
  const [mine, review, overdue, approved, docs] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("assignee_id", member.employee_id).neq("status", "approved").order("due_date").limit(6),
    manages
      ? supabase.from("tasks").select(TASK_COLUMNS).eq("status", "submitted").neq("assignee_id", member.employee_id).order("submitted_at").limit(6)
      : Promise.resolve({ data: [] }),
    manages
      ? supabase.from("tasks").select(TASK_COLUMNS).in("status", ["assigned", "in_progress", "changes_requested"]).lt("due_date", today).neq("assignee_id", member.employee_id).order("due_date").limit(6)
      : Promise.resolve({ data: [] }),
    manages
      ? supabase.from("tasks").select(TASK_COLUMNS).eq("status", "approved").neq("assignee_id", member.employee_id).order("approved_at", { ascending: false }).limit(4)
      : Promise.resolve({ data: [] }),
    managesPeople
      ? supabase.from("employee_documents").select("id, employee_id, doc_type, expiry_date").not("expiry_date", "is", null).lte("expiry_date", soon).order("expiry_date").limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  const taskRows = [...(mine.data ?? []), ...(review.data ?? []), ...(overdue.data ?? []), ...(approved.data ?? [])];
  const names = await loadNames(locale, [...taskRows.map((r) => r.assignee_id), ...(docs.data ?? []).map((d) => d.employee_id)]);
  const toRows = (rows: typeof taskRows): TaskRow[] =>
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as TaskStatus,
      priority: r.priority as Priority,
      dueDate: r.due_date,
      dueTime: r.due_time,
      assignee: names.get(r.assignee_id) ?? null,
    }));

  const name = (locale === "en" && member.full_name_en) || member.full_name_ar;

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-page">{tApp("greeting", { name })}</h1>

      <Section title={tTasks("myTitle")} href="/tasks" more={t("viewAll")}>
        {(mine.data ?? []).length === 0 ? (
          <Empty>{tTasks("emptyMine")}</Empty>
        ) : (
          <TaskGrid rows={toRows(mine.data ?? [])} locale={locale} showAssignee={false} />
        )}
      </Section>

      {manages && (
        <>
          <Section title={t("awaitingReview")} href="/tasks?status=review" more={t("viewAll")}>
            {(review.data ?? []).length === 0 ? <Empty>{t("nothingToReview")}</Empty> : <TaskGrid rows={toRows(review.data ?? [])} locale={locale} showAssignee />}
          </Section>
          <Section title={t("overdue")}>
            {(overdue.data ?? []).length === 0 ? <Empty>{t("nothingOverdue")}</Empty> : <TaskGrid rows={toRows(overdue.data ?? [])} locale={locale} showAssignee />}
          </Section>
          <Section title={t("recentlyApproved")} href="/tasks" more={t("viewAll")}>
            {(approved.data ?? []).length === 0 ? <Empty>{t("nothingApproved")}</Empty> : <TaskGrid rows={toRows(approved.data ?? [])} locale={locale} showAssignee />}
          </Section>
        </>
      )}

      {managesPeople && (
        <>
          <Section title={t("expiringDocs")} href="/employees" more={tEmployees("title")}>
            {(docs.data ?? []).length === 0 ? (
              <Empty>{t("nothingExpiring")}</Empty>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {(docs.data ?? []).map((d) => {
                  const status = documentStatus(d.expiry_date, today);
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/employees/${d.employee_id}`}
                        className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4 hover:border-indigo focus-visible:outline-2 focus-visible:outline-indigo"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-semibold">{tDocs(`types.${d.doc_type as "iqama"}`)}</span>
                          {status !== "noExpiry" && <StatusPill tone={documentStatusTone[status]}>{tDocs(`status.${status}`)}</StatusPill>}
                        </span>
                        <span className="text-secondary">{names.get(d.employee_id) ?? "—"}</span>
                        <span className="text-secondary tabular-nums">{t("expiresOn", { date: formatDate(locale, d.expiry_date!) })}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </>
      )}

      {/* Phones show only the main tabs; these sections are one tap from here. */}
      <section aria-labelledby="quick" className="flex flex-col gap-3">
        <h2 id="quick" className="text-section">
          {t("quickLinks")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/attendance", label: tNav("attendance"), icon: Clock, show: true },
            { href: "/leave", label: tNav("leave"), icon: CalendarDays, show: true },
            { href: "/advances", label: tNav("advances"), icon: HandCoins, show: member.role === "owner" || member.role === "hr" || member.role === "employee" },
            { href: "/departments", label: tNav("departments"), icon: Network, show: managesPeople },
            { href: "/branches", label: tNav("branches"), icon: MapPin, show: managesPeople },
            { href: "/shifts", label: tNav("shifts"), icon: CalendarClock, show: managesPeople },
            { href: "/settings", label: tNav("settings"), icon: Settings, show: member.role === "owner" },
          ]
            .filter((l) => l.show)
            .map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface px-4 hover:border-indigo focus-visible:outline-2 focus-visible:outline-indigo"
                >
                  <Icon className="size-5 text-ink-soft" aria-hidden />
                  <span className="font-semibold">{label}</span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}

function Section({ title, href, more, children }: { title: string; href?: "/tasks" | "/employees" | "/tasks?status=review"; more?: string; children: React.ReactNode }) {
  const id = `s-${title}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-section">
          {title}
        </h2>
        {href && more && (
          <Link href={href} className="text-label text-indigo hover:underline">
            {more}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-card border border-dashed border-line bg-surface p-4 text-secondary">{children}</p>;
}

function TaskGrid({ rows, locale, showAssignee }: { rows: TaskRow[]; locale: Locale; showAssignee: boolean }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {rows.map((task) => (
        <li key={task.id}>
          <TaskCard task={task} locale={locale} showAssignee={showAssignee} />
        </li>
      ))}
    </ul>
  );
}
