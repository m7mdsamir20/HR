"use client";

import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { adjustBalance, cancelLeave, decideLeave, type LeaveState } from "@/actions/leave";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeaveError } from "./use-leave-error";

/** Approve a request at the stage it is in, or reject it with a reason. */
export function LeaveDecision({ id }: { id: string }) {
  const t = useTranslations("leave.inbox");
  const locale = useLocale();
  const errorText = useLeaveError();
  const [state, action, pending] = useActionState<LeaveState, FormData>(decideLeave, undefined);
  const error = state && !state.ok && state.fields?.includes("note") ? t("noteRequired") : errorText(state);

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
        <Button type="submit" name="decision" value="reject" size="sm" variant="secondary" disabled={pending}>
          <X aria-hidden />
          {t("reject")}
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

/** Withdraw a waiting request; cancelling someone's approved leave asks for a reason. */
export function LeaveCancel({ id, needsNote }: { id: string; needsNote: boolean }) {
  const t = useTranslations("leave.cancel");
  const locale = useLocale();
  const errorText = useLeaveError();
  const [state, action, pending] = useActionState<LeaveState, FormData>(cancelLeave, undefined);
  const error = state && !state.ok && state.fields?.includes("note") ? t("noteRequired") : errorText(state);

  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <input type="hidden" name="id" value={id} />
      {needsNote && <Input name="note" aria-label={t("note")} placeholder={t("notePlaceholder")} maxLength={500} aria-invalid={error ? true : undefined} />}
      <Button type="submit" size="sm" variant="ghost" className="w-fit text-brick" disabled={pending}>
        <X aria-hidden />
        {t("submit")}
      </Button>
      {error && (
        <p role="alert" className="text-caption text-brick">
          {error}
        </p>
      )}
    </form>
  );
}

/** Add or remove annual days for an employee, with a reason (opening balance, carry-over, correction). */
export function AdjustForm({ employees }: { employees: { value: string; label: string }[] }) {
  const t = useTranslations("leave.balances.adjust");
  const locale = useLocale();
  const errorText = useLeaveError();
  const [state, action, pending] = useActionState<LeaveState, FormData>(adjustBalance, undefined);
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t("invalid") : undefined);

  return (
    <form action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <p className="mb-1 text-card">{t("title")}</p>
      <p className="mb-5 text-secondary">{t("intro")}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField name="employeeId" label={t("employee")} options={employees} />
        <FormField name="days" label={t("days")} hint={t("daysHint")} inputMode="decimal" required dir="ltr" error={bad("days")} />
        <FormField name="reason" label={t("reason")} required error={bad("reason")} className="sm:col-span-2" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("submit")}
        </Button>
        {state?.ok && <StatusPill tone="stamp">{t("saved")}</StatusPill>}
        {errorText(state) && (
          <p role="alert" className="text-label text-brick">
            {errorText(state)}
          </p>
        )}
      </div>
    </form>
  );
}
