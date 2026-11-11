"use client";

import { Calendar, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface TaskDateFilterProps {
  currentMonth?: string;
  labels: {
    all: string;
    monthSeptember: string;
    monthOctober: string;
    monthNovember: string;
    pickMonth: string;
    clear: string;
  };
  className?: string;
}

export function TaskDateFilter({
  labels,
  className,
}: TaskDateFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentMonth = searchParams.get("month") ?? "";
  const currentDate = searchParams.get("date") ?? "";

  const setMonth = (monthVal: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("date"); // clear specific date when switching month
    if (monthVal) {
      sp.set("month", monthVal);
    } else {
      sp.delete("month");
    }
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  const clearAllDates = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("month");
    sp.delete("date");
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  const isAll = !currentMonth && !currentDate;
  const isSep = currentMonth === "2026-09";
  const isOct = currentMonth === "2026-10";
  const isNov = currentMonth === "2026-11";
  const isCustomMonth = Boolean(currentMonth && !isSep && !isOct && !isNov);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-control border border-line bg-surface p-1">
        {/* Preset: All Months */}
        <button
          type="button"
          onClick={clearAllDates}
          className={cn(
            "flex min-h-8 items-center rounded-[6px] px-3 text-label text-ink-soft transition-colors hover:text-ink",
            isAll && "bg-indigo/10 font-semibold text-indigo"
          )}
        >
          {labels.all}
        </button>

        {/* Preset: September 2026 */}
        <button
          type="button"
          onClick={() => setMonth("2026-09")}
          className={cn(
            "flex min-h-8 items-center rounded-[6px] px-3 text-label text-ink-soft transition-colors hover:text-ink",
            isSep && "bg-indigo/10 font-semibold text-indigo"
          )}
        >
          {labels.monthSeptember}
        </button>

        {/* Preset: October 2026 */}
        <button
          type="button"
          onClick={() => setMonth("2026-10")}
          className={cn(
            "flex min-h-8 items-center rounded-[6px] px-3 text-label text-ink-soft transition-colors hover:text-ink",
            isOct && "bg-indigo/10 font-semibold text-indigo"
          )}
        >
          {labels.monthOctober}
        </button>

        {/* Preset: November 2026 */}
        <button
          type="button"
          onClick={() => setMonth("2026-11")}
          className={cn(
            "flex min-h-8 items-center rounded-[6px] px-3 text-label text-ink-soft transition-colors hover:text-ink",
            isNov && "bg-indigo/10 font-semibold text-indigo"
          )}
        >
          {labels.monthNovember}
        </button>
      </div>

      {/* Month Picker Input */}
      <div
        className={cn(
          "relative flex items-center rounded-control border bg-surface px-2.5 py-1 text-label transition-colors",
          currentMonth
            ? "border-indigo bg-indigo/5 text-indigo font-semibold"
            : "border-line text-ink-soft hover:text-ink"
        )}
      >
        <Calendar className="size-4 shrink-0 me-1.5" aria-hidden />
        <span className="text-caption me-1.5 hidden sm:inline">{labels.pickMonth}:</span>
        <input
          type="month"
          value={currentMonth}
          onChange={(e) => setMonth(e.target.value || null)}
          className="bg-transparent text-label font-sans outline-none cursor-pointer"
        />
        {currentMonth && (
          <button
            type="button"
            onClick={clearAllDates}
            title={labels.clear}
            className="ms-1.5 rounded-full p-0.5 text-ink-soft hover:bg-paper hover:text-ink transition-colors"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {isCustomMonth && (
        <span className="text-caption text-secondary">
          <bdi dir="ltr">{currentMonth}</bdi>
        </span>
      )}
    </div>
  );
}
