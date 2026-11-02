"use client";

import { Building2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", key: "companies", icon: Building2, match: (p: string) => p === "/admin" || p.startsWith("/admin/companies") },
  { href: "/admin/lookup", key: "lookup", icon: Search, match: (p: string) => p.startsWith("/admin/lookup") },
] as const;

export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("companies")} className="flex gap-1 md:flex-col">
      {items.map(({ href, key, icon: Icon, match }) => {
        const current = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-control px-3 text-label whitespace-nowrap text-ink-soft hover:bg-paper hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
              current && "bg-indigo/10 font-semibold text-indigo hover:bg-indigo/10 hover:text-indigo",
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
