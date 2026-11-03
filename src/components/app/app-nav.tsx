"use client";

import { House, Network, Settings, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type Item = { href: string; key: "home" | "employees" | "team" | "departments" | "settings" | "profile"; icon: typeof House };

function itemsFor(role: Role): Item[] {
  const items: Item[] = [{ href: "/", key: "home", icon: House }];
  if (role === "owner" || role === "hr") items.push({ href: "/employees", key: "employees", icon: Users });
  if (role === "manager") items.push({ href: "/employees", key: "team", icon: Users });
  if (role === "owner" || role === "hr") items.push({ href: "/departments", key: "departments", icon: Network });
  if (role === "owner") items.push({ href: "/settings", key: "settings", icon: Settings });
  items.push({ href: "/profile", key: "profile", icon: UserRound });
  return items;
}

const isCurrent = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Sidebar links from md up; a bottom tab bar on phones (CLAUDE.md §6 layout). */
export function AppNav({ role, variant }: { role: Role; variant: "sidebar" | "tabs" }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const items = itemsFor(role);

  if (variant === "tabs") {
    return (
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map(({ href, key, icon: Icon }) => {
            const current = isCurrent(pathname, href);
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-caption text-ink-soft",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo",
                    current && "font-semibold text-indigo",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label={t("label")} className="flex flex-col gap-1">
      {items.map(({ href, key, icon: Icon }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-control px-3 text-label text-ink-soft hover:bg-paper hover:text-ink",
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
