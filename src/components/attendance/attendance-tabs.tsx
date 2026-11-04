"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

/** The attendance module's own sections: my day for everyone, the sheet for whoever reviews, deductions for owner / HR. */
export function AttendanceTabs({ role }: { role: Role }) {
  const t = useTranslations("attendance.tabs");
  const pathname = usePathname();
  const tabs = [
    { href: "/attendance", key: "mine" as const, show: true },
    { href: "/attendance/sheet", key: "sheet" as const, show: role !== "employee" },
    { href: "/attendance/deductions", key: "deductions" as const, show: role === "owner" || role === "hr" },
  ].filter((x) => x.show);
  if (tabs.length < 2) return null;

  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map(({ href, key }) => {
          const current = pathname === href;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center border-b-2 border-transparent px-4 text-label text-ink-soft hover:text-ink",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo",
                  current && "border-indigo font-semibold text-indigo hover:text-indigo",
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
