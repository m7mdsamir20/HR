"use client";

import { Network, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
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

export function DepartmentsManager({ departments }: { departments: Department[] }) {
  const t = useTranslations("departments");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const [state, action, pending] = useActionState<SettingsState, FormData>(
    async (prev: SettingsState, fd: FormData) => {
      const result = await createDepartment(prev, fd);
      if (result?.ok) {
        setIsAddOpen(false);
      }
      return result;
    },
    undefined
  );

  // Close modal on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isAddOpen) {
        setIsAddOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddOpen]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header with Add Department button (identical to Employees page layout) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-control bg-indigo/10 text-indigo">
              <Network className="size-5" aria-hidden />
            </div>
            <h1 className="text-page">{t("title")}</h1>
          </div>
          <p className="text-secondary">{t("intro")}</p>
        </div>

        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="size-4" aria-hidden />
          {t("add")}
        </Button>
      </div>

      {/* Add Department Modal Dialog */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in-0 duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddOpen(false);
          }}
        >
          <div
            ref={modalRef}
            className="relative flex w-full max-w-lg flex-col gap-5 rounded-card border border-line bg-surface p-6 shadow-xl animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div className="flex flex-col gap-1">
                <h2 id="modal-title" className="text-card font-semibold text-ink">
                  {t("modalTitle")}
                </h2>
                <p className="text-caption text-secondary">{t("modalIntro")}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                aria-label={tCommon("cancel")}
                className="rounded-control p-1 text-ink-soft transition-colors hover:bg-paper hover:text-ink"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            {/* Modal Form */}
            <form action={action} className="flex flex-col gap-4" noValidate>
              <input type="hidden" name="uiLocale" value={locale} />

              <FormField
                name="nameAr"
                label={t("nameAr")}
                required
                dir="rtl"
                placeholder="مثال: الإدارة المالية، الموارد البشرية..."
                error={errorText(state)}
              />

              <FormField
                name="nameEn"
                label={t("nameEn")}
                optionalLabel={tCommon("optional")}
                dir="ltr"
                placeholder="e.g. Finance, Human Resources..."
              />

              {state && !state.ok && state.error && (
                <p role="alert" className="text-caption font-medium text-brick">
                  {errorText(state)}
                </p>
              )}

              <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsAddOpen(false)}
                  disabled={pending}
                >
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={pending} className="gap-2">
                  <Plus className="size-4" aria-hidden />
                  {pending ? tCommon("saving") : t("addSubmit")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Departments Grid or Empty State */}
      {departments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-surface p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-control bg-paper text-ink-soft">
            <Network className="size-6" aria-hidden />
          </div>
          <p className="text-secondary">{t("empty")}</p>
          <Button onClick={() => setIsAddOpen(true)} className="mt-2 gap-2">
            <Plus className="size-4" aria-hidden />
            {t("add")}
          </Button>
        </div>
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

  const [saveState, save, saving] = useActionState<SettingsState, FormData>(
    async (prev: SettingsState, fd: FormData) => {
      const result = await updateDepartment(d.id, prev, fd);
      if (result?.ok) setMode("view");
      return result;
    },
    undefined
  );

  const [deleteState, remove, removing] = useActionState<SettingsState, FormData>(
    deleteDepartment.bind(null, d.id),
    undefined
  );

  const name = (locale === "en" && d.nameEn) || d.nameAr;
  const error = errorText(saveState) ?? errorText(deleteState);

  return (
    <li className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-2xs">
      {mode === "edit" ? (
        <form action={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />
          <FormField
            name="nameAr"
            id={`ar-${d.id}`}
            label={t("nameAr")}
            defaultValue={d.nameAr}
            required
            dir="rtl"
          />
          <FormField
            name="nameEn"
            id={`en-${d.id}`}
            label={t("nameEn")}
            defaultValue={d.nameEn}
            dir="ltr"
          />
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
          <p className="text-sm font-medium text-ink">
            {t("deleteConfirm", { name })}{" "}
            {d.employees > 0 && (
              <span className="block text-caption text-secondary mt-1">
                {t("deleteNote", { count: d.employees })}
              </span>
            )}
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
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-paper text-ink-soft">
              <Network className="size-4.5" aria-hidden />
            </div>
            <span className="flex flex-col">
              <span className="font-semibold text-ink">{name}</span>
              <span className="text-caption text-secondary">
                {t("employees", { count: d.employees })}
              </span>
            </span>
          </div>
          <span className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("edit")}>
              <Pencil className="size-3.5" aria-hidden />
              {t("rename")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-brick hover:text-brick hover:bg-brick/10"
              onClick={() => setMode("delete")}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {t("delete")}
            </Button>
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-caption text-brick">
          {error}
        </p>
      )}
    </li>
  );
}
