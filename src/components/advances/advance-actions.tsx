"use client";

import { Check, HandCoins, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { cancelAdvance, decideAdvance, repayAdvance, type AdvanceState } from "@/actions/advances";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdvanceDecision({ id }: { id: string }) {
  const t = useTranslations("advances");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [state, action, pending] = useActionState<AdvanceState, FormData>(decideAdvance, undefined);
  const error = state && !state.ok ? tErrors(state.error) : null;

  return (
    <form action={action} className="flex flex-col gap-2 w-full mt-2" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <Input
        name="note"
        aria-label={t("decisionNote")}
        placeholder={t("decisionNotePlaceholder")}
        maxLength={500}
        aria-invalid={error ? true : undefined}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>
          <Check aria-hidden />
          {t("approveRequest")}
        </Button>
        <Button type="submit" name="decision" value="rejected" size="sm" variant="secondary" disabled={pending}>
          <X aria-hidden />
          {t("rejectRequest")}
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

export function AdvanceCancel({ id }: { id: string }) {
  const t = useTranslations("advances");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [state, action, pending] = useActionState<AdvanceState, FormData>(cancelAdvance, undefined);
  const error = state && !state.ok ? tErrors(state.error) : null;

  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" className="w-fit text-brick" disabled={pending}>
        <X aria-hidden />
        {t("cancelRequest")}
      </Button>
      {error && (
        <p role="alert" className="text-caption text-brick">
          {error}
        </p>
      )}
    </form>
  );
}

export function AdvanceRepayment({
  advanceId,
  remainingAmount,
}: {
  advanceId: string;
  remainingAmount: number;
}) {
  const t = useTranslations("advances");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const [state, action, pending] = useActionState<AdvanceState, FormData>(async (prev: AdvanceState, fd: FormData) => {
    const res = await repayAdvance(prev, fd);
    if (res?.ok) {
      setOpen(false);
    }
    return res;
  }, undefined);

  const error = state && !state.ok ? tErrors(state.error) : null;

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <HandCoins className="size-4" aria-hidden />
        {t("repayTitle")}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-control border border-line bg-paper p-3 mt-2">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="uiLocale" value={locale} />
        <input type="hidden" name="advanceId" value={advanceId} />

        <div className="flex items-center justify-between border-b border-line pb-2">
          <span className="text-label font-medium">{t("repayTitle")}</span>
          <span className="text-caption font-semibold tabular-nums text-indigo">
            {t("remaining")}: {remainingAmount} {locale === "ar" ? "ر.س" : "SAR"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            name="amount"
            type="number"
            label={t("repayAmount")}
            defaultValue={remainingAmount}
            min={1}
            max={remainingAmount}
            step={10}
            required
            dir="ltr"
          />
          <FormField
            name="note"
            label={t("repayNote")}
            placeholder="سداد نقدي / تحويل بنكي..."
            maxLength={300}
          />
        </div>

        {error && <p className="text-caption text-brick">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "..." : t("repaySubmit")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
        </div>
      </form>
    </div>
  );
}
