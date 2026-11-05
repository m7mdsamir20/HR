"use client";

import { Calendar, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface TaskDateFilterProps {
  todayStr: string;
  tomorrowStr: string;
  labels: {
    all: string;
    today: string;
    tomorrow: string;
    pickDate: string;
    clear: string;
  };
  className?: string;
}

export function TaskDateFilter({
  todayStr,
  tomorrowStr,
  labels,
  className,
}: TaskDateFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentDate = searchParams.get("date") ?? "";

  const setDate = (dateVal: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (dateVal) {
      sp.set("date", dateVal);
    } else {
      sp.delete("date");
    }
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  const isToday = currentDate === todayStr;
  const isTomorrow = currentDate === tomorrowStr;
  const isCustom = Boolean(currentDate && !isToday && !isTomorrow);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1 rounded-control border border-line bg-surface p-1">
        {/* Preset: All Dates */}
        <button
          type="button"
          onClick={() => setDate(null)}
          className={cn(
            "flex min-h-8 items-center rounded-[6px] px-3 text-label text-ink-soft transition-colors hover:text-ink",
            !currentDate && "bg-indigo/10 font-semibold text-indigo"
          )}
        >
          {labels.all}
        </button>

        {/* Preset: Today */}
        <button
          type="button"
          onClick={() => setDate(todayStr)}
          className={cn(
            "flex min-h-8 items-center rounded-[6px] px-3 text-label text-ink-soft transition-colors hover:text-ink",
            isToday && "bg-indigo/10 font-semibold text-indigo"
          )}
        >
          {labels.today}
        </button>

        {/* Preset: Tomorrow */}
        <button
          type="button"
          onClick={() => setDate(tomorrowStr)}
          className={cn(
            "flex min-h-8 items-center rounded-[6px] px-3 text-label text-ink-soft transition-colors hover:text-ink",
            isTomorrow && "bg-indigo/10 font-semibold text-indigo"
          )}
        >
          {labels.tomorrow}
        </button>
      </div>

      {/* Date Picker Input */}
      <div
        className={cn(
          "relative flex items-center rounded-control border bg-surface px-2.5 py-1 text-label transition-colors",
          currentDate ? "border-indigo bg-indigo/5 text-indigo font-semibold" : "border-line text-ink-soft hover:text-ink"
        )}
      >
        <Calendar className="size-4 shrink-0 me-1.5" aria-hidden />
        <span className="text-caption me-1.5 hidden sm:inline">{labels.pickDate}:</span>
        <input
          type="date"
          value={currentDate}
          onChange={(e) => setDate(e.target.value || null)}
          className="bg-transparent text-label font-sans outline-none cursor-pointer"
        />
        {currentDate && (
          <button
            type="button"
            onClick={() => setDate(null)}
            title={labels.clear}
            className="ms-1.5 rounded-full p-0.5 text-ink-soft hover:bg-paper hover:text-ink transition-colors"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Notice if custom date selected */}
      {isCustom && (
        <span className="text-caption text-secondary">
          <bdi dir="ltr">{currentDate}</bdi>
        </span>
      )}
    </div>
  );
}
