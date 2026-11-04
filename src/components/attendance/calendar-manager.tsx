"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { type AttendanceState } from "@/actions/attendance";
import { addCalendarEntry, deleteCalendarEntry } from "@/actions/attendance-setup";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";

type Entry = { id: string; kind: "holiday" | "ramadan"; nameAr: string; nameEn: string; startDate: string; endDate: string };

function errorOf(state: AttendanceState, t: (k: "invalid") => string, tAttendance: ReturnType<typeof useTranslations>, tErrors: ReturnType<typeof useTranslations>) {
  if (!state || state.ok) return undefined;
  if (state.error === "invalid") return t("invalid");
  return tAttendance.has(state.error) ? tAttendance(state.error) : tErrors(state.error);
}

/** Holidays and the Ramadan period: dated ranges the company enters each year. */
export function CalendarManager({ entries }: { entries: Entry[] }) {
  const t = useTranslations("attendance.calendar");
  const tCommon = useTranslations("common");
  const tAttendance = useTranslations("attendance.errors");
  const tErrors = useTranslations("errors");
  const locale = useLocale() as Locale;
  const [added, setAdded] = useState(0);
  const [state, action, pending] = useActionState<AttendanceState, FormData>(async (prev: AttendanceState, fd: FormData) => {
    const result = await addCalendarEntry(prev, fd);
    if (result?.ok) setAdded((n) => n + 1);
    return result;
  }, undefined);
  const bad = (f: string) => (state && !state.ok && state.fields?.includes(f) ? t(`fields.${f as "nameAr"}`) : undefined);
  const error = errorOf(state, (k) => t(`errors.${k}`), tAttendance, tErrors);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="calendar-heading">
      <div className="flex flex-col gap-1">
        <h2 id="calendar-heading" className="text-section">
          {t("title")}
        </h2>
        <p className="text-secondary">{t("intro")}</p>
      </div>
      <form key={added} action={action} className="rounded-card border border-line bg-surface p-4 md:p-6" noValidate>
        <input type="hidden" name="uiLocale" value={locale} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <SelectField
            name="kind"
            label={t("kind")}
            options={[
              { value: "holiday", label: t("kinds.holiday") },
              { value: "ramadan", label: t("kinds.ramadan") },
            ]}
          />
          <FormField name="nameAr" label={t("nameAr")} required dir="rtl" error={bad("nameAr")} />
          <FormField name="nameEn" label={t("nameEn")} optionalLabel={tCommon("optional")} dir="ltr" />
          <FormField name="startDate" type="date" label={t("startDate")} required dir="ltr" error={bad("startDate")} />
          <FormField name="endDate" type="date" label={t("endDate")} required dir="ltr" error={bad("endDate")} />
          <Button type="submit" disabled={pending} className="self-end sm:w-fit">
            <Plus aria-hidden />
            {t("add")}
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-label text-brick">
            {error}
          </p>
        )}
      </form>

      {entries.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryRow({ entry: e, locale }: { entry: Entry; locale: Locale }) {
  const t = useTranslations("attendance.calendar");
  const [state, remove, removing] = useActionState<AttendanceState, FormData>(deleteCalendarEntry.bind(null, e.id), undefined);
  const name = (locale === "en" && e.nameEn) || e.nameAr;
  return (
    <li className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-card">{name}</span>
          <StatusPill tone={e.kind === "ramadan" ? "indigo" : "neutral"}>{t(`kinds.${e.kind}`)}</StatusPill>
        </span>
        <span className="text-secondary">
          {e.startDate === e.endDate ? formatDate(locale, e.startDate) : `${formatDate(locale, e.startDate)} – ${formatDate(locale, e.endDate)}`}
        </span>
        {state && !state.ok && (
          <span role="alert" className="text-caption text-brick">
            {t("errors.invalid")}
          </span>
        )}
      </div>
      <form action={remove}>
        <input type="hidden" name="uiLocale" value={locale} />
        <Button type="submit" variant="ghost" size="icon" className="text-brick" disabled={removing} aria-label={t("remove", { name })}>
          <Trash2 aria-hidden />
        </Button>
      </form>
    </li>
  );
}
