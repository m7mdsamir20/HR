import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { leaveTone, type LeaveStatus, type LeaveType } from "@/lib/leave";

export type LeaveRow = {
  id: string;
  employeeName?: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  reason: string | null;
  medicalRef: string | null;
  decisionNote: string | null;
  daysFull: number | null;
  daysThreeQuarter: number | null;
  daysUnpaid: number | null;
};

/** One leave request. `children` holds the controls (decide, cancel) for whoever may use them. */
export function LeaveCard({ row: r, children }: { row: LeaveRow; children?: React.ReactNode }) {
  const t = useTranslations("leave");
  const locale = useLocale() as Locale;
  const range = r.startDate === r.endDate ? formatDate(locale, r.startDate) : `${formatDate(locale, r.startDate)} – ${formatDate(locale, r.endDate)}`;
  const reduced = (r.daysThreeQuarter ?? 0) > 0 || (r.daysUnpaid ?? 0) > 0;

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          {r.employeeName && <span className="text-card">{r.employeeName}</span>}
          <span className={r.employeeName ? "text-secondary" : "text-card"}>{t(`types.${r.type}`)}</span>
        </div>
        <StatusPill tone={leaveTone[r.status]}>{t(`status.${r.status}`)}</StatusPill>
      </div>
      <p className="text-secondary">
        {range} · <span className="tabular-nums">{t("requests.days", { days: r.days })}</span>
      </p>
      {r.status === "approved" && reduced && (
        <p className="text-secondary">
          {t("requests.paySplit", { full: r.daysFull ?? 0, three: r.daysThreeQuarter ?? 0, unpaid: r.daysUnpaid ?? 0 })}
        </p>
      )}
      {r.reason && <p>{r.reason}</p>}
      {r.medicalRef && (
        <p className="text-secondary">
          {t("requests.medicalRef")}: <bdi dir="ltr">{r.medicalRef}</bdi>
        </p>
      )}
      {r.decisionNote && <p className="text-secondary">{r.decisionNote}</p>}
      {r.status === "approved" && (
        <Button asChild variant="secondary" size="sm" className="w-fit">
          <a href={`${locale === "en" ? "/en" : ""}/leave/${r.id}/pdf`} target="_blank" rel="noopener noreferrer">
            <FileText aria-hidden />
            {t("requests.pdf")}
          </a>
        </Button>
      )}
      {children}
    </li>
  );
}
