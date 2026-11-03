"use client";

import { CheckCircle2, ImageUp, Pencil, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  createDepartment,
  deleteDepartment,
  removeLogo,
  updateCompanyProfile,
  updateDepartment,
  uploadLogo,
  type SettingsState,
} from "@/actions/settings";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function useErrorText() {
  const t = useTranslations("settings");
  const tErrors = useTranslations("errors");
  return (state: SettingsState) => {
    if (!state || state.ok) return undefined;
    if (state.error === "fileType" || state.error === "fileSize" || state.error === "duplicate") return t(`errors.${state.error}`);
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
    <form action={action} className="grid max-w-3xl gap-5 md:grid-cols-2" noValidate>
      <input type="hidden" name="uiLocale" value={locale} />
      <FormField name="nameAr" label={t("company.nameAr")} defaultValue={defaults.nameAr} error={bad("nameAr")} required dir="rtl" />
      <FormField
        name="nameEn"
        label={t("company.nameEn")}
        defaultValue={defaults.nameEn}
        error={bad("nameEn")}
        optionalLabel={tCommon("optional")}
        dir="ltr"
      />
      <FormField
        name="commercialReg"
        label={t("company.commercialReg")}
        defaultValue={defaults.commercialReg}
        error={bad("commercialReg")}
        optionalLabel={tCommon("optional")}
        inputMode="numeric"
        dir="ltr"
      />
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-20 place-items-center overflow-hidden rounded-card border border-line bg-surface">
          {logoUrl ? (
            // Signed, short-lived URL from private storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={t("logo.current")} className="size-full object-contain" />
          ) : (
            <ImageUp className="size-6 text-ink-soft" aria-hidden />
          )}
        </div>
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
              className="h-11 max-w-xs py-2"
            />
            <Button type="submit" disabled={pending}>
              {pending ? t("logo.uploading") : t("logo.upload")}
            </Button>
          </div>
          <p id="logo-hint" className="text-caption text-ink-soft">
            {t("logo.hint")}
          </p>
        </form>
        {logoUrl && (
          <form action={remove}>
            <input type="hidden" name="uiLocale" value={locale} />
            <Button type="submit" variant="ghost" disabled={removing} className="text-brick">
              <X aria-hidden />
              {t("logo.remove")}
            </Button>
          </form>
        )}
      </div>
      <Saved show={!!state?.ok} label={t("logo.saved")} />
      {error && (
        <p role="alert" className="text-label text-brick">
          {error}
        </p>
      )}
    </div>
  );
}

type Department = { id: string; nameAr: string; nameEn: string; employees: number };

export function DepartmentsManager({ departments }: { departments: Department[] }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  // Bumped on each successful add so the form re-mounts empty.
  const [added, setAdded] = useState(0);
  const [state, action, pending] = useActionState<SettingsState, FormData>(async (prev: SettingsState, fd: FormData) => {
    const result = await createDepartment(prev, fd);
    if (result?.ok) setAdded((n) => n + 1);
    return result;
  }, undefined);
  const formKey = `add-${added}`;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {departments.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-4 text-secondary">{t("departments.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
          {departments.map((d) => (
            <DepartmentRow key={d.id} department={d} />
          ))}
        </ul>
      )}

      <form key={formKey} action={action} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4" noValidate>
        <input type="hidden" name="uiLocale" value={locale} />
        <p className="text-label">{t("departments.add")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <FormField
            name="nameAr"
            label={t("departments.nameAr")}
            required
            dir="rtl"
            error={state && !state.ok && state.fields?.includes("nameAr") ? errorText(state.error === "duplicate" ? state : { ok: false, error: "invalid" }) : undefined}
          />
          <FormField name="nameEn" label={t("departments.nameEn")} optionalLabel={tCommon("optional")} dir="ltr" />
          <Button type="submit" disabled={pending} className="sm:mb-0">
            {t("departments.addSubmit")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function DepartmentRow({ department: d }: { department: Department }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveState, save, saving] = useActionState<SettingsState, FormData>(
    async (prev: SettingsState, fd: FormData) => {
      const result = await updateDepartment(d.id, prev, fd);
      if (result?.ok) setEditing(false);
      return result;
    },
    undefined,
  );
  const [deleteState, remove, removing] = useActionState<SettingsState, FormData>(deleteDepartment.bind(null, d.id), undefined);
  const name = (locale === "en" && d.nameEn) || d.nameAr;
  const error = errorText(saveState) ?? errorText(deleteState);

  return (
    <li className="flex flex-col gap-3 p-4">
      {editing ? (
        <form action={save} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />
          <FormField name="nameAr" id={`ar-${d.id}`} label={t("departments.nameAr")} defaultValue={d.nameAr} required dir="rtl" />
          <FormField name="nameEn" id={`en-${d.id}`} label={t("departments.nameEn")} defaultValue={d.nameEn} dir="ltr" />
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {tCommon("save")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </form>
      ) : confirming ? (
        <form action={remove} className="flex flex-col gap-3">
          <input type="hidden" name="uiLocale" value={locale} />
          <p>
            {t("departments.deleteConfirm", { name })}{" "}
            {d.employees > 0 && <span className="text-secondary">{t("departments.deleteNote", { count: d.employees })}</span>}
          </p>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={removing}>
              {t("departments.delete")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="font-semibold">{name}</span>
            <span className="text-secondary">{t("departments.employees", { count: d.employees })}</span>
          </span>
          <span className="flex gap-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {t("departments.rename")}
            </Button>
            <Button type="button" variant="ghost" className="text-brick" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden />
              {t("departments.delete")}
            </Button>
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-label text-brick">
          {error}
        </p>
      )}
    </li>
  );
}
