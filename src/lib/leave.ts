import type { Tone } from "@/components/status-pill";
import { toActionError, type ActionError } from "@/lib/errors";

export const LEAVE_TYPES = ["annual", "sick", "marriage", "death", "newborn", "hajj", "maternity"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["pending_manager", "pending_hr", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

// One colour per meaning (CLAUDE.md §6): waiting is saffron, approved is stamp green, rejected is brick.
export const leaveTone: Record<LeaveStatus, Tone> = {
  pending_manager: "saffron",
  pending_hr: "saffron",
  approved: "stamp",
  rejected: "brick",
  cancelled: "neutral",
};

export type LeaveError =
  | "invalid"
  | "noShift"
  | "overlap"
  | "insufficientBalance"
  | "noWorkingDays"
  | "invalidDates"
  | "crossYear"
  | "sickLimit"
  | "specialLimit"
  | "genderRequired"
  | "hajjUsed"
  | "hajjService"
  | "alreadyDecided"
  | ActionError;

/** Database error → translated code. Postgres text never reaches the browser (CLAUDE.md §5.8). */
export function leaveError(error: { code?: string; message?: string } | null, context: string): LeaveError {
  switch (error?.message) {
    case "no_shift":
      return "noShift";
    case "overlap":
      return "overlap";
    case "insufficient_balance":
      return "insufficientBalance";
    case "no_working_days":
      return "noWorkingDays";
    case "invalid_dates":
      return "invalidDates";
    case "cross_year":
      return "crossYear";
    case "sick_limit":
      return "sickLimit";
    case "special_limit":
      return "specialLimit";
    case "gender_required":
      return "genderRequired";
    case "hajj_used":
      return "hajjUsed";
    case "hajj_service":
      return "hajjService";
    case "already_decided":
      return "alreadyDecided";
    case "invalid_input":
    case "note_required":
      return "invalid";
    default:
      return error?.code === "23514" ? "invalid" : toActionError(error, context);
  }
}

export type LeaveBalance = {
  years_of_service: number;
  annual_entitlement: number;
  annual_earned: number;
  annual_adjustments: number;
  annual_used: number;
  annual_pending: number;
  annual_remaining: number;
  sick_used: number;
  sick_pending: number;
  sick_remaining: number;
  hajj_taken: boolean;
};

/** Days as the UI shows them: whole numbers plain, halves with one decimal. */
export const formatDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
