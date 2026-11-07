"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function ReportsTabs() {
  const t = useTranslations("reports.tabs");
  const pathname = usePathname();

  const tabs = [
    { href: "/reports", key: "residents" as const },
    { href: "/reports/contracts", key: "contracts" as const },
  ];

  return (
    <nav aria-label={t("residents")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map(({ href, key }) => {
          const current = href === "/reports" ? pathname === "/reports" : pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center border-b-2 border-transparent px-4 text-label text-ink-soft hover:text-ink",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo",
                  current && "border-indigo font-semibold text-indigo hover:text-indigo"
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
