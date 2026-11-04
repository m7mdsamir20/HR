// Display formatting. Latin digits everywhere, Gregorian calendar (CLAUDE.md §6).
import type { Locale } from "@/i18n/routing";

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB");

/** "30 سبتمبر 2026" / "30 September 2026" for a date-only ISO string (YYYY-MM-DD). */
export function formatDate(locale: Locale, isoDate: string): string {
  // Date-only strings parse as UTC midnight; format in UTC so the day never shifts.
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(isoDate));
}

/** Date and time in Riyadh for a timestamp. */
export function formatDateTime(locale: Locale, isoTimestamp: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(isoTimestamp));
}

/** Today's date in Riyadh as YYYY-MM-DD (subscriptions end at the end of that day there). */
export function todayInRiyadh(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(now);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** "08:15" in Riyadh for a timestamp (24-hour, Latin digits). */
export function formatTime(locale: Locale, isoTimestamp: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Riyadh" }).format(
    new Date(isoTimestamp),
  );
}

/** "الأحد 3 نوفمبر" for a date-only ISO string. */
export function formatDayShort(locale: Locale, isoDate: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(isoDate));
}

/** "نوفمبر 2026" for a YYYY-MM month. */
export function formatMonth(locale: Locale, month: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01`));
}

/** 135 → "2:15" (hours:minutes). */
export function formatDuration(totalMinutes: number): string {
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

/** Weekday name for 0 = Sunday ... 6 = Saturday. */
export function weekdayName(locale: Locale, dow: number, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + dow)));
}
