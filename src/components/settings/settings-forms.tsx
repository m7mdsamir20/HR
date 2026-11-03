"use client";

import { CheckCircle2, ImageUp, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { removeLogo, updateCompanyProfile, uploadLogo, type SettingsState } from "@/actions/settings";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function useErrorText() {
  const t = useTranslations("settings");
  const tErrors = useTranslations("errors");
  return (state: SettingsState) => {
    if (!state || state.ok) return undefined;
    if (state.error === "fileType" || state.error === "fileSize") return t(`errors.${state.error}`);
    if (state.error === "duplicate") return tErrors("invalid");
    return tErrors(state.error);
  };
}

function Saved({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <p role="status" className="inline-flex items-center gap-1.5 text-label text-stamp">
      <CheckCircle2 className="size-4" aria-hidden />
      {label}
    </p>
  );
}

export function CompanyProfileForm({ defaults }: { defaults: { nameAr: string; nameEn: string; commercialReg: string } }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateCompanyProfile, undefined);
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t(`fields.${f}`) : undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <FormSection title={t("company.title")}>
        <FormField name="nameAr" label={t("company.nameAr")} defaultValue={defaults.nameAr} error={bad("nameAr")} required dir="rtl" />
        <FormField name="nameEn" label={t("company.nameEn")} defaultValue={defaults.nameEn} error={bad("nameEn")} optionalLabel={tCommon("optional")} dir="ltr" />
        <FormField
          name="commercialReg"
          label={t("company.commercialReg")}
          defaultValue={defaults.commercialReg}
          error={bad("commercialReg")}
          optionalLabel={tCommon("optional")}
          inputMode="numeric"
          dir="ltr"
        />
      </FormSection>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
        <Saved show={!!state?.ok} label={t("saved")} />
        {state && !state.ok && !state.fields && (
          <p role="alert" className="text-label text-brick">
            {errorText(state)}
          </p>
        )}
      </div>
    </form>
  );
}

export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const errorText = useErrorText();
  const [state, action, pending] = useActionState<SettingsState, FormData>(uploadLogo, undefined);
  const [removeState, remove, removing] = useActionState<SettingsState, FormData>(removeLogo, undefined);
  const error = errorText(state) ?? errorText(removeState);

  return (
    <section aria-labelledby="logo-title" className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="logo-title" className="text-card">
          {t("logo.title")}
        </h2>
        <p className="text-secondary">{t("logo.intro")}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
        <div className="grid size-28 place-items-center overflow-hidden rounded-card border border-line bg-paper">
          {logoUrl ? (
            // Signed, short-lived URL from private storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={t("logo.current")} className="size-full object-contain" />
          ) : (
            <ImageUp className="size-7 text-ink-soft" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-3">
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="uiLocale" value={locale} />
            <Label htmlFor="logo">{t("logo.choose")}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                aria-describedby="logo-hint"
                className="h-11 flex-1 py-2 sm:min-w-72"
              />
              <Button type="submit" disabled={pending}>
                {pending ? t("logo.uploading") : t("logo.upload")}
              </Button>
              {logoUrl && (
                <Button type="submit" formAction={remove} formNoValidate variant="ghost" disabled={removing} className="text-brick">
                  <X aria-hidden />
                  {t("logo.remove")}
                </Button>
              )}
            </div>
            <p id="logo-hint" className="text-caption text-ink-soft">
              {t("logo.hint")}
            </p>
          </form>
          <Saved show={!!state?.ok} label={t("logo.saved")} />
          {error && (
            <p role="alert" className="text-label text-brick">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
