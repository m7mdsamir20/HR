"use client";

import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { updateSubscription, type SubscriptionState } from "@/actions/admin";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export function SubscriptionForm({
  companyId,
  maxEmployees,
  endsAt,
}: {
  companyId: string;
  maxEmployees: number;
  endsAt: string;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useActionState<SubscriptionState, FormData>(
    updateSubscription.bind(null, companyId),
    undefined,
  );
  const failed = state && !state.ok ? state : undefined;

  const maxError =
    failed?.error === "belowActive"
      ? t("company.belowActive", { count: failed.activeCount ?? 0 })
      : failed?.fields?.maxEmployees
        ? t("create.fields.maxEmployees")
        : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="maxEmployees"
          label={t("create.maxEmployees")}
          type="number"
          min={1}
          max={100000}
          defaultValue={maxEmployees}
          error={maxError}
          required
          dir="ltr"
        />
        <FormField
          name="endsAt"
          label={t("create.endsAt")}
          type="date"
          defaultValue={endsAt}
          error={failed?.fields?.endsAt ? t("create.fields.endsAt") : undefined}
          required
          dir="ltr"
        />
      </div>
      {failed?.error === "unexpected" && (
        <p role="alert" className="text-label text-brick">
          {tCommon("unexpected")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
        {state?.ok && (
          <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp">
            <CheckCircle2 className="size-4" aria-hidden />
            {t("company.subscriptionSaved")}
          </p>
        )}
      </div>
    </form>
  );
}
