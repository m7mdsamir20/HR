"use client";

import { Camera, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { removeLogo, updateCompanyProfile, uploadLogo, type SettingsState } from "@/actions/settings";
import { FormField } from "@/components/form-field";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function CompanyLogoUploader({
  logoUrl,
  canEdit = true,
}: {
  logoUrl: string | null;
  canEdit?: boolean;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prevPropUrl, setPrevPropUrl] = useState(logoUrl);
  const [optimisticUrl, setOptimisticUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (prevPropUrl !== logoUrl) {
    setPrevPropUrl(logoUrl);
    setOptimisticUrl(null);
  }

  const currentLogo = optimisticUrl !== null ? optimisticUrl : logoUrl;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      setError(t("errors.fileSize"));
      e.target.value = "";
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError(t("errors.fileType"));
      e.target.value = "";
      return;
    }

    setError(null);
    const preview = URL.createObjectURL(file);
    setOptimisticUrl(preview);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("logo", file);
        fd.append("uiLocale", locale);
        const res = await uploadLogo(undefined, fd);
        if (!res?.ok) {
          setOptimisticUrl(null);
          setError(errorText(res) ?? tCommon("unexpected"));
        } else {
          setSuccessMsg(t("logo.saved"));
          setTimeout(() => setSuccessMsg(null), 3500);
        }
      } catch {
        setOptimisticUrl(null);
        setError(tCommon("unexpected"));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  const handleDelete = () => {
    if (!canEdit || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("uiLocale", locale);
        const res = await removeLogo(undefined, fd);
        if (!res?.ok) {
          setError(errorText(res) ?? tCommon("unexpected"));
        } else {
          setOptimisticUrl(null);
          setSuccessMsg(t("logo.deleted"));
          setTimeout(() => setSuccessMsg(null), 3500);
        }
      } catch {
        setError(tCommon("unexpected"));
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-ink">{t("logo.title")}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div
          role={canEdit ? "button" : undefined}
          tabIndex={canEdit ? 0 : undefined}
          onClick={() => {
            if (canEdit && !isPending) {
              fileInputRef.current?.click();
            }
          }}
          onKeyDown={(e) => {
            if (canEdit && !isPending && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "group relative grid size-28 shrink-0 place-items-center overflow-hidden rounded-card border-2 transition-all select-none",
            currentLogo
              ? "border-line bg-paper hover:border-indigo"
              : "border-dashed border-line bg-paper/50 hover:border-indigo hover:bg-paper",
            canEdit && "cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo",
            isPending && "pointer-events-none opacity-85",
          )}
          title={canEdit ? (currentLogo ? t("logo.change") : t("logo.choose")) : undefined}
          aria-label={t("logo.title")}
        >
          {currentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentLogo} alt={t("logo.current")} className="size-full object-contain p-2" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 p-2 text-center text-ink-soft transition-colors group-hover:text-indigo">
              <Camera className="size-6" aria-hidden />
              <span className="text-caption font-medium leading-tight">{t("logo.choose")}</span>
            </div>
          )}

          {currentLogo && canEdit && !isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/50 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="size-6 text-white" aria-hidden />
              <span className="text-caption font-medium text-white">{t("logo.change")}</span>
            </div>
          )}

          {isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/85 backdrop-blur-[1px]">
              <Loader2 className="size-6 animate-spin text-indigo" aria-hidden />
            </div>
          )}
        </div>

        <div className="flex flex-col items-start gap-2">
          <p className="text-caption text-secondary">
            {t("logo.hint")}
          </p>

          {currentLogo && canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-caption font-medium text-brick transition-colors hover:text-brick/80 hover:underline disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden />
              {t("logo.delete")}
            </button>
          )}

          {successMsg && (
            <p role="status" className="inline-flex items-center gap-1 text-caption font-medium text-stamp">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {successMsg}
            </p>
          )}

          {error && (
            <p role="alert" className="text-caption text-brick">
              {error}
            </p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
          disabled={!canEdit || isPending}
        />
      </div>
    </div>
  );
}

export function CompanyProfileForm({
  defaults,
  logoUrl = null,
  canEdit = true,
}: {
  defaults: {
    nameAr: string;
    nameEn: string;
    commercialReg: string;
    taxNumber?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  logoUrl?: string | null;
  canEdit?: boolean;
}) {
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
        <div className="col-span-full border-b border-line pb-5">
          <CompanyLogoUploader logoUrl={logoUrl} canEdit={canEdit} />
        </div>
        <FormField
          name="nameAr"
          label={t("company.nameAr")}
          defaultValue={defaults.nameAr}
          error={bad("nameAr")}
          required
          dir="rtl"
          disabled={!canEdit}
        />
        <FormField
          name="nameEn"
          label={t("company.nameEn")}
          defaultValue={defaults.nameEn}
          error={bad("nameEn")}
          optionalLabel={tCommon("optional")}
          dir="ltr"
          disabled={!canEdit}
        />
        <FormField
          name="commercialReg"
          label={t("company.commercialReg")}
          defaultValue={defaults.commercialReg}
          error={bad("commercialReg")}
          optionalLabel={tCommon("optional")}
          inputMode="numeric"
          dir="ltr"
          disabled={!canEdit}
        />
        <FormField
          name="taxNumber"
          label={t("company.taxNumber")}
          defaultValue={defaults.taxNumber ?? ""}
          error={bad("taxNumber")}
          optionalLabel={tCommon("optional")}
          inputMode="numeric"
          placeholder="300000000000003"
          dir="ltr"
          disabled={!canEdit}
        />
        <FormField
          name="phone"
          label={t("company.phone")}
          defaultValue={defaults.phone ?? ""}
          error={bad("phone")}
          optionalLabel={tCommon("optional")}
          type="tel"
          inputMode="tel"
          placeholder="0110000000"
          dir="ltr"
          disabled={!canEdit}
        />
        <FormField
          name="email"
          label={t("company.email")}
          defaultValue={defaults.email ?? ""}
          error={bad("email")}
          optionalLabel={tCommon("optional")}
          type="email"
          inputMode="email"
          placeholder="info@company.sa"
          dir="ltr"
          disabled={!canEdit}
        />
        <FormField
          name="address"
          label={t("company.address")}
          defaultValue={defaults.address ?? ""}
          error={bad("address")}
          optionalLabel={tCommon("optional")}
          placeholder="الرياض، حي الملز..."
          disabled={!canEdit}
        />
      </FormSection>
      {canEdit ? (
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
      ) : (
        <p className="text-caption text-secondary">
          ℹ️ {t("ownerOnlyNotice")}
        </p>
      )}
    </form>
  );
}

export function LogoForm({
  logoUrl,
  canEdit = true,
}: {
  logoUrl: string | null;
  canEdit?: boolean;
}) {
  return (
    <section aria-label="logo-section" className="rounded-card border border-line bg-surface p-4 md:p-6">
      <CompanyLogoUploader logoUrl={logoUrl} canEdit={canEdit} />
    </section>
  );
}
