import { AlertTriangle, Users } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { saudizationTone, type WorkforceKpis } from "@/lib/analytics";

interface SaudizationMeterProps {
  workforce: WorkforceKpis;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function SaudizationMeter({ workforce, t }: SaudizationMeterProps) {
  const rate = workforce.saudization_rate ?? 0;
  const tone = saudizationTone(rate);
  const isSafe = rate >= 25;

  return (
    <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-control bg-paper text-ink-soft">
            <Users className="size-4.5" aria-hidden />
          </div>
          <div className="flex flex-col">
            <h3 className="font-semibold text-ink">{t("workforceTitle")}</h3>
            <span className="text-caption text-secondary">
              {t("totalEmployees")}: <strong className="tabular-nums text-ink">{workforce.total_employees}</strong>
            </span>
          </div>
        </div>

        <StatusPill tone={tone}>
          {isSafe ? t("nitaqatSafe") : t("nitaqatWarning")}
        </StatusPill>
      </div>

      {/* Saudization Rate Big Stat & Bar */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-caption font-medium text-secondary">{t("saudizationRate")}</span>
          <span className="text-2xl font-bold tabular-nums text-ink sm:text-3xl">
            {rate}%
          </span>
        </div>

        {/* Dual Progress Bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper">
          <div
            className="h-full bg-stamp transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
            title={`${t("saudiCount")}: ${rate}%`}
          />
          <div
            className="h-full bg-indigo/30 transition-all duration-500"
            style={{ width: `${Math.max(0, 100 - rate)}%` }}
            title={`${t("expatCount")}: ${100 - rate}%`}
          />
        </div>

        <div className="flex items-center justify-between text-caption text-secondary pt-1">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-stamp" aria-hidden />
            {t("saudiCount")}: <span className="font-semibold text-ink tabular-nums">{workforce.saudi_count ?? 0}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-indigo/40" aria-hidden />
            {t("expatCount")}: <span className="font-semibold text-ink tabular-nums">{workforce.expat_count ?? 0}</span>
          </span>
        </div>
      </div>

      {/* Expiry alerts footer if any */}
      {((workforce.expiring_docs_30d ?? 0) > 0 || (workforce.critical_docs_15d ?? 0) > 0) && (
        <div className="flex items-center justify-between rounded-control border border-saffron/30 bg-saffron/10 px-3 py-2 text-caption text-saffron">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {t("expiringDocs")}
          </span>
          <span className="font-bold tabular-nums">
            {workforce.expiring_docs_30d}
          </span>
        </div>
      )}
    </div>
  );
}

