"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { type AttendanceState } from "@/actions/attendance";
import { deleteShift, saveShift } from "@/actions/attendance-setup";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { weekdayName } from "@/lib/format";

type Shift = {
  id: string;
  nameAr: string;
  nameEn: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  ramadanHours: number;
  workDays: number[];
  employees: number;
};

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function useErrorText() {
  const t = useTranslations("attendance.shifts");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  return (state: AttendanceState) => {
    if (!state || state.ok) return undefined;
    if (state.error === "invalid") return t("errors.invalid");
    return tAttendance.has(state.error) ? tAttendance(state.error) : tErrors(state.error as "unexpected");
  };
}

function ShiftFields({ shift, state, idPrefix }: { shift?: Shift; state: AttendanceState; idPrefix: string }) {
  const t = useTranslations("attendance.shifts");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t(`fields.${f as "nameAr"}`) : undefined);
  const days = shift?.workDays ?? [0, 1, 2, 3, 4];

  return (
    <>
      <FormField name="nameAr" id={`${idPrefix}-ar`} label={t("nameAr")} defaultValue={shift?.nameAr} required dir="rtl" error={bad("nameAr")} />
      <FormField name="nameEn" id={`${idPrefix}-en`} label={t("nameEn")} optionalLabel={tCommon("optional")} defaultValue={shift?.nameEn} dir="ltr" />
      <FormField name="startTime" id={`${idPrefix}-start`} type="time" label={t("startTime")} defaultValue={shift?.startTime ?? "08:00"} required dir="ltr" error={bad("startTime")} />
      <FormField name="endTime" id={`${idPrefix}-end`} type="time" label={t("endTime")} defaultValue={shift?.endTime ?? "16:00"} required dir="ltr" error={bad("endTime")} />
      <FormField name="graceMinutes" id={`${idPrefix}-grace`} label={t("grace")} hint={t("graceHint")} defaultValue={shift?.graceMinutes ?? 15} inputMode="numeric" required dir="ltr" error={bad("graceMinutes")} />
      <FormField name="ramadanHours" id={`${idPrefix}-ramadan`} label={t("ramadanHours")} hint={t("ramadanHint")} defaultValue={shift?.ramadanHours ?? 6} inputMode="decimal" required dir="ltr" error={bad("ramadanHours")} />
      <fieldset className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3 2xl:col-span-4">
        <legend className="mb-2 text-label">{t("workDays")}</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 text-label has-[:checked]:border-indigo has-[:checked]:bg-indigo/10 has-[:checked]:text-indigo">
              <input type="checkbox" name="workDays" value={d} defaultChecked={days.includes(d)} className="size-4 accent-indigo" />
              {weekdayName(locale, d)}
            </label>
          ))}
        </div>
        {bad("workDays") && <p className="text-caption text-brick">{bad("workDays")}</p>}
      </fieldset>
    </>
  );
}

/** Shifts: an add form across the width, then a card per shift. */
export function ShiftsManager({ shifts }: { shifts: Shift[] }) {
  const t = useTranslations("attendance.shifts");
  const locale = useLocale();
  const errorText = useErrorText();
  const [added, setAdded] = useState(0);
  const [state, action, pending] = useActionState<AttendanceState, FormData>(async (prev: AttendanceState, fd: FormData) => {
    const result = await saveShift(null, prev, fd);
    if (result?.ok) setAdded((n) => n + 1);
    return result;
  }, undefined);

  return (
    <div className="flex flex-col gap-6">
      <form key={added} action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
        <input type="hidden" name="uiLocale" value={locale} />
        <p className="mb-5 text-card">{t("add")}</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <ShiftFields state={state} idPrefix="new-shift" />
        </div>
        <Button type="submit" disabled={pending} className="mt-5">
          <Plus aria-hidden />
          {t("addSubmit")}
        </Button>
        {errorText(state) && (
          <p role="alert" className="mt-4 text-label text-brick">
            {errorText(state)}
          </p>
        )}
      </form>

      {shifts.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shifts.map((s) => (
            <ShiftCard key={s.id} shift={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShiftCard({ shift: s }: { shift: Shift }) {
  const t = useTranslations("attendance.shifts");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [saveState, save, saving] = useActionState<AttendanceState, FormData>(async (prev: AttendanceState, fd: FormData) => {
    const result = await saveShift(s.id, prev, fd);
    if (result?.ok) setMode("view");
    return result;
  }, undefined);
  const [deleteState, remove, removing] = useActionState<AttendanceState, FormData>(deleteShift.bind(null, s.id), undefined);
  const name = (locale === "en" && s.nameEn) || s.nameAr;
  const error = errorText(saveState) ?? errorText(deleteState);

  return (
    <li className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      {mode === "edit" ? (
        <form action={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />
          <ShiftFields shift={s} state={saveState} idPrefix={`shift-${s.id}`} />
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
                {s.startTime} – {s.endTime}
              </bdi>{" "}
              · {t("graceValue", { minutes: s.graceMinutes })}
            </span>
            <span className="text-secondary">{s.workDays.map((d) => weekdayName(locale, d, "short")).join(" · ")}</span>
            <span className="text-secondary">{t("employees", { count: s.employees })}</span>
          </div>
          <div className="flex flex-wrap gap-1">
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
