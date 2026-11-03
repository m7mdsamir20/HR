// Employee documents: types, expiry status and dual (Gregorian + Hijri) dates. CLAUDE.md §6.
import type { Tone } from "@/components/status-pill";
import type { Locale } from "@/i18n/routing";
import { daysBetween, todayInRiyadh } from "@/lib/format";

export const DOCUMENT_TYPES = ["iqama", "national_id", "work_permit", "passport", "health_card", "contract"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Alerts start 60 days before expiry (README §1-أ: 60, 30 and 15 days). */
export const EXPIRY_WARNING_DAYS = 60;

export type DocumentStatus = "valid" | "expiring" | "expired" | "noExpiry";

export function documentStatus(expiryDate: string | null, today: string = todayInRiyadh()): DocumentStatus {
  if (!expiryDate) return "noExpiry";
  const left = daysBetween(today, expiryDate);
  if (left < 0) return "expired";
  if (left <= EXPIRY_WARNING_DAYS) return "expiring";
  return "valid";
}

export const documentStatusTone: Record<Exclude<DocumentStatus, "noExpiry">, Tone> = {
  valid: "stamp",
  expiring: "saffron",
  expired: "brick",
};

/** "15 ربيع الآخر 1448 هـ" next to the Gregorian date, Latin digits. */
export function formatHijri(locale: Locale, isoDate: string): string {
  const tag = locale === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-u-ca-islamic-umalqura-nu-latn";
  return new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(new Date(isoDate));
}
