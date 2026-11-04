"use client";

import { Edit3 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { adjustPayrollSlip, type PayrollState } from "@/actions/payroll";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export function PayrollSlipAdjustDialog({
  slipId,
  currentOtherAllowances,
  currentOtherDeductions,
  currentNotes,
}: {
  slipId: string;
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

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="gap-1 text-xs">
        <Edit3 className="size-3.5" aria-hidden />
        تعديل
      </Button>
    );
  }

  return (
    <div className="rounded-control border border-line bg-paper p-3 my-2 text-start">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="uiLocale" value={locale} />
        <input type="hidden" name="slipId" value={slipId} />

        <p className="text-label font-semibold">{t("adjustSlipTitle")}</p>

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

          <FormField
            name="notes"
            label={t("adjustNotes")}
            defaultValue={currentNotes ?? ""}
            placeholder="مكافأة إضافية أو خصم خاص..."
            maxLength={300}
            className="sm:col-span-2"
          />
        </div>

        {error && <p className="text-caption text-brick">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "..." : t("adjustSubmit")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
        </div>
      </form>
    </div>
  );
}
