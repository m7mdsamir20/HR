"use client";

import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { correctAttendance, type AttendanceState } from "@/actions/attendance";
import { DayRows, type DayRow } from "@/components/attendance/day-rows";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/format";

type Draft = { key: number; date: string; checkIn: string; checkOut: string; absent: boolean };

/** One employee's days for the month. Owner / HR also get the correction form, prefilled from a day. */
export function AttendanceDetail({ employeeId, days, canCorrect, today }: { employeeId: string; days: DayRow[]; canCorrect: boolean; today: string }) {
  const t = useTranslations("attendance.correct");
  const tErrors = useTranslations("errors");
  const tAttendance = useTranslations("attendance.errors");
  const locale = useLocale() as Locale;
  const [draft, setDraft] = useState<Draft>({ key: 0, date: today, checkIn: "", checkOut: "", absent: false });
  const [state, action, pending] = useActionState<AttendanceState, FormData>(async (prev: AttendanceState, fd: FormData) => {
    const result = await correctAttendance(prev, fd);
    if (result?.ok) setDraft((d) => ({ ...d, key: d.key + 1, checkIn: "", checkOut: "", absent: false }));
    return result;
  }, undefined);

  const invalid = (field: string) => (state && !state.ok && state.fields?.includes(field) ? t("invalid") : undefined);
  const errorText =
    state && !state.ok && state.error !== "invalid" ? (tAttendance.has(state.error) ? tAttendance(state.error) : tErrors(state.error as "unexpected")) : undefined;

  const edit = (d: DayRow) =>
    setDraft((prev) => ({
      key: prev.key + 1,
      date: d.date,
      checkIn: d.checkIn ? formatTime(locale, d.checkIn) : "",
      checkOut: d.checkOut ? formatTime(locale, d.checkOut) : "",
      absent: d.status === "absent",
    }));

  return (
    <div className="flex flex-col gap-6">
      {canCorrect && (
        <form key={draft.key} action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
          <input type="hidden" name="uiLocale" value={locale} />
          <input type="hidden" name="employeeId" value={employeeId} />
          <p className="text-card">{t("title")}</p>
          <p className="mb-5 text-secondary">{t("intro")}</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FormField name="date" type="date" label={t("date")} defaultValue={draft.date} max={today} required error={invalid("date")} dir="ltr" />
            <FormField name="checkIn" type="time" label={t("checkIn")} defaultValue={draft.checkIn} error={invalid("checkIn")} dir="ltr" />
            <FormField name="checkOut" type="time" label={t("checkOut")} defaultValue={draft.checkOut} error={invalid("checkOut")} dir="ltr" />
            <label className="flex min-h-11 items-center gap-2.5 self-end text-label">
              <input type="checkbox" name="absent" defaultChecked={draft.absent} className="size-5 accent-indigo" />
              {t("absent")}
            </label>
            <FormField name="note" label={t("note")} hint={t("noteHint")} required error={invalid("note")} className="sm:col-span-2 lg:col-span-3" />
            <Button type="submit" disabled={pending} className="self-end sm:w-fit">
              {t("submit")}
            </Button>
          </div>
          {errorText && (
            <p role="alert" className="mt-4 text-label text-brick">
              {errorText}
            </p>
          )}
          {state?.ok && (
            <p role="status" className="mt-4 text-label text-stamp">
              {t("saved")}
            </p>
          )}
        </form>
      )}

      <DayRows
        days={days}
        action={
          canCorrect
            ? (d) => (
                <Button type="button" variant="ghost" size="sm" onClick={() => edit(d)}>
                  <Pencil aria-hidden />
                  {t("edit")}
                </Button>
              )
            : undefined
        }
      />
    </div>
  );
}
