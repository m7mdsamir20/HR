"use client";

import { Check, HandCoins, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { createManualAdvance, type AdvanceState } from "@/actions/advances";
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
import type { Locale } from "@/i18n/routing";

export interface EmployeeOption {
  id: string;
  full_name_ar: string;
  full_name_en: string | null;
  employee_number: string | null;
}

interface ManualAdvanceDialogProps {
  employees: EmployeeOption[];
}

export function ManualAdvanceDialog({ employees }: ManualAdvanceDialogProps) {
  const t = useTranslations("advances.manualAdvance");
  const tErrors = useTranslations("errors");
  const locale = useLocale() as Locale;

  const [open, setOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(employees[0]?.id || "");
  const [amount, setAmount] = useState<number>(3000);
  const [installments, setInstallments] = useState<number>(3);

  const [state, action, pending] = useActionState<AdvanceState, FormData>(async (prev, fd) => {
    const res = await createManualAdvance(prev, fd);
    return res;
  }, undefined);

  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => {
        setOpen(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${locale === "en" && e.full_name_en ? e.full_name_en : e.full_name_ar}${e.employee_number ? ` (${e.employee_number})` : ""}`,
  }));

  const invalid = (field: string) => (state && !state.ok && state.fields?.includes(field) ? tErrors("invalid") : undefined);
  const errorText = state && !state.ok ? (tErrors.has(state.error) ? tErrors(state.error) : tErrors("unexpected")) : undefined;
  const estimatedMonthly = installments > 0 ? (amount / installments).toFixed(2) : "0.00";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <HandCoins className="size-4" />
          <span>{t("button")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary font-bold">
            <HandCoins className="size-5 text-indigo" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4 mt-2" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />

          <SelectField
            name="employeeId"
            label={t("employee")}
            options={employeeOptions}
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            required
            error={invalid("employeeId")}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              name="amount"
              type="number"
              label={t("amount")}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              min={100}
              max={100000}
              step={100}
              required
              dir="ltr"
              error={invalid("amount")}
            />

            <SelectField
              name="installmentsCount"
              label={t("installmentsCount")}
              value={String(installments)}
              onChange={(e) => setInstallments(Number(e.target.value) || 1)}
              options={Array.from({ length: 24 }, (_, i) => ({
                value: String(i + 1),
                label: `${i + 1} ${locale === "ar" ? "أشهر" : "months"}`,
              }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-control border border-line bg-paper p-3 text-sm">
            <span className="text-secondary">{t("monthly")}:</span>
            <span className="font-bold tabular-nums text-indigo">
              {estimatedMonthly} <span className="text-caption font-normal">{locale === "ar" ? "ر.س" : "SAR"}</span>
            </span>
          </div>

          <FormField
            name="reason"
            label={t("reason")}
            defaultValue={t("reasonDefault")}
            required
            error={invalid("reason")}
          />

          {errorText && (
            <p role="alert" className="text-caption font-medium text-brick bg-brick/10 p-2.5 rounded-card border border-brick/20">
              {errorText}
            </p>
          )}

          {state?.ok && (
            <p role="status" className="flex items-center gap-1.5 text-caption font-medium text-emerald-600 bg-emerald-500/10 p-2.5 rounded-card border border-emerald-500/20">
              <Check className="size-4" />
              {t("success")}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="gap-2">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
