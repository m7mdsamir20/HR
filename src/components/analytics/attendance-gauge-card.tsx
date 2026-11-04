import { CalendarCheck, Clock, UserCheck, UserX } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { attendanceTone, type AttendanceKpis } from "@/lib/analytics";

interface AttendanceGaugeCardProps {
  attendance: AttendanceKpis;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function AttendanceGaugeCard({ attendance, t }: AttendanceGaugeCardProps) {
  const tone = attendanceTone(attendance.today_rate);

  return (
    <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-control bg-paper text-ink-soft">
            <Clock className="size-4.5" aria-hidden />
          </div>
          <div className="flex flex-col">
            <h3 className="font-semibold text-ink">{t("attendanceTitle")}</h3>
            <span className="text-caption text-secondary">
              {t("todayPresent")}: <strong className="tabular-nums text-ink">{attendance.today_present}</strong>
            </span>
          </div>
        </div>

        <StatusPill tone={tone}>
          {attendance.today_rate}% {t("todayPresent")}
        </StatusPill>
      </div>

      {/* Today Breakdown */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col items-center justify-center rounded-control bg-stamp/10 p-2.5 text-stamp">
          <UserCheck className="size-4 mb-1" aria-hidden />
          <span className="text-caption font-medium">{t("todayOnTime")}</span>
          <span className="text-lg font-bold tabular-nums">{attendance.today_on_time}</span>
        </div>

        <div className="flex flex-col items-center justify-center rounded-control bg-saffron/12 p-2.5 text-saffron">
          <Clock className="size-4 mb-1" aria-hidden />
          <span className="text-caption font-medium">{t("todayLate")}</span>
          <span className="text-lg font-bold tabular-nums">{attendance.today_late}</span>
        </div>

        <div className="flex flex-col items-center justify-center rounded-control bg-brick/10 p-2.5 text-brick">
          <UserX className="size-4 mb-1" aria-hidden />
          <span className="text-caption font-medium">{t("todayAbsent")}</span>
          <span className="text-lg font-bold tabular-nums">{attendance.today_absent}</span>
        </div>
      </div>

      {/* Monthly leaves & deductions footer */}
      <div className="flex items-center justify-between border-t border-line/60 pt-3 text-caption text-secondary">
        <div className="flex items-center gap-1.5">
          <CalendarCheck className="size-4 text-ink-soft" aria-hidden />
          <span>{t("monthLeaves")}:</span>
          <strong className="text-ink tabular-nums text-sm">{attendance.month_leaves}</strong>
        </div>

        <div className="flex items-center gap-1.5">
          <span>{t("monthDeductions")}:</span>
          <strong className="text-ink tabular-nums text-sm">{attendance.month_deductions}</strong>
        </div>
      </div>
    </div>
  );
}
