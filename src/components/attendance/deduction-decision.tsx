"use client";

import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { decideDeduction, type AttendanceState } from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Approve a suggested deduction, or waive it with a reason. */
export function DeductionDecision({ id }: { id: string }) {
  const t = useTranslations("attendance.deductions");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  const locale = useLocale();
  const [state, action, pending] = useActionState<AttendanceState, FormData>(decideDeduction, undefined);
  const error =
    state && !state.ok
      ? state.fields?.includes("note")
        ? t("noteRequired")
        : tAttendance.has(state.error)
          ? tAttendance(state.error)
          : tErrors(state.error as "unexpected")
      : undefined;

  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <Input name="note" aria-label={t("note")} placeholder={t("notePlaceholder")} maxLength={500} aria-invalid={error ? true : undefined} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>
          <Check aria-hidden />
          {t("approve")}
        </Button>
        <Button type="submit" name="decision" value="waive" size="sm" variant="secondary" disabled={pending}>
          <X aria-hidden />
          {t("waive")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-brick">
          {error}
        </p>
      )}
    </form>
  );
}
