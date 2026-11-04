import "server-only";
import type { DayRow } from "@/components/attendance/day-rows";
import { todayInRiyadh } from "@/lib/format";
import { monthSchema } from "@/lib/validation/attendance";

/** The columns the day lists read from attendance_records. */
export const RECORD_COLUMNS =
  "id, employee_id, work_date, status, source, check_in_at, check_out_at, late_minutes, early_minutes, worked_minutes, check_in_outside, check_out_outside, check_in_lat, check_out_lat, correction_note";

type RecordRow = {
  id: string;
  work_date: string;
  status: string;
  source: string;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_minutes: number;
  worked_minutes: number | null;
  check_in_outside: boolean;
  check_out_outside: boolean;
  check_in_lat: number | null;
  check_out_lat: number | null;
  correction_note: string | null;
};

export function toDayRow(r: RecordRow, today: string = todayInRiyadh()): DayRow {
  const present = r.status === "present";
  return {
    id: r.id,
    date: r.work_date,
    status: present ? "present" : "absent",
    source: r.source === "manual" ? "manual" : "device",
    checkIn: r.check_in_at,
    checkOut: r.check_out_at,
    late: r.late_minutes,
    early: r.early_minutes,
    worked: r.worked_minutes,
    // A missing position is flagged on its own (noLocation); "outside" means a position beyond the radius.
    outside: (r.check_in_outside && r.check_in_lat !== null) || (r.check_out_outside && r.check_out_lat !== null),
    noLocation: present && r.source === "device" && r.check_in_lat === null,
    missingCheckout: present && r.check_out_at === null && r.work_date < today,
    note: r.correction_note,
  };
}

/** The `month` search param (YYYY-MM) if it is one, else the current month in Riyadh. */
export function monthParam(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  const parsed = monthSchema.safeParse(v);
  return parsed.success ? parsed.data : todayInRiyadh().slice(0, 7);
}

export type LeaveSpan = { id: string; type: string; start_date: string; end_date: string };

/** Working days (per the shift's weekdays) of the approved leaves that fall in the month and have no record. */
export function leaveDates(spans: LeaveSpan[], range: { from: string; to: string }, workDays: number[], recorded: ReadonlySet<string>): { date: string; span: LeaveSpan }[] {
  const out: { date: string; span: LeaveSpan }[] = [];
  const seen = new Set<string>();
  for (const span of spans) {
    const last = span.end_date < range.to ? span.end_date : range.to;
    for (let d = span.start_date > range.from ? span.start_date : range.from; d <= last; d = new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10)) {
      if (recorded.has(d) || seen.has(d) || !workDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) continue;
      seen.add(d);
      out.push({ date: d, span });
    }
  }
  return out;
}

/** Day rows for leave days, to merge with the attendance records of the same month. */
export function leaveDayRows(spans: LeaveSpan[], range: { from: string; to: string }, workDays: number[], recorded: ReadonlySet<string>): DayRow[] {
  return leaveDates(spans, range, workDays, recorded).map(({ date, span }) => ({
    id: `leave-${span.id}-${date}`,
    date,
    status: "leave",
    source: "device",
    checkIn: null,
    checkOut: null,
    late: 0,
    early: 0,
    worked: null,
    outside: false,
    noLocation: false,
    missingCheckout: false,
    note: null,
    leaveType: span.type,
  }));
}
