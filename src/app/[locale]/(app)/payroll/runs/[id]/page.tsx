import { ArrowRight, Eye } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PayrollRunActions } from "@/components/payroll/payroll-run-actions";
import { PayrollSlipAdjustDialog } from "@/components/payroll/payroll-slip-adjust-dialog";
import { StatusPill } from "@/components/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { payrollTone, type PayrollStatus } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";
import { loadNames } from "@/lib/task-data";

export default async function PayrollRunDetailPage({
  params,
}: PageProps<"/[locale]"> & { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = "ar" as Locale;
  const member = await requireMember(locale);
  if (member.role !== "owner" && member.role !== "admin" && member.role !== "hr") {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "payroll" });
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .single();

  if (!run) {
    notFound();
  }

  const { data: slips } = await supabase
    .from("payroll_slips")
    .select(`
      id,
      employee_id,
      basic_salary,
      housing_allowance,
      transport_allowance,
      communication_allowance,
      other_allowances,
      gross_salary,
      gosi_employee,
      attendance_deduction,
      leave_deduction,
      advance_deduction,
      other_deductions,
      total_deductions,
      net_salary,
      notes,
      bank_name,
      iban
    `)
    .eq("payroll_run_id", id);

  const employeeIds = (slips ?? []).map((s) => s.employee_id);
  const names = await loadNames(locale, employeeIds);

  const isOwner = member.role === "owner";
  const isDraft = run.status === "draft";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-secondary text-sm">
        <Link href="/payroll/runs" className="hover:text-ink flex items-center gap-1">
          <ArrowRight className="size-4" aria-hidden />
          {t("backToRuns")}
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-line pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-page">
              مسير شهر {run.month} / {run.year}
            </h1>
            <StatusPill tone={payrollTone[run.status as PayrollStatus]}>
              {t(`status.${run.status}`)}
            </StatusPill>
          </div>
          {run.notes && <p className="text-secondary">{run.notes}</p>}
        </div>

        <PayrollRunActions runId={run.id} isOwner={isOwner} isDraft={isDraft} />
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <span className="text-secondary text-caption">{t("employeeCount")}</span>
          <p className="text-card font-bold tabular-nums mt-1">{run.employee_count}</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <span className="text-secondary text-caption">{t("totalGross")}</span>
          <p className="text-card font-bold tabular-nums mt-1">{run.total_gross} SAR</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <span className="text-secondary text-caption">{t("totalDeductions")}</span>
          <p className="text-card font-bold tabular-nums mt-1 text-brick">{run.total_deductions} SAR</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 border-indigo/30 bg-indigo/5">
          <span className="text-secondary text-caption">{t("totalNet")}</span>
          <p className="text-card font-bold tabular-nums mt-1 text-indigo">{run.total_net} SAR</p>
        </div>
      </div>

      {/* Slips table */}
      <section aria-labelledby="slips-table-heading" className="flex flex-col gap-4">
        <h2 id="slips-table-heading" className="text-section">
          قسائم رواتب الموظفين ({slips?.length ?? 0})
        </h2>

        {(slips ?? []).length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">
            لا يوجد موظفون في هذا المسير.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-line bg-paper text-secondary">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t("employeeCount")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("basicSalary")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("housingAllowance")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("gosiEmployee")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("attendanceDeduction")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("advanceDeduction")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("otherAllowances")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("netSalary")}</th>
                  <th className="px-4 py-3 text-end font-medium">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(slips ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-paper/50 transition-colors">
                    <td className="px-4 py-3 font-semibold">{names.get(s.employee_id) ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{s.basic_salary}</td>
                    <td className="px-4 py-3 tabular-nums">{s.housing_allowance}</td>
                    <td className="px-4 py-3 tabular-nums text-brick">{s.gosi_employee}</td>
                    <td className="px-4 py-3 tabular-nums text-brick">{s.attendance_deduction}</td>
                    <td className="px-4 py-3 tabular-nums text-brick">{s.advance_deduction}</td>
                    <td className="px-4 py-3 tabular-nums text-stamp">{s.other_allowances}</td>
                    <td className="px-4 py-3 font-bold tabular-nums text-indigo">{s.net_salary} SAR</td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/payroll/slips/${s.id}`}
                          className="inline-flex h-8 items-center gap-1 rounded-control bg-paper px-2 text-xs font-semibold text-ink hover:bg-line"
                        >
                          <Eye className="size-3.5" aria-hidden />
                          عرض
                        </Link>
                        {isDraft && (
                          <PayrollSlipAdjustDialog
                            slipId={s.id}
                            currentOtherAllowances={Number(s.other_allowances)}
                            currentOtherDeductions={Number(s.other_deductions)}
                            currentNotes={s.notes}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

