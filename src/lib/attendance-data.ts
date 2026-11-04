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
