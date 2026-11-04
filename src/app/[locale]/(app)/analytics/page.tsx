import { BarChart3, Clock, DollarSign, ListChecks, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { KpiCard } from "@/components/analytics/kpi-card";
import { SaudizationMeter } from "@/components/analytics/saudization-meter";
import { TaskEfficiencyCard } from "@/components/analytics/task-efficiency-card";
import { AttendanceGaugeCard } from "@/components/analytics/attendance-gauge-card";
import { FinancialSummaryCard } from "@/components/analytics/financial-summary-card";
import { DepartmentDistribution } from "@/components/analytics/department-distribution";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { formatAmount } from "@/lib/money";
import type { AnalyticsSummary } from "@/lib/analytics";

export default async function AnalyticsPage({
  params,
}: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "analytics" });
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_analytics_summary");
  if (error || !data) {
    throw new Error("Failed to load analytics summary", { cause: error });
  }

  const summary = data as unknown as AnalyticsSummary;
  const isManager = member.role === "manager";
  const managesPeople = member.role === "owner" || member.role === "hr";

  return (
    <main className="flex flex-col gap-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-1.5 border-b border-line pb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-control bg-indigo/10 text-indigo">
            <BarChart3 className="size-5" aria-hidden />
          </div>
          <h1 className="text-page">{t("title")}</h1>
        </div>
        <p className="text-secondary">{t("description")}</p>
        {isManager && (
          <p className="mt-2 text-caption font-medium text-indigo">
            ℹ️ {t("teamScopeNotice")}
          </p>
        )}
      </div>

      {/* Top 4 Quick KPI Highlight Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {summary.workforce ? (
          <KpiCard
            title={isManager ? "حجم الفريق" : t("totalEmployees")}
            value={summary.workforce.total_employees}
            subtitle={isManager ? "موظف في فريقك المباشر" : "موظف نشط في الشركة"}
            icon={Users}
          />
        ) : (
          <KpiCard
            title={t("hoursLogged")}
            value={summary.tasks.hours_spent}
            subtitle="ساعة عمل مسجلة"
            icon={Clock}
          />
        )}

        <KpiCard
          title={t("completionRate")}
          value={`${summary.tasks.completion_rate}%`}
          subtitle={`${summary.tasks.approved} من ${summary.tasks.total} مهمة معتمدة`}
          icon={ListChecks}
          tone={summary.tasks.completion_rate >= 75 ? "stamp" : "saffron"}
          badge={summary.tasks.completion_rate >= 75 ? "ممتاز" : "قيد المتابعة"}
        />

        <KpiCard
          title={t("todayPresent")}
          value={`${summary.attendance.today_rate}%`}
          subtitle={`${summary.attendance.today_present} حاضر اليوم`}
          icon={Clock}
          tone={summary.attendance.today_rate >= 80 ? "stamp" : "saffron"}
        />

        {summary.financial?.latest_run ? (
          <KpiCard
            title={t("netPayout")}
            value={formatAmount(summary.financial.latest_run.total_net)}
            subtitle={`${t("currency")} مسير ${summary.financial.latest_run.month}/${summary.financial.latest_run.year}`}
            icon={DollarSign}
            tone="indigo"
          />
        ) : (
          <KpiCard
            title={t("avgRating")}
            value={`${summary.tasks.avg_rating} / 5.0`}
            subtitle="متوسط تقييم جودة الإنجاز"
            icon={ListChecks}
            tone="stamp"
          />
        )}
      </div>

      {/* Detailed Analytics Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Task Efficiency */}
        <TaskEfficiencyCard tasks={summary.tasks} t={t} />

        {/* Attendance Gauge */}
        <AttendanceGaugeCard attendance={summary.attendance} t={t} />

        {/* Workforce & Saudization (Owner & HR) */}
        {summary.workforce && managesPeople && (
          <SaudizationMeter workforce={summary.workforce} t={t} />
        )}

        {/* Financial Summary (Owner & HR) */}
        {summary.financial && managesPeople && (
          <FinancialSummaryCard financial={summary.financial} locale={locale} t={t} />
        )}

        {/* Department Breakdown (Owner & HR) */}
        {summary.departments.length > 0 && managesPeople && summary.workforce && (
          <div className="lg:col-span-2">
            <DepartmentDistribution
              departments={summary.departments}
              totalEmployees={summary.workforce.total_employees}
              t={t}
            />
          </div>
        )}
      </div>
    </main>
  );
}
