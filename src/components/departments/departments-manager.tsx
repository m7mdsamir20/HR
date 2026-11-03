"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { createDepartment, deleteDepartment, updateDepartment, type SettingsState } from "@/actions/settings";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

type Department = { id: string; nameAr: string; nameEn: string; employees: number };

function useErrorText() {
  const t = useTranslations("departments");
  const tErrors = useTranslations("errors");
  return (state: SettingsState) => {
    if (!state || state.ok) return undefined;
    if (state.error === "duplicate") return t("errors.duplicate");
    if (state.error === "invalid") return t("fields.nameAr");
    if (state.error === "fileType" || state.error === "fileSize") return tErrors("unexpected");
    return tErrors(state.error);
  };
}

/** Departments page: the add form across the full width, then one card per department. */
export function DepartmentsManager({ departments }: { departments: Department[] }) {
  const t = useTranslations("departments");
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

  return (
    <div className="flex flex-col gap-6">
      <form key={added} action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
        <input type="hidden" name="uiLocale" value={locale} />
        <p className="mb-5 text-card">{t("add")}</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
          <FormField name="nameAr" label={t("nameAr")} required dir="rtl" error={errorText(state)} />
          <FormField name="nameEn" label={t("nameEn")} optionalLabel={tCommon("optional")} dir="ltr" />
          <Button type="submit" disabled={pending} className="sm:col-span-2 sm:w-fit lg:col-span-1 lg:mt-7">
            <Plus aria-hidden />
            {t("addSubmit")}
          </Button>
        </div>
      </form>

      {departments.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {departments.map((d) => (
            <DepartmentCard key={d.id} department={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DepartmentCard({ department: d }: { department: Department }) {
  const t = useTranslations("departments");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [saveState, save, saving] = useActionState<SettingsState, FormData>(async (prev: SettingsState, fd: FormData) => {
    const result = await updateDepartment(d.id, prev, fd);
    if (result?.ok) setMode("view");
    return result;
  }, undefined);
  const [deleteState, remove, removing] = useActionState<SettingsState, FormData>(deleteDepartment.bind(null, d.id), undefined);
  const name = (locale === "en" && d.nameEn) || d.nameAr;
  const error = errorText(saveState) ?? errorText(deleteState);

  return (
    <li className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      {mode === "edit" ? (
        <form action={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />
          <FormField name="nameAr" id={`ar-${d.id}`} label={t("nameAr")} defaultValue={d.nameAr} required dir="rtl" />
          <FormField name="nameEn" id={`en-${d.id}`} label={t("nameEn")} defaultValue={d.nameEn} dir="ltr" />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {tCommon("save")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("view")}>
              {tCommon("cancel")}
            </Button>
          </div>
        </form>
      ) : mode === "delete" ? (
        <form action={remove} className="flex flex-col gap-3">
          <input type="hidden" name="uiLocale" value={locale} />
          <p>
            {t("deleteConfirm", { name })}{" "}
            {d.employees > 0 && <span className="text-secondary">{t("deleteNote", { count: d.employees })}</span>}
          </p>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={removing}>
              {t("delete")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("view")}>
              {tCommon("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="text-card">{name}</span>
            <span className="text-secondary">{t("employees", { count: d.employees })}</span>
          </span>
          <span className="flex gap-1">
            <Button type="button" variant="ghost" onClick={() => setMode("edit")}>
              <Pencil aria-hidden />
              {t("rename")}
            </Button>
            <Button type="button" variant="ghost" className="text-brick" onClick={() => setMode("delete")}>
              <Trash2 aria-hidden />
              {t("delete")}
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
