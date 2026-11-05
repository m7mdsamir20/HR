"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const next = locale === "ar" ? "en" : "ar";
  const label = locale === "ar" ? "EN" : "AR";
  const tooltip = locale === "ar" ? "Switch to English" : "التبديل إلى العربية";

  return (
    <Link
      href={pathname}
      locale={next}
      lang={next}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-control border border-line bg-surface text-caption font-bold text-ink-soft hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo transition-colors",
        className
      )}
    >
      {label}
    </Link>
  );
}
