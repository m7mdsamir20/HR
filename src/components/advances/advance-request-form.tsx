"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { requestAdvance, type AdvanceState } from "@/actions/advances";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";

export function AdvanceRequestForm() {
  const t = useTranslations("advances");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [amount, setAmount] = useState<number>(3000);
  const [installments, setInstallments] = useState<number>(3);
  const [sent, setSent] = useState(0);

  const [state, action, pending] = useActionState<AdvanceState, FormData>(
    async (prev: AdvanceState, fd: FormData) => {
      const result = await requestAdvance(prev, fd);
      if (result?.ok) {
        setSent((n) => n + 1);
      }
      return result;
    },
    undefined
  );

  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? tErrors("invalid") : undefined);
  const errorMessage = state && !state.ok ? tErrors(state.error) : null;
  const estimatedMonthly = installments > 0 ? (amount / installments).toFixed(2) : "0.00";

  return (
    <form key={sent} action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <p className="mb-1 text-card">{t("requestTitle")}</p>
      <p className="mb-5 text-secondary">{t("limitHint")}</p>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
          error={bad("amount")}
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
          className="sm:col-span-1"
        />

        <div className="flex flex-col gap-2 rounded-control border border-line bg-paper p-3">
          <span className="text-secondary">{t("monthlyInstallment")}</span>
          <span className="text-card font-semibold tabular-nums text-indigo">
            {estimatedMonthly} <span className="text-caption font-normal">{locale === "ar" ? "ر.س" : "SAR"}</span>
          </span>
        </div>

        <FormField
          name="reason"
          label={t("reason")}
          placeholder={t("reasonPlaceholder")}
          required
          error={bad("reason")}
          className="sm:col-span-2 lg:col-span-4"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Send aria-hidden />
          {pending ? t("submitting") : t("submitRequest")}
        </Button>
        {state?.ok && <StatusPill tone="stamp">{t("status.pending")}</StatusPill>}
        {errorMessage && <p className="text-caption text-brick">{errorMessage}</p>}
      </div>
    </form>
  );
}

