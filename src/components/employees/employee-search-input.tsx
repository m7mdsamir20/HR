"use client";

import { Loader2, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface EmployeeSearchInputProps {
  placeholder?: string;
  className?: string;
}

export function EmployeeSearchInput({ placeholder, className }: EmployeeSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const queryParam = searchParams.get("q") ?? "";
  const [prevQuery, setPrevQuery] = useState(queryParam);
  const [value, setValue] = useState(queryParam);
  const [isPending, startTransition] = useTransition();
  const isFirstRender = useRef(true);

  // Sync state during render when searchParams change (official React recommended pattern)
  if (prevQuery !== queryParam) {
    setPrevQuery(queryParam);
    setValue(queryParam);
  }

  // Debounced URL update
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const trimmed = value.trim();
      const currentParam = searchParams.get("q") ?? "";
      if (trimmed === currentParam) return;

      const sp = new URLSearchParams(searchParams.toString());
      if (trimmed) {
        sp.set("q", trimmed);
      } else {
        sp.delete("q");
      }

      startTransition(() => {
        router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, pathname, router, searchParams]);

  const handleClear = () => {
    setValue("");
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("q");
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  return (
    <div className={cn("relative flex w-full items-center", className)}>
      <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-soft">
        {isPending ? (
          <Loader2 className="size-4 animate-spin text-indigo" aria-hidden />
        ) : (
          <Search className="size-4" aria-hidden />
        )}
      </div>

      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-control border border-input bg-surface ps-9 pe-9 text-base text-ink transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute inset-y-0 end-0 flex items-center pe-3 text-ink-soft hover:text-ink transition-colors"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
