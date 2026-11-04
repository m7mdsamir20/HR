"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { requestLeave, type LeaveState } from "@/actions/leave";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { LEAVE_TYPES } from "@/lib/leave";
import { useLeaveError } from "./use-leave-error";

/** The request form: the type's rule is shown under the picker, and the days are counted on the server. */
export function RequestForm({ today, maxDate, minDate, genderLocked }: { today: string; minDate: string; maxDate: string; genderLocked: "male" | "female" | null }) {
  const t = useTranslations("leave.form");
  const tTypes = useTranslations("leave.types");
  const tHints = useTranslations("leave.typeHints");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useLeaveError();
  const [type, setType] = useState<string>("annual");
  const [sent, setSent] = useState(0);
  const [state, action, pending] = useActionState<LeaveState, FormData>(async (prev: LeaveState, fd: FormData) => {
    const result = await requestLeave(prev, fd);
    if (result?.ok) setSent((n) => n + 1);
    return result;
  }, undefined);
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t("invalid") : undefined);
  // Maternity and newborn leave depend on the employee's gender, so only the one that applies is offered.
  const types = LEAVE_TYPES.filter((x) => !(x === "maternity" && genderLocked === "male") && !(x === "newborn" && genderLocked === "female"));

  return (
    <form key={sent} action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <p className="mb-1 text-card">{t("title")}</p>
      <p className="mb-5 text-secondary">{t("daysNote")}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          name="type"
          label={t("type")}
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={types.map((x) => ({ value: x, label: tTypes(x) }))}
          hint={tHints(type as "annual")}
          className="sm:col-span-2 lg:col-span-2"
        />
        <FormField name="startDate" type="date" label={t("startDate")} min={minDate} max={maxDate} defaultValue={today} required dir="ltr" error={bad("startDate")} />
        <FormField name="endDate" type="date" label={t("endDate")} min={minDate} max={maxDate} defaultValue={today} required dir="ltr" error={bad("endDate")} />
        {type === "sick" && (
          <FormField name="medicalRef" label={t("medicalRef")} hint={t("medicalRefHint")} optionalLabel={tCommon("optional")} dir="ltr" error={bad("medicalRef")} />
        )}
        <FormField name="reason" label={t("reason")} optionalLabel={tCommon("optional")} error={bad("reason")} className="sm:col-span-2 lg:col-span-2" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Send aria-hidden />
          {t("submit")}
        </Button>
        {state?.ok && <StatusPill tone="stamp">{t("sent")}</StatusPill>}
        {errorText(state) && (
          <p role="alert" className="text-label text-brick">
            {errorText(state)}
          </p>
        )}
      </div>
    </form>
  );
}
