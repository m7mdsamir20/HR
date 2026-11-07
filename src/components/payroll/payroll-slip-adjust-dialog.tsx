"use client";

import { Edit3 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { adjustPayrollSlip, type PayrollState } from "@/actions/payroll";
import { FormField } from "@/components/form-field";
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

export function PayrollSlipAdjustDialog({
  slipId,
  employeeName,
  currentOtherAllowances,
  currentOtherDeductions,
  currentNotes,
}: {
  slipId: string;
  employeeName?: string;
  currentOtherAllowances: number;
  currentOtherDeductions: number;
  currentNotes?: string | null;
}) {
  const t = useTranslations("payroll");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const [state, action, pending] = useActionState<PayrollState, FormData>(
    async (prev: PayrollState, fd: FormData) => {
      const res = await adjustPayrollSlip(prev, fd);
      if (res?.ok) {
        setOpen(false);
      }
      return res;
    },
    undefined
  );

  const error = state && !state.ok ? tErrors(state.error) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1 text-xs text-secondary hover:text-ink">
          <Edit3 className="size-3.5" aria-hidden />
          تعديل
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink font-bold">
            <Edit3 className="size-5 text-indigo" />
            <span>{t("adjustSlipTitle")}</span>
          </DialogTitle>
          {employeeName && (
            <DialogDescription className="text-secondary text-sm">
              {locale === "ar" ? `الموظف: ${employeeName}` : `Employee: ${employeeName}`}
            </DialogDescription>
          )}
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4 mt-2">
          <input type="hidden" name="uiLocale" value={locale} />
          <input type="hidden" name="slipId" value={slipId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              name="otherAllowances"
              type="number"
              label={t("otherAllowances")}
              defaultValue={currentOtherAllowances}
              min={0}
              step={50}
              required
              dir="ltr"
            />

            <FormField
              name="otherDeductions"
              type="number"
              label={t("otherDeductions")}
              defaultValue={currentOtherDeductions}
              min={0}
              step={50}
              required
              dir="ltr"
            />
          </div>

          <FormField
            name="notes"
            label={t("adjustNotes")}
            defaultValue={currentNotes ?? ""}
            placeholder={locale === "ar" ? "سبب الخصم أو المكافأة الإضافية..." : "Reason for adjustment..."}
            maxLength={300}
          />

          {error && <p className="text-caption text-brick">{error}</p>}

          <DialogFooter className="mt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "..." : t("adjustSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
