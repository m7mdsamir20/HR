"use client";

import { useTranslations } from "next-intl";
import type { LeaveState } from "@/actions/leave";

/** Turns a failed leave action into text: leave-specific messages first, then the shared ones. */
export function useLeaveError() {
  const t = useTranslations("leave.errors");
  const tErrors = useTranslations("errors");
  return (state: LeaveState): string | undefined => {
    if (!state || state.ok) return undefined;
    return t.has(state.error) ? t(state.error) : tErrors(state.error as "unexpected");
  };
}
