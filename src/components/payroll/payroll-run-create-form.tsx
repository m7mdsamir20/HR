"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { createPayrollRun, type PayrollState } from "@/actions/payroll";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

  const error = state && !state.ok ? (tErrors.has(state.error) ? tErrors(state.error) : tErrors("unexpected")) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <CalendarPlus className="size-4" aria-hidden />
          {t("newRun")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary font-bold">
            <CalendarPlus className="size-5 text-indigo" />
            {t("newRun")}
          </DialogTitle>
          <DialogDescription>{t("creatingRun")}</DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4 mt-2" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <FormField
            name="notes"
            label={t("notes")}
            placeholder={t("notesPlaceholder")}
          />

          {error && (
            <p role="alert" className="text-caption font-medium text-brick bg-brick/10 p-2.5 rounded-card border border-brick/20">
              {error}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={pending} className="gap-2">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? (locale === "ar" ? "جاري الإنشاء..." : "Creating...") : t("createRunSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
