import { Download, Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PayrollRunCreateForm } from "@/components/payroll/payroll-run-create-form";
import { PayrollTabs } from "@/components/payroll/payroll-tabs";
import { StatusPill } from "@/components/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { payrollTone, type PayrollStatus } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";

export default async function PayrollPage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "payroll" });
  const isOwnerOrHr = member.role === "owner" || member.role === "hr";

  const supabase = await createClient();

  const [{ data: slips }, { data: recentRuns }] = await Promise.all([
    supabase
      .from("payroll_slips")
      .select(`
        id,
        gross_salary,
        total_deductions,
        net_salary,
        created_at,
        run:payroll_run_id (
          id,
          year,
          month,
          status
        )
      `)
      .eq("employee_id", member.employee_id)
      .order("created_at", { ascending: false }),

    isOwnerOrHr
      ? supabase
          .from("payroll_runs")
          .select("id, year, month, status, total_net, employee_count, created_at")
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-page">{t("title")}</h1>
          <p className="text-secondary">{t("description")}</p>
        </div>
        {isOwnerOrHr && <PayrollRunCreateForm />}
      </div>

      <PayrollTabs role={member.role} />

      {/* Quick summary for HR/Owner */}
      {isOwnerOrHr && (recentRuns ?? []).length > 0 && (
        <section aria-labelledby="recent-runs-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="recent-runs-heading" className="text-section">
              {t("allRuns")}
            </h2>
            <Link href="/payroll/runs" className="text-label text-indigo hover:underline">
              عرض كل المسيرات
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(recentRuns ?? []).map((r) => (
              <div key={r.id} className="flex flex-col justify-between rounded-card border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2 border-b border-line pb-2 mb-2">
                  <span className="font-semibold text-card tabular-nums">
                    {r.month} / {r.year}
                  </span>
                  <StatusPill tone={payrollTone[r.status as PayrollStatus]}>
                    {t(`status.${r.status}`)}
                  </StatusPill>
                </div>
                <div className="flex justify-between text-caption py-1">
                  <span className="text-secondary">{t("employeeCount")}:</span>
                  <span className="font-semibold tabular-nums">{r.employee_count}</span>
                </div>
                <div className="flex justify-between text-caption py-1">
                  <span className="text-secondary">{t("totalNet")}:</span>
                  <span className="font-semibold tabular-nums text-indigo">{r.total_net} SAR</span>
                </div>
                <Link
                  href={`/payroll/runs/${r.id}`}
                  className="mt-3 inline-flex h-9 items-center justify-center gap-1 rounded-control bg-paper px-3 text-caption font-semibold text-ink hover:bg-line transition-colors"
                >
                  <Eye className="size-4" aria-hidden />
                  {t("viewRun")}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Employee payslips */}
      <section aria-labelledby="slips-heading" className="flex flex-col gap-4">
        <h2 id="slips-heading" className="text-section">
          {t("mySlips")}
        </h2>

        {(slips ?? []).length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">
            {t("emptyMine")}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(slips ?? []).map((s) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const run = s.run as any;
              return (
                <div key={s.id} className="flex flex-col justify-between rounded-card border border-line bg-surface p-5 shadow-xs">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
                      <div className="flex flex-col">
                        <span className="text-card font-semibold tabular-nums">
                          {run ? `${run.month} / ${run.year}` : "—"}
                        </span>
                        <span className="text-caption text-ink-soft">قسيمة راتب شهرية</span>
                      </div>
                      {run && (
                        <StatusPill tone={payrollTone[run.status as PayrollStatus]}>
                          {t(`status.${run.status}`)}
                        </StatusPill>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col">
                        <span className="text-caption text-secondary">{t("totalGross")}</span>
                        <span className="tabular-nums font-medium">{s.gross_salary} SAR</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-caption text-secondary">{t("totalDeductions")}</span>
                        <span className="tabular-nums font-medium text-brick">{s.total_deductions} SAR</span>
                      </div>
                    </div>

                    <div className="rounded-control bg-paper p-3 flex items-baseline justify-between">
                      <span className="text-caption text-secondary font-medium">{t("netSalary")}:</span>
                      <span className="text-card font-bold tabular-nums text-indigo">
                        {s.net_salary} <span className="text-caption font-normal">SAR</span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-2">
                    <Link
                      href={`/payroll/slips/${s.id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-caption font-medium text-ink hover:bg-paper"
                    >
                      <Eye className="size-4" aria-hidden />
                      {t("viewSlip")}
                    </Link>

                    <a
                      href={`/payroll/slips/${s.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-caption font-medium text-ink hover:bg-paper"
                    >
                      <Download className="size-4" aria-hidden />
                      {t("downloadPdf")}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
