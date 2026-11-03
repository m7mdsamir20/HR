"use client";

import { Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { createCompany, type CreateCompanyState } from "@/actions/admin";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { suggestPassword } from "@/lib/password";
import type { CreateCompanyField } from "@/lib/validation/company";

export function CreateCompanyForm({ minDate }: { minDate: string }) {
  const t = useTranslations("admin.create");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useActionState<CreateCompanyState, FormData>(createCompany, undefined);
  const [password, setPassword] = useState("");

  const v = (f: CreateCompanyField) => state?.values[f] ?? "";
  const err = (f: CreateCompanyField) => {
    if (!state?.fields?.[f]) return undefined;
    // A taken ID is well-formed: say that, not the format rule.
    if (f === "ownerNationalId" && state.error === "nationalIdTaken") return t("fields.ownerNationalIdTaken");
    return t(`fields.${f}`);
  };

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state?.error && (
        <p role="alert" className="rounded-control border border-brick/30 bg-brick/5 px-3 py-2.5 text-label text-brick">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <FormSection title={t("companySection")}>
        <FormField name="nameAr" label={t("nameAr")} defaultValue={v("nameAr")} error={err("nameAr")} required dir="rtl" />
        <FormField
          name="nameEn"
          label={t("nameEn")}
          defaultValue={v("nameEn")}
          error={err("nameEn")}
          optionalLabel={tCommon("optional")}
          dir="ltr"
        />
        <FormField
          name="commercialReg"
          label={t("commercialReg")}
          hint={t("commercialRegHint")}
          defaultValue={v("commercialReg")}
          error={err("commercialReg")}
          optionalLabel={tCommon("optional")}
          inputMode="numeric"
          dir="ltr"
        />
      </FormSection>

      <FormSection title={t("subscriptionSection")}>
        <FormField
          name="maxEmployees"
          label={t("maxEmployees")}
          type="number"
          min={1}
          max={100000}
          defaultValue={v("maxEmployees")}
          error={err("maxEmployees")}
          required
          dir="ltr"
        />
        <FormField
          name="endsAt"
          label={t("endsAt")}
          type="date"
          min={minDate}
          defaultValue={v("endsAt")}
          error={err("endsAt")}
          required
          dir="ltr"
        />
      </FormSection>

      <FormSection title={t("ownerSection")} description={t("ownerHint")}>
        <FormField
          name="ownerNationalId"
          label={t("ownerNationalId")}
          defaultValue={v("ownerNationalId")}
          error={err("ownerNationalId")}
          required
          inputMode="numeric"
          maxLength={14}
          dir="ltr"
          className="tabular-nums"
        />
        <FormField
          name="ownerPhone"
          label={t("ownerPhone")}
          hint={t("ownerPhoneHint")}
          type="tel"
          defaultValue={v("ownerPhone")}
          error={err("ownerPhone")}
          optionalLabel={tCommon("optional")}
          inputMode="tel"
          dir="ltr"
        />
        <FormField name="ownerNameAr" label={t("ownerNameAr")} defaultValue={v("ownerNameAr")} error={err("ownerNameAr")} required dir="rtl" />
        <FormField
          name="ownerNameEn"
          label={t("ownerNameEn")}
          defaultValue={v("ownerNameEn")}
          error={err("ownerNameEn")}
          optionalLabel={tCommon("optional")}
          dir="ltr"
        />
        {/* Shown in clear text on purpose: the admin reads it to the owner. Never sent back on errors. */}
        <FormField
          name="password"
          label={t("password")}
          hint={t("passwordHint")}
          error={err("password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={72}
          dir="ltr"
          className="sm:col-span-2"
        >
          <Button type="button" variant="outline" onClick={() => setPassword(suggestPassword())} className="shrink-0">
            <Sparkles aria-hidden />
            {t("generate")}
          </Button>
        </FormField>
      </FormSection>

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
