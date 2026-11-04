"use client";

import { CalendarPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { createPayrollRun, type PayrollState } from "@/actions/payroll";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";

export function PayrollRunCreateForm() {
  const t = useTranslations("payroll");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(currentMonth);
  const [open, setOpen] = useState(false);

  const [state, action, pending] = useActionState<PayrollState, FormData>(
    async (prev: PayrollState, fd: FormData) => {
      const res = await createPayrollRun(prev, fd);
      if (res?.ok) {
        setOpen(false);
      }
      return res;
    },
    undefined
  );

  const error = state && !state.ok ? tErrors(state.error) : null;

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <CalendarPlus className="size-4" aria-hidden />
        {t("newRun")}
      </Button>
    );
  }

  return (
    <form action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <p className="mb-1 text-card">{t("newRun")}</p>
      <p className="mb-5 text-secondary">{t("creatingRun")}</p>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FormField
          name="year"
          type="number"
          label={t("year")}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          min={2020}
          max={2100}
          required
          dir="ltr"
        />

        <SelectField
          name="month"
          label={t("month")}
          value={String(month)}
          onChange={(e) => setMonth(Number(e.target.value))}
          options={Array.from({ length: 12 }, (_, i) => ({
            value: String(i + 1),
            label: `${i + 1}`,
          }))}
        />

        <FormField
          name="notes"
          label={t("notes")}
          placeholder={t("notesPlaceholder")}
          className="sm:col-span-2 lg:col-span-3"
        />
      </div>

      {error && <p className="mt-4 text-caption text-brick">{error}</p>}

      <div className="mt-5 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "..." : t("createRunSubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
