import { Eye, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PayrollRunCreateForm } from "@/components/payroll/payroll-run-create-form";
import { PayrollTabs } from "@/components/payroll/payroll-tabs";
import { StatusPill } from "@/components/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { payrollTone, type PayrollStatus } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";

export default async function PayrollRunsPage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  if (member.role !== "owner" && member.role !== "admin" && member.role !== "hr") {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "payroll" });
  const supabase = await createClient();

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, year, month, status, employee_count, total_gross, total_deductions, total_net, notes, created_at, approved_at")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-page">{t("title")}</h1>
          <p className="text-secondary">{t("description")}</p>
        </div>
        <PayrollRunCreateForm />
      </div>

      <PayrollTabs role={member.role} />

      <section aria-labelledby="all-runs-heading" className="flex flex-col gap-4">
        <h2 id="all-runs-heading" className="text-section">
          {t("allRuns")}
        </h2>

        {(runs ?? []).length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">
            {t("emptyRuns")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-line bg-paper text-secondary">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t("period")}</th>
                  <th className="px-4 py-3 text-start font-medium">الحالة</th>
                  <th className="px-4 py-3 text-start font-medium">{t("employeeCount")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("totalGross")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("totalDeductions")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("totalNet")}</th>
                  <th className="px-4 py-3 text-end font-medium">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-paper/50 transition-colors">
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {r.month} / {r.year}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={payrollTone[r.status as PayrollStatus]}>
                        {t(`status.${r.status}`)}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.employee_count}</td>
                    <td className="px-4 py-3 tabular-nums">{r.total_gross} <span className="text-xs font-normal text-secondary">ر.س</span></td>
                    <td className="px-4 py-3 tabular-nums text-brick">{r.total_deductions} <span className="text-xs font-normal text-secondary">ر.س</span></td>
                    <td className="px-4 py-3 font-bold tabular-nums text-indigo">{r.total_net} <span className="text-xs font-normal text-secondary">ر.س</span></td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`${locale === "en" ? "/en" : ""}/payroll/runs/${r.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={r.status === "draft" ? t("printDraft") : t("printApproved")}
                          className="inline-flex h-8 items-center gap-1 rounded-control bg-paper px-2.5 text-xs font-semibold text-ink hover:bg-line"
                        >
                          <Printer className="size-3.5" aria-hidden />
                          <span>{r.status === "draft" ? t("printDraftShort") : t("printApprovedShort")}</span>
                        </a>
                        <Link
                          href={`/payroll/runs/${r.id}`}
                          className="inline-flex h-8 items-center gap-1 rounded-control bg-paper px-2.5 text-xs font-semibold text-ink hover:bg-line"
                        >
                          <Eye className="size-3.5" aria-hidden />
                          {t("viewRun")}
                        </Link>
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
