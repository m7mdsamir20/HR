"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function shiftDay(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function DayNav({
  pathname,
  date,
  today,
  yesterday,
}: {
  pathname: string;
  date: string;
  today: string;
  yesterday: string;
}) {
  const t = useTranslations("attendance.daily");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const prev = shiftDay(date, -1);
  const next = shiftDay(date, 1);
  const isToday = date === today;
  const isYesterday = date === yesterday;

  const rtl = locale === "ar";
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const btn =
    "grid size-10 place-items-center rounded-control border border-line bg-surface text-ink-soft hover:bg-paper transition-colors focus-visible:outline-2 focus-visible:outline-indigo";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Quick buttons */}
      <div className="flex items-center gap-1.5 me-1">
        <Link
          href={{ pathname, query: { date: today } }}
          className={cn(
            "px-3 py-1.5 rounded-full text-caption font-medium border transition-colors",
            isToday
              ? "bg-indigo text-white border-indigo shadow-xs"
              : "bg-surface text-secondary border-line hover:bg-paper hover:text-ink"
          )}
        >
          {t("today")}
        </Link>
        <Link
          href={{ pathname, query: { date: yesterday } }}
          className={cn(
            "px-3 py-1.5 rounded-full text-caption font-medium border transition-colors",
            isYesterday
              ? "bg-indigo text-white border-indigo shadow-xs"
              : "bg-surface text-secondary border-line hover:bg-paper hover:text-ink"
          )}
        >
          {t("yesterday")}
        </Link>
      </div>

      {/* Prev / Next & Date Display */}
      <div className="flex items-center gap-1.5 bg-surface border border-line rounded-control p-1">
        <Link
          href={{ pathname, query: { date: prev } }}
          className={btn}
          aria-label={t("prevDay")}
          title={t("prevDay")}
        >
          <PrevIcon className="size-4" aria-hidden />
        </Link>

        {/* Date Display and hidden/visible date picker */}
        <div className="relative flex items-center gap-2 px-3">
          <Calendar className="size-4 text-secondary shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-ink min-w-36 text-center select-none">
            {formatDate(locale, date)}
          </span>
          <input
            type="date"
            aria-label={t("filterDate")}
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                router.push({ pathname, query: { date: e.target.value } });
              }
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            title={t("filterDate")}
          />
        </div>

        <Link
          href={{ pathname, query: { date: next } }}
          className={btn}
          aria-label={t("nextDay")}
          title={t("nextDay")}
        >
          <NextIcon className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
