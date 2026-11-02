import type { Tone } from "@/components/status-pill";
import { daysBetween, todayInRiyadh } from "@/lib/format";

export type CompanyState = "active" | "expiring" | "expired" | "suspended";

/** Days before the end date at which a subscription shows as "ending soon". */
export const EXPIRING_WITHIN_DAYS = 30;

export function companyState(
  company: { status: "active" | "suspended"; subscription_ends_at: string },
  today: string = todayInRiyadh(),
): CompanyState {
  if (company.status === "suspended") return "suspended";
  const left = daysBetween(today, company.subscription_ends_at);
  if (left < 0) return "expired";
  if (left <= EXPIRING_WITHIN_DAYS) return "expiring";
  return "active";
}

export const companyStateTone: Record<CompanyState, Tone> = {
  active: "stamp",
  expiring: "saffron",
  expired: "brick",
  suspended: "brick",
};
