import { ArrowRight, Download } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FactsSection } from "@/components/form-section";
import { StatusPill } from "@/components/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { payrollTone, type PayrollStatus } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";
import { loadNames } from "@/lib/task-data";

export default async function PayslipDetailPage({
  params,
}: PageProps<"/[locale]"> & { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = "ar" as Locale;
  await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "payroll" });
  const supabase = await createClient();

  const { data: slip } = await supabase
    .from("payroll_slips")
    .select(`
      *,
      run:payroll_run_id (
        id,
        year,
        month,
        status,
        approved_at
      )
    `)
    .eq("id", id)
    .single();

  if (!slip) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = slip.run as any;
  const names = await loadNames(locale, [slip.employee_id]);
  const empName = names.get(slip.employee_id) ?? "—";
  const currency = locale === "ar" ? "ر.س" : "SAR";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-secondary text-sm">
        <Link href="/payroll" className="hover:text-ink flex items-center gap-1">
          <ArrowRight className="size-4" aria-hidden />
          {t("backToSlips")}
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-page">
              قسيمة راتب شهر {run ? `${run.month} / ${run.year}` : "—"}
            </h1>
            {run && (
              <StatusPill tone={payrollTone[run.status as PayrollStatus]}>
                {t(`status.${run.status}`)}
              </StatusPill>
            )}
          </div>
          <p className="text-secondary">الموظف: {empName}</p>
        </div>

        <a
          href={`${locale === "en" ? "/en" : ""}/payroll/slips/${slip.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-control bg-indigo px-4 text-sm font-semibold text-white shadow-xs hover:bg-indigo/90 focus-visible:outline-2 focus-visible:outline-indigo"
        >
          <Download className="size-4" aria-hidden />
          {t("downloadPdf")}
        </a>
      </div>

      {/* Net Salary Highlight */}
      <div className="rounded-card border-2 border-indigo bg-indigo/5 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-secondary text-label">{t("netSalary")}</span>
          <p className="text-3xl font-extrabold tabular-nums text-indigo mt-1">
            {slip.net_salary} <span className="text-sm font-normal text-secondary">{currency}</span>
          </p>
        </div>

        <div className="text-sm text-secondary sm:text-end">
          <p>
            {t("bankName")}: <strong className="text-ink">{slip.bank_name || "—"}</strong>
          </p>
          <p className="font-mono mt-0.5">
            {t("iban")}: <strong className="text-ink">{slip.iban || "—"}</strong>
          </p>
        </div>
      </div>

      {/* Earnings & Deductions Sections */}
      <div className="grid gap-6 md:grid-cols-2">
        <FactsSection
          title={t("earnings")}
          items={[
            { label: t("basicSalary"), value: `${slip.basic_salary} ${currency}` },
            { label: t("housingAllowance"), value: `${slip.housing_allowance} ${currency}` },
            { label: t("transportAllowance"), value: `${slip.transport_allowance} ${currency}` },
            { label: t("communicationAllowance"), value: `${slip.communication_allowance} ${currency}` },
            { label: t("otherAllowancesField"), value: `${slip.other_allowances} ${currency}` },
            { label: t("totalGross"), value: `${slip.gross_salary} ${currency}` },
          ]}
        />

        <FactsSection
          title={t("deductions")}
          items={[
            { label: t("gosiEmployee"), value: `${slip.gosi_employee} ${currency}` },
            { label: t("attendanceDeduction"), value: `${slip.attendance_deduction} ${currency}` },
            { label: t("leaveDeduction"), value: `${slip.leave_deduction} ${currency}` },
            { label: t("advanceDeduction"), value: `${slip.advance_deduction} ${currency}` },
            { label: t("otherDeductions"), value: `${slip.other_deductions} ${currency}` },
            { label: t("totalDeductions"), value: `${slip.total_deductions} ${currency}` },
          ]}
        />
      </div>

      {slip.notes && (
        <div className="rounded-card border border-line bg-surface p-4">
          <span className="font-semibold text-secondary block mb-1">{t("notes")}:</span>
          <p className="text-ink text-sm leading-relaxed">{slip.notes}</p>
        </div>
      )}
    </main>
  );
}
