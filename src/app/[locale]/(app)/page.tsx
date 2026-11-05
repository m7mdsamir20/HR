import {
  BarChart3,
  Clock,
  DollarSign,
  ListChecks,
  Star,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AttendanceGaugeCard } from "@/components/analytics/attendance-gauge-card";
import { DepartmentDistribution } from "@/components/analytics/department-distribution";
import { FinancialSummaryCard } from "@/components/analytics/financial-summary-card";
import { KpiCard } from "@/components/analytics/kpi-card";
import { SaudizationMeter } from "@/components/analytics/saudization-meter";
import { TaskEfficiencyCard } from "@/components/analytics/task-efficiency-card";
import { TaskCard, type TaskRow } from "@/components/tasks/task-card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { AnalyticsSummary } from "@/lib/analytics";
import { requireMember } from "@/lib/auth/account";
import { todayInRiyadh } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { loadNames } from "@/lib/task-data";
import { type Priority, type TaskStatus } from "@/lib/tasks";

const TASK_COLUMNS = "id, title, status, priority, due_date, due_time, assignee_id";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "home" });
  const tApp = await getTranslations({ locale, namespace: "app" });
  const tTasks = await getTranslations({ locale, namespace: "tasks" });
  const tAnalytics = await getTranslations({ locale, namespace: "analytics" });

  const isLeader = member.role === "owner" || member.role === "admin";
  const isHR = member.role === "hr";
  const isManager = member.role === "manager";
  const isEmployee = member.role === "employee";
  const managesPeople = isLeader || isHR;

  const today = todayInRiyadh();

  const supabase = await createClient();
  const [mine, review, overdue, analyticsRes] = await Promise.all([
    // Only non-owners usually have personal daily assignee tasks
    !isLeader
      ? supabase.from("tasks").select(TASK_COLUMNS).eq("assignee_id", member.employee_id).neq("status", "approved").order("due_date").limit(6)
      : Promise.resolve({ data: [] }),
    isLeader || isManager || isHR
      ? supabase.from("tasks").select(TASK_COLUMNS).eq("status", "submitted").neq("assignee_id", member.employee_id).order("submitted_at").limit(6)
      : Promise.resolve({ data: [] }),
    isLeader || isManager
      ? supabase.from("tasks").select(TASK_COLUMNS).in("status", ["assigned", "in_progress", "changes_requested"]).lt("due_date", today).neq("assignee_id", member.employee_id).order("due_date").limit(6)
      : Promise.resolve({ data: [] }),
    supabase.rpc("get_analytics_summary"),
  ]);

  const summary = (analyticsRes.data as unknown as AnalyticsSummary) || null;

  const taskRows = [...(mine.data ?? []), ...(review.data ?? []), ...(overdue.data ?? [])];
  const names = await loadNames(locale, taskRows.map((r) => r.assignee_id));
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

  // Role-specific Header Details
  let dashboardTitle = t("executiveDashboard");
  let dashboardSubtitle = t("executiveSubtitle");

  if (isHR) {
    dashboardTitle = t("hrDashboard");
    dashboardSubtitle = t("hrSubtitle");
  } else if (isManager) {
    dashboardTitle = t("managerDashboard");
    dashboardSubtitle = t("managerSubtitle");
  } else if (isEmployee) {
    dashboardTitle = t("employeeDashboard");
    dashboardSubtitle = t("employeeSubtitle");
  }

  return (
    <main className="flex flex-col gap-8 pb-12">
      {/* Dynamic Header tailored to role */}
      <div className="flex flex-col gap-2 border-b border-line pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-control bg-indigo/10 text-indigo">
              <BarChart3 className="size-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-page">{dashboardTitle}</h1>
              <p className="text-secondary">{dashboardSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto rounded-control bg-paper px-3 py-1.5 text-caption font-medium text-ink-soft">
            <span>{tApp("greeting", { name })}</span>
          </div>
        </div>

        {isManager && (
          <p className="mt-1 text-caption font-medium text-indigo">
            ℹ️ {tAnalytics("teamScopeNotice")}
          </p>
        )}
      </div>

      {/* Top 4 Quick KPI Highlight Cards */}
      {summary && (
        <section aria-labelledby="kpis-heading" className="flex flex-col gap-3">
          <h2 id="kpis-heading" className="sr-only">
            {tAnalytics("quickKpis")}
          </h2>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI 1: Workforce or Hours */}
            {summary.workforce ? (
              <KpiCard
                title={isManager ? "فريق العمل" : tAnalytics("totalEmployees")}
                value={summary.workforce.total_employees}
                subtitle={
                  summary.workforce.saudization_rate !== null
                    ? `${tAnalytics("saudizationRate")}: ${summary.workforce.saudization_rate}%`
                    : "موظف في الفريق المباشر"
                }
                icon={Users}
              />
            ) : (
              <KpiCard
                title={tAnalytics("hoursLogged")}
                value={summary.tasks.hours_spent}
                subtitle="ساعة عمل مسجلة"
                icon={Clock}
              />
            )}

            {/* KPI 2: Task Completion Rate */}
            <KpiCard
              title={tAnalytics("completionRate")}
              value={`${summary.tasks.completion_rate}%`}
              subtitle={`${summary.tasks.approved} من ${summary.tasks.total} مهمة معتمدة`}
              icon={ListChecks}
              tone={summary.tasks.completion_rate >= 75 ? "stamp" : "saffron"}
              badge={summary.tasks.completion_rate >= 75 ? "ممتاز" : "قيد المتابعة"}
            />

            {/* KPI 3: Today's Attendance or Quality Rating */}
            <KpiCard
              title={tAnalytics("todayPresent")}
              value={`${summary.attendance.today_rate}%`}
              subtitle={`${summary.attendance.today_present} حاضر اليوم`}
              icon={Clock}
              tone={summary.attendance.today_rate >= 80 ? "stamp" : "saffron"}
            />

            {/* KPI 4: Financial Summary or Quality Star */}
            {summary.financial?.latest_run ? (
              <KpiCard
                title={tAnalytics("netPayout")}
                value={formatAmount(summary.financial.latest_run.total_net)}
                subtitle={`${tAnalytics("currency")} مسير ${summary.financial.latest_run.month} / ${summary.financial.latest_run.year}`}
                icon={DollarSign}
                tone="indigo"
              />
            ) : (
              <KpiCard
                title={tAnalytics("avgRating")}
                value={`${summary.tasks.avg_rating} / 5.0`}
                subtitle="متوسط تقييم جودة الإنجاز"
                icon={Star}
                tone="stamp"
              />
            )}
          </div>
        </section>
      )}

      {/* Detailed Analytics Grid for Leadership / HR / Management */}
      {summary && (
        <section aria-labelledby="analytics-detail-heading" className="flex flex-col gap-4">
          <h2 id="analytics-detail-heading" className="text-section flex items-center gap-2">
            <BarChart3 className="size-5 text-indigo" aria-hidden />
            <span>{isLeader ? "المؤشرات التحليلية التفصيلية" : "تحليلات الأداء"}</span>
          </h2>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Task Efficiency */}
            <TaskEfficiencyCard tasks={summary.tasks} t={tAnalytics} />

            {/* Attendance Gauge */}
            <AttendanceGaugeCard attendance={summary.attendance} t={tAnalytics} />

            {/* Workforce & Saudization (Leader & HR) */}
            {summary.workforce && managesPeople && (
              <SaudizationMeter workforce={summary.workforce} t={tAnalytics} />
            )}

            {/* Financial Summary (Leader & HR) */}
            {summary.financial && managesPeople && (
              <FinancialSummaryCard financial={summary.financial} locale={locale} t={tAnalytics} />
            )}

            {/* Department Breakdown (Leader & HR) */}
            {summary.departments.length > 0 && managesPeople && summary.workforce && (
              <div className="lg:col-span-2">
                <DepartmentDistribution
                  departments={summary.departments}
                  totalEmployees={summary.workforce.total_employees}
                  t={tAnalytics}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Operational Task Center: Awaiting Review for Managers/Leaders */}
      {(isLeader || isManager || isHR) && (review.data ?? []).length > 0 && (
        <Section title={t("awaitingReview")} href="/tasks?status=review" more={t("viewAll")}>
          <TaskGrid rows={toRows(review.data ?? [])} locale={locale} showAssignee />
        </Section>
      )}

      {/* Overdue tasks if any */}
      {(isLeader || isManager) && (overdue.data ?? []).length > 0 && (
        <Section title={t("overdue")}>
          <TaskGrid rows={toRows(overdue.data ?? [])} locale={locale} showAssignee />
        </Section>
      )}

      {/* Personal Tasks for Employees / Managers */}
      {!isLeader && (
        <Section title={tTasks("myTitle")} href="/tasks" more={t("viewAll")}>
          {(mine.data ?? []).length === 0 ? (
            <Empty>{tTasks("emptyMine")}</Empty>
          ) : (
            <TaskGrid rows={toRows(mine.data ?? [])} locale={locale} showAssignee={false} />
          )}
        </Section>
      )}
    </main>
  );
}

function Section({
  title,
  href,
  more,
  children,
}: {
  title: string;
  href?: "/tasks" | "/tasks?status=review";
  more?: string;
  children: React.ReactNode;
}) {
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
