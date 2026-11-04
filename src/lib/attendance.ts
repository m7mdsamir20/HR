import { toActionError, type ActionError } from "@/lib/errors";
import type { Tone } from "@/components/status-pill";

export const DEDUCTION_KINDS = ["late", "early_departure", "absence"] as const;
export type DeductionKind = (typeof DEDUCTION_KINDS)[number];

export const DEDUCTION_STATUSES = ["pending", "approved", "waived"] as const;
export type DeductionStatus = (typeof DEDUCTION_STATUSES)[number];

// One colour per meaning (CLAUDE.md §6): a decision waiting is saffron, applied is brick, waived is neutral.
export const deductionTone: Record<DeductionStatus, Tone> = { pending: "saffron", approved: "brick", waived: "neutral" };

export type AttendanceError =
  | "invalid"
  | "noShift"
  | "notWorkDay"
  | "shiftOver"
  | "alreadyCheckedIn"
  | "alreadyCheckedOut"
  | "notCheckedIn"
  | "alreadyDecided"
  | "inUse"
  | "duplicate"
  | ActionError;

/** Database error → translated code. Postgres text never reaches the browser (CLAUDE.md §5.8). */
export function attendanceError(error: { code?: string; message?: string } | null, context: string): AttendanceError {
  switch (error?.message) {
    case "no_shift":
      return "noShift";
    case "not_work_day":
      return "notWorkDay";
    case "shift_over":
      return "shiftOver";
    case "already_checked_in":
      return "alreadyCheckedIn";
    case "already_checked_out":
      return "alreadyCheckedOut";
    case "not_checked_in":
      return "notCheckedIn";
    case "already_decided":
      return "alreadyDecided";
    case "invalid_input":
    case "invalid_location":
    case "note_required":
      return "invalid";
    default:
      if (error?.code === "23514") return "invalid";
      if (error?.code === "23505") return "duplicate";
      // A branch or shift still used by employees or records can't be deleted.
      if (error?.code === "23503" && context.startsWith("delete")) return "inUse";
      return toActionError(error, context);
  }
}

/** "08:00:00" → "08:00". */
export const hhmm = (t: string) => t.slice(0, 5);

/** 0.25 → "25%". */
export const percent = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;

/** First and last day (YYYY-MM-DD) of a YYYY-MM month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
