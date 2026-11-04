import { Banknote, HandCoins, ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { payrollTone, type PayrollStatus } from "@/lib/payroll";
import { formatAmount } from "@/lib/money";
import type { FinancialKpis } from "@/lib/analytics";

interface FinancialSummaryCardProps {
  financial: FinancialKpis;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function FinancialSummaryCard({ financial, t }: FinancialSummaryCardProps) {
  const run = financial.latest_run;

  return (
    <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-control bg-paper text-ink-soft">
            <Banknote className="size-4.5" aria-hidden />
          </div>
          <div className="flex flex-col">
            <h3 className="font-semibold text-ink">{t("financialTitle")}</h3>
            <span className="text-caption text-secondary">
              {run
                ? t("latestRun", { month: run.month, year: run.year })
                : "—"}
            </span>
          </div>
        </div>

        {run && (
          <StatusPill tone={payrollTone[run.status as PayrollStatus]}>
            {run.status}
          </StatusPill>
        )}
      </div>

      {run ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-medium text-secondary">{t("netPayout")}</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums text-ink sm:text-3xl">
                {formatAmount(run.total_net)}
              </span>
              <span className="text-caption text-secondary">{t("currency")}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-line/60 pt-3">
            <div className="flex flex-col">
              <span className="text-caption text-secondary">{t("grossTotal")}</span>
              <span className="font-semibold text-ink tabular-nums text-sm">
                {formatAmount(run.total_gross)} {t("currency")}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-caption text-secondary">{t("gosiEmployer")}</span>
              <span className="font-semibold text-indigo tabular-nums text-sm">
                {formatAmount(run.total_gosi_employer)} {t("currency")}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-caption text-secondary">{t("totalEmployees")}</span>
              <span className="font-semibold text-ink tabular-nums text-sm">
                {run.employee_count}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-caption text-secondary py-4 text-center">
          لم يتم إصدار أي مسير رواتب بعد.
        </p>
      )}

      {/* Advances status footer */}
      <div className="flex items-center justify-between border-t border-line/60 pt-3 text-caption text-secondary">
        <div className="flex items-center gap-1.5">
          <HandCoins className="size-4 text-ink-soft" aria-hidden />
          <span>{t("activeAdvances")}:</span>
          <strong className="text-ink tabular-nums text-sm">{financial.active_advances_count}</strong>
        </div>

        <div className="flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-stamp" aria-hidden />
          <span>{t("advancesBalance")}:</span>
          <strong className="text-ink tabular-nums text-sm">
            {formatAmount(financial.total_advances_balance)} {t("currency")}
          </strong>
        </div>
      </div>
    </div>
  );
}
