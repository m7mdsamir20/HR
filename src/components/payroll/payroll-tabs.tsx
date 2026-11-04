"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export function PayrollTabs({ role }: { role: Role }) {
  const t = useTranslations("payroll");
  const pathname = usePathname();
  const canManage = role === "owner" || role === "hr";

  const tabs = [
    { href: "/payroll", label: t("mySlips") },
    ...(canManage
      ? [
          { href: "/payroll/runs", label: t("allRuns") },
        ]
      : []),
  ];

  return (
    <div className="flex border-b border-line gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "whitespace-nowrap px-4 py-2 text-label border-b-2 font-medium transition-colors",
              active
                ? "border-indigo text-indigo"
                : "border-transparent text-ink-soft hover:text-ink hover:border-line"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

