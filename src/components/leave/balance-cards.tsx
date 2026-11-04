import { useTranslations } from "next-intl";
import { StatusPill } from "@/components/status-pill";
import { formatDays, type LeaveBalance } from "@/lib/leave";

/** What the employee has left: annual days, sick days this year, and whether the Hajj leave is spent. */
export function BalanceCards({ balance: b }: { balance: LeaveBalance }) {
  const t = useTranslations("leave.balance");
  const low = b.annual_remaining <= 3;

  return (
    <section aria-labelledby="balance-heading" className="flex flex-col gap-4">
      <h2 id="balance-heading" className="text-section">
        {t("title")}
      </h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-6">
          <p className="text-card">{t("annual")}</p>
          <p className="flex items-baseline gap-2">
            <span className={`text-stat tabular-nums ${low ? "text-brick" : "text-ink"}`}>{formatDays(b.annual_remaining)}</span>
            <span className="text-secondary">{t("remaining")}</span>
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-secondary tabular-nums">
            <dt>{t("earned")}</dt>
            <dd className="text-end">{formatDays(b.annual_earned)}</dd>
            {b.annual_adjustments !== 0 && (
              <>
                <dt>{t("adjustments")}</dt>
                <dd className="text-end">{formatDays(b.annual_adjustments)}</dd>
              </>
            )}
            <dt>{t("used")}</dt>
            <dd className="text-end">{formatDays(b.annual_used)}</dd>
            <dt>{t("pending")}</dt>
            <dd className="text-end">{formatDays(b.annual_pending)}</dd>
          </dl>
          <p className="text-secondary">
            {t("entitlement", { days: b.annual_entitlement })} · {t("service", { years: b.years_of_service })}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-6">
          <p className="text-card">{t("sick")}</p>
          <p className="flex items-baseline gap-2">
            <span className="text-stat tabular-nums">{b.sick_remaining}</span>
            <span className="text-secondary">{t("sickRemaining")}</span>
          </p>
          <p className="text-secondary tabular-nums">{t("sickUsed", { used: b.sick_used + b.sick_pending })}</p>
          <p className="text-secondary">{t("sickTiers")}</p>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-6">
          <p className="text-card">{t("hajj")}</p>
          <p>{b.hajj_taken ? <StatusPill tone="neutral">{t("hajjTaken")}</StatusPill> : <StatusPill tone="stamp">{t("hajjAvailable")}</StatusPill>}</p>
          <p className="text-secondary">{t("hajjNote")}</p>
        </div>
      </div>
    </section>
  );
}
