import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMonth } from "@/lib/format";
import { shiftMonth } from "@/lib/month";

/** Previous / next month links for a page that reads `?month=`. `query` carries the page's other filters. */
export function MonthNav({ pathname, month, query = {}, latest }: { pathname: string; month: string; query?: Record<string, string>; latest: string }) {
  const t = useTranslations("attendance.month");
  const locale = useLocale() as Locale;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  // The arrows point along reading direction, so they swap in RTL.
  const rtl = locale === "ar";
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const link = "grid size-11 place-items-center rounded-control border border-line bg-surface text-ink-soft hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo";

  return (
    <div className="flex items-center gap-2">
      <Link href={{ pathname, query: { ...query, month: prev } }} className={link} aria-label={t("previous")}>
        <PrevIcon className="size-5" aria-hidden />
      </Link>
      <p className="min-w-40 text-center text-card">{formatMonth(locale, month)}</p>
      {next <= latest ? (
        <Link href={{ pathname, query: { ...query, month: next } }} className={link} aria-label={t("next")}>
          <NextIcon className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className="size-11" aria-hidden />
      )}
    </div>
  );
}
