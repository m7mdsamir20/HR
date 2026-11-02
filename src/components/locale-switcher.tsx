"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("common");
  const next = locale === "ar" ? "en" : "ar";

  return (
    <Link
      href={pathname}
      locale={next}
      lang={next}
      className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 text-label hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
    >
      {t("switchTo")}
    </Link>
  );
}
