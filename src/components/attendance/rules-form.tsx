"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { type AttendanceState } from "@/actions/attendance";
import { saveRules } from "@/actions/attendance-setup";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";

export type Rules = {
  tier1Minutes: number;
  tier2Minutes: number;
  tier3Minutes: number;
  tier1Percent: number;
  tier2Percent: number;
  tier3Percent: number;
  tier4Percent: number;
  earlyGraceMinutes: number;
  absencePercent: number;
};

/** The deduction tiers. Owner edits; HR sees them read-only so they can explain a suggestion. */
export function RulesForm({ rules, canEdit }: { rules: Rules; canEdit: boolean }) {
  const t = useTranslations("attendance.rules");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  const locale = useLocale();
  const [state, action, pending] = useActionState<AttendanceState, FormData>(saveRules, undefined);
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t("invalid") : undefined);
  const error =
    state && !state.ok && state.error !== "invalid" ? (tAttendance.has(state.error) ? tAttendance(state.error) : tErrors(state.error as "unexpected")) : undefined;
  const ro = { readOnly: !canEdit, inputMode: "numeric" as const, dir: "ltr" as const };

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <div className="flex flex-col gap-1">
        <h2 className="text-section">{t("title")}</h2>
        <p className="text-secondary">{canEdit ? t("intro") : t("introReadOnly")}</p>
      </div>

      <fieldset className="min-w-0 rounded-card border border-line bg-surface p-4 md:p-6">
        <legend className="sr-only">{t("late")}</legend>
        <div className="mb-5 flex flex-col gap-1" aria-hidden>
          <p className="text-card">{t("late")}</p>
          <p className="text-secondary">{t("lateHint")}</p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Minutes thresholds: Tier 1, Tier 2, Tier 3 */}
          <div className="grid gap-5 sm:grid-cols-3">
            <FormField name="tier1Minutes" label={t("tier1Minutes")} defaultValue={rules.tier1Minutes} error={bad("tier1Minutes")} {...ro} />
            <FormField name="tier2Minutes" label={t("tier2Minutes")} defaultValue={rules.tier2Minutes} error={bad("tier2Minutes")} {...ro} />
            <FormField name="tier3Minutes" label={t("tier3Minutes")} defaultValue={rules.tier3Minutes} error={bad("tier3Minutes")} {...ro} />
          </div>

          {/* Deduction percentages: Tier 1, Tier 2, Tier 3, Tier 4 - all 4 side-by-side in the row below */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FormField name="tier1Percent" label={t("tier1Percent")} hint={t("warningHint")} defaultValue={rules.tier1Percent} error={bad("tier1Percent")} {...ro} />
            <FormField name="tier2Percent" label={t("tier2Percent")} defaultValue={rules.tier2Percent} error={bad("tier2Percent")} {...ro} />
            <FormField name="tier3Percent" label={t("tier3Percent")} defaultValue={rules.tier3Percent} error={bad("tier3Percent")} {...ro} />
            <FormField name="tier4Percent" label={t("tier4Percent")} defaultValue={rules.tier4Percent} error={bad("tier4Percent")} {...ro} />
          </div>
        </div>
      </fieldset>

      <FormSection title={t("otherTitle")}>
        <FormField name="earlyGraceMinutes" label={t("earlyGrace")} hint={t("earlyGraceHint")} defaultValue={rules.earlyGraceMinutes} error={bad("earlyGraceMinutes")} {...ro} />
        <FormField name="absencePercent" label={t("absencePercent")} defaultValue={rules.absencePercent} error={bad("absencePercent")} {...ro} />
      </FormSection>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
          {error && (
            <p role="alert" className="text-label text-brick">
              {error}
            </p>
          )}
          {state?.ok && (
            <p role="status" className="text-label text-stamp">
              {t("saved")}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
