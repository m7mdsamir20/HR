"use client";

import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import type { TaskFormState } from "@/actions/tasks";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PRIORITIES } from "@/lib/tasks";
import type { TaskField } from "@/lib/validation/task";

type Props = {
  mode: "create" | "edit";
  action: (prev: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  assignees: { value: string; label: string }[];
  minDate: string;
  defaults?: Partial<Record<TaskField, string>>;
};

export function TaskForm({ mode, action, assignees, minDate, defaults = {} }: Props) {
  const t = useTranslations("tasks");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(action, undefined);

  const failed = state && !state.ok ? state : undefined;
  const v = (f: TaskField) => failed?.values[f] ?? defaults[f] ?? "";
  const err = (f: TaskField) => (failed?.fields?.[f] ? t(`fields.${f}`) : undefined);
  const errorText = failed ? (failed.error === "taskClosed" || failed.error === "taskStarted" || failed.error === "notSubmitted" ? t(`errors.${failed.error}`) : failed.error === "fileType" || failed.error === "fileSize" || failed.error === "tooManyFiles" ? t(`errors.${failed.error}`) : tErrors(failed.error)) : undefined;
  // Re-mount after a failed submit so inputs show the values that were sent back.
  const formKey = failed ? JSON.stringify(failed.values) : "initial";

  if (assignees.length === 0 && mode === "create") {
    return <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("form.noAssignees")}</p>;
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      {errorText && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {errorText}
        </p>
      )}

      <FormSection title={t("form.sections.task")}>
        <FormField name="title" label={t("form.title")} defaultValue={v("title")} error={err("title")} required className="sm:col-span-2" maxLength={200} />
        <FormField name="location" label={t("form.location")} defaultValue={v("location")} error={err("location")} optionalLabel={tCommon("optional")} maxLength={200} />
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3 2xl:col-span-4">
          <Label htmlFor="description">
            {t("form.description")} <span className="text-caption font-normal text-ink-soft">({tCommon("optional")})</span>
          </Label>
          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={4000}
            defaultValue={v("description")}
            aria-invalid={err("description") ? true : undefined}
            aria-describedby="description-hint"
            className="w-full rounded-control border border-input bg-surface px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          <p id="description-hint" className="text-caption text-ink-soft">
            {err("description") ?? t("form.descriptionHint")}
          </p>
        </div>
      </FormSection>

      <FormSection title={t("form.sections.assignment")}>
        <SelectField
          name="assigneeId"
          label={t("form.assignee")}
          defaultValue={v("assigneeId")}
          error={err("assigneeId")}
          options={[{ value: "", label: t("form.chooseAssignee") }, ...assignees]}
        />
        <SelectField
          name="priority"
          label={t("form.priority")}
          defaultValue={v("priority") || "medium"}
          error={err("priority")}
          options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
        />
        <FormField name="dueDate" label={t("form.dueDate")} type="date" min={mode === "create" ? minDate : undefined} defaultValue={v("dueDate")} error={err("dueDate")} required dir="ltr" />
        <FormField name="dueTime" label={t("form.dueTime")} type="time" defaultValue={v("dueTime")} error={err("dueTime")} optionalLabel={tCommon("optional")} dir="ltr" />
        <FormField
          name="expectedHours"
          label={t("form.expectedHours")}
          defaultValue={v("expectedHours")}
          error={err("expectedHours")}
          optionalLabel={tCommon("optional")}
          inputMode="decimal"
          dir="ltr"
        />
      </FormSection>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {mode === "create" ? (pending ? t("form.submitting") : t("form.submit")) : pending ? tCommon("saving") : tCommon("save")}
        </Button>
        {state?.ok && (
          <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("form.saved")}
          </p>
        )}
      </div>
    </form>
  );
}
