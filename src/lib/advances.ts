import type { Tone } from "@/components/status-pill";
import { toActionError, type ActionError } from "@/lib/errors";

export const ADVANCE_STATUSES = ["pending", "approved", "rejected", "cancelled", "completed"] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

// One colour per meaning (CLAUDE.md §6):
// waiting is saffron, approved is stamp green, completed is indigo, rejected is brick, cancelled is neutral.
export const advanceTone: Record<AdvanceStatus, Tone> = {
  pending: "saffron",
  approved: "stamp",
  completed: "indigo",
  rejected: "brick",
  cancelled: "neutral",
};

export type AdvanceError =
  | "invalid"
  | "unauthenticated"
  | "invalidAmount"
  | "invalidInstallments"
  | "invalidReason"
  | "noCompensationRecord"
  | "installmentExceedsSalaryLimit"
  | "existingActiveAdvance"
  | "noteRequired"
  | "notPending"
  | "cannotDecideOwn"
  | "amountExceedsRemaining"
  | "notApproved"
  | ActionError;

/** Database error → translated code. Postgres text never reaches the browser (CLAUDE.md §5.8). */
export function advancesError(error: { code?: string; message?: string } | null, context: string): AdvanceError {
  switch (error?.message) {
    case "invalid_amount":
      return "invalidAmount";
    case "invalid_installments":
      return "invalidInstallments";
    case "invalid_reason":
      return "invalidReason";
    case "no_compensation_record":
      return "noCompensationRecord";
    case "installment_exceeds_salary_limit":
      return "installmentExceedsSalaryLimit";
    case "existing_active_advance":
      return "existingActiveAdvance";
    case "note_required":
      return "noteRequired";
    case "not_pending":
      return "notPending";
    case "cannot_decide_own_request":
      return "cannotDecideOwn";
    case "amount_exceeds_remaining":
      return "amountExceedsRemaining";
    case "not_an_approved_advance":
      return "notApproved";
    default:
      return toActionError(error, context);
  }
}
