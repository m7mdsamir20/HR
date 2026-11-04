"use client";

import { ExternalLink, LocateFixed, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { type AttendanceState } from "@/actions/attendance";
import { deleteBranch, saveBranch } from "@/actions/attendance-setup";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

type Branch = { id: string; nameAr: string; nameEn: string; latitude: number; longitude: number; radius: number; employees: number };

function useErrorText() {
  const t = useTranslations("attendance.branches");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  return (state: AttendanceState) => {
    if (!state || state.ok) return undefined;
    if (state.error === "invalid") return t("errors.invalid");
    return tAttendance.has(state.error) ? tAttendance(state.error) : tErrors(state.error as "unexpected");
  };
}

/** The fields of one branch, with a button that fills the position from the device. */
function BranchFields({ branch, state, idPrefix }: { branch?: Branch; state: AttendanceState; idPrefix: string }) {
  const t = useTranslations("attendance.branches");
  const tCommon = useTranslations("common");
  const [latitude, setLatitude] = useState(branch?.latitude.toString() ?? "");
  const [longitude, setLongitude] = useState(branch?.longitude.toString() ?? "");
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t(`fields.${f as "nameAr"}`) : undefined);

  function useHere() {
    setLocateFailed(false);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLatitude(p.coords.latitude.toFixed(6));
        setLongitude(p.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocateFailed(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <>
      <FormField name="nameAr" id={`${idPrefix}-ar`} label={t("nameAr")} defaultValue={branch?.nameAr} required dir="rtl" error={bad("nameAr")} />
      <FormField name="nameEn" id={`${idPrefix}-en`} label={t("nameEn")} optionalLabel={tCommon("optional")} defaultValue={branch?.nameEn} dir="ltr" />
      <FormField
        name="latitude"
        id={`${idPrefix}-lat`}
        label={t("latitude")}
        value={latitude}
        onChange={(e) => setLatitude(e.target.value)}
        inputMode="decimal"
        required
        dir="ltr"
        error={bad("latitude")}
      />
      <FormField
        name="longitude"
        id={`${idPrefix}-lng`}
        label={t("longitude")}
        value={longitude}
        onChange={(e) => setLongitude(e.target.value)}
        inputMode="decimal"
        required
        dir="ltr"
        error={bad("longitude")}
      />
      <FormField
        name="radius"
        id={`${idPrefix}-radius`}
        label={t("radius")}
        hint={t("radiusHint")}
        defaultValue={branch?.radius ?? 150}
        inputMode="numeric"
        required
        dir="ltr"
        error={bad("radius")}
      />
      <div className="flex flex-col gap-2 self-end">
        <Button type="button" variant="secondary" onClick={useHere} disabled={locating}>
          <LocateFixed aria-hidden />
          {locating ? t("locating") : t("useHere")}
        </Button>
        {locateFailed && <p className="text-caption text-brick">{t("locateFailed")}</p>}
      </div>
    </>
  );
}

/** Branches page: the add form across the full width, then one card per branch. */
export function BranchesManager({ branches }: { branches: Branch[] }) {
  const t = useTranslations("attendance.branches");
  const locale = useLocale();
  const errorText = useErrorText();
  const [added, setAdded] = useState(0);
  const [state, action, pending] = useActionState<AttendanceState, FormData>(async (prev: AttendanceState, fd: FormData) => {
    const result = await saveBranch(null, prev, fd);
    if (result?.ok) setAdded((n) => n + 1);
    return result;
  }, undefined);

  return (
    <div className="flex flex-col gap-6">
      <form key={added} action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
        <input type="hidden" name="uiLocale" value={locale} />
        <p className="mb-5 text-card">{t("add")}</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <BranchFields state={state} idPrefix="new-branch" />
          <Button type="submit" disabled={pending} className="self-end sm:w-fit">
            <Plus aria-hidden />
            {t("addSubmit")}
          </Button>
        </div>
        {errorText(state) && (
          <p role="alert" className="mt-4 text-label text-brick">
            {errorText(state)}
          </p>
        )}
      </form>

      {branches.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {branches.map((b) => (
            <BranchCard key={b.id} branch={b} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BranchCard({ branch: b }: { branch: Branch }) {
  const t = useTranslations("attendance.branches");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const errorText = useErrorText();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [saveState, save, saving] = useActionState<AttendanceState, FormData>(async (prev: AttendanceState, fd: FormData) => {
    const result = await saveBranch(b.id, prev, fd);
    if (result?.ok) setMode("view");
    return result;
  }, undefined);
  const [deleteState, remove, removing] = useActionState<AttendanceState, FormData>(deleteBranch.bind(null, b.id), undefined);
  const name = (locale === "en" && b.nameEn) || b.nameAr;
  const error = errorText(saveState) ?? errorText(deleteState);

  return (
    <li className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      {mode === "edit" ? (
        <form action={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />
          <BranchFields branch={b} state={saveState} idPrefix={`branch-${b.id}`} />
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
          <p>{t("deleteConfirm", { name })}</p>
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
        <>
          <div className="flex flex-col gap-1">
            <span className="text-card">{name}</span>
            <span className="text-secondary tabular-nums">
              <bdi dir="ltr">
                {b.latitude.toFixed(6)}, {b.longitude.toFixed(6)}
              </bdi>{" "}
              · {t("radiusValue", { meters: b.radius })}
            </span>
            <span className="text-secondary">{t("employees", { count: b.employees })}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button asChild variant="ghost">
              <a href={`https://www.google.com/maps?q=${b.latitude},${b.longitude}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                {t("openMap")}
              </a>
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("edit")}>
              <Pencil aria-hidden />
              {t("edit")}
            </Button>
            <Button type="button" variant="ghost" className="text-brick" onClick={() => setMode("delete")}>
              <Trash2 aria-hidden />
              {t("delete")}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-label text-brick">
          {error}
        </p>
      )}
    </li>
  );
}
