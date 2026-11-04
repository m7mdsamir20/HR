import { useLocale, useTranslations } from "next-intl";
import { StatusPill } from "@/components/status-pill";
import type { Locale } from "@/i18n/routing";
import { formatDayShort, formatDuration, formatTime } from "@/lib/format";

export type DayRow = {
  id: string;
  date: string;
  status: "present" | "absent" | "leave";
  source: "device" | "manual";
  checkIn: string | null;
  checkOut: string | null;
  late: number;
  early: number;
  worked: number | null;
  outside: boolean;
  /** Checked in from a device without sending a position. */
  noLocation: boolean;
  /** The day is over and the departure was never recorded. */
  missingCheckout: boolean;
  note: string | null;
  /** Set on days excused by an approved leave. */
  leaveType?: string;
};

function Flags({ day }: { day: DayRow }) {
  const t = useTranslations("attendance.flags");
  const none = day.status === "present" && !day.late && !day.early && !day.outside && !day.noLocation && !day.missingCheckout;
  return (
    <span className="flex flex-wrap gap-1.5">
      {day.status === "absent" && <StatusPill tone="brick">{t("absent")}</StatusPill>}
      {day.status === "leave" && <StatusPill tone="indigo">{t("leave")}</StatusPill>}
      {day.late > 0 && <StatusPill tone="brick">{t("late", { minutes: day.late })}</StatusPill>}
      {day.early > 0 && <StatusPill tone="saffron">{t("early", { minutes: day.early })}</StatusPill>}
      {day.outside && <StatusPill tone="saffron">{t("outside")}</StatusPill>}
      {day.noLocation && <StatusPill tone="saffron">{t("noLocation")}</StatusPill>}
      {day.missingCheckout && <StatusPill tone="saffron">{t("missingCheckout")}</StatusPill>}
      {day.source === "manual" && <StatusPill tone="neutral">{t("manual")}</StatusPill>}
      {none && <StatusPill tone="stamp">{t("onTime")}</StatusPill>}
    </span>
  );
}

/** One month of days: a table from md up, stacked rows on phones. `action` adds a trailing control per day. */
export function DayRows({ days, action }: { days: DayRow[]; action?: (day: DayRow) => React.ReactNode }) {
  const t = useTranslations("attendance.days");
  const locale = useLocale() as Locale;
  const time = (ts: string | null) => (ts ? <bdi dir="ltr">{formatTime(locale, ts)}</bdi> : "—");

  if (days.length === 0) {
    return <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("empty")}</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
        <table className="w-full text-table">
          <thead>
            <tr className="border-b border-line text-start text-label text-ink-soft">
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("date")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("arrival")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("departure")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("worked")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("notes")}</th>
              {action && <td className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0 align-top">
                <th scope="row" className="px-4 py-3 text-start font-medium">{formatDayShort(locale, d.date)}</th>
                <td className="px-4 py-3 tabular-nums">{time(d.checkIn)}</td>
                <td className="px-4 py-3 tabular-nums">{time(d.checkOut)}</td>
                <td className="px-4 py-3 tabular-nums">{d.worked === null ? "—" : <bdi dir="ltr">{formatDuration(d.worked)}</bdi>}</td>
                <td className="px-4 py-3">
                  <Flags day={d} />
                  {d.note && <p className="mt-1 text-secondary">{d.note}</p>}
                </td>
                {action && <td className="px-4 py-3 text-end">{action(d)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {days.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <p className="text-card">{formatDayShort(locale, d.date)}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-secondary tabular-nums">
              <span>
                {t("arrival")}: {time(d.checkIn)}
              </span>
              <span>
                {t("departure")}: {time(d.checkOut)}
              </span>
              {d.worked !== null && (
                <span>
                  {t("worked")}: <bdi dir="ltr">{formatDuration(d.worked)}</bdi>
                </span>
              )}
            </p>
            <Flags day={d} />
            {d.note && <p className="text-secondary">{d.note}</p>}
            {action && <div>{action(d)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
