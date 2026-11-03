"use client";

import { Bell, House, ListChecks, Network, Settings, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type Key = "home" | "tasks" | "myTasks" | "employees" | "team" | "departments" | "notifications" | "settings" | "profile";
type Item = { href: string; key: Key; icon: typeof House; badge?: boolean; tab: boolean };

// `tab: false` items live in the sidebar only; on phones they're reached from the home page.
function itemsFor(role: Role): Item[] {
  const manages = role === "owner" || role === "manager";
  const items: Item[] = [
    { href: "/", key: "home", icon: House, tab: true },
    { href: "/tasks", key: manages ? "tasks" : "myTasks", icon: ListChecks, tab: true },
  ];
  if (role === "owner" || role === "hr") items.push({ href: "/employees", key: "employees", icon: Users, tab: true });
  if (role === "manager") items.push({ href: "/employees", key: "team", icon: Users, tab: true });
  if (role === "owner" || role === "hr") items.push({ href: "/departments", key: "departments", icon: Network, tab: false });
  items.push({ href: "/notifications", key: "notifications", icon: Bell, badge: true, tab: true });
  if (role === "owner") items.push({ href: "/settings", key: "settings", icon: Settings, tab: false });
  items.push({ href: "/profile", key: "profile", icon: UserRound, tab: true });
  return items;
}

const isCurrent = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Sidebar links from md up; a bottom tab bar on phones (CLAUDE.md §6 layout). */
export function AppNav({ role, variant, unread = 0 }: { role: Role; variant: "sidebar" | "tabs"; unread?: number }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const all = itemsFor(role);
  const items = variant === "tabs" ? all.filter((i) => i.tab) : all;

  if (variant === "tabs") {
    return (
      <nav
        aria-label={t("label")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map(({ href, key, icon: Icon, badge }) => {
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
                  <span className="relative">
                    <Icon className="size-5" aria-hidden />
                    {badge && unread > 0 && <Badge count={unread} label={t("unread", { count: unread })} />}
                  </span>
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
      {items.map(({ href, key, icon: Icon, badge }) => {
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
            <span className="relative">
              <Icon className="size-4.5 shrink-0" aria-hidden />
              {badge && unread > 0 && <Badge count={unread} label={t("unread", { count: unread })} />}
            </span>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

function Badge({ count, label }: { count: number; label: string }) {
  return (
    <span className="absolute -top-1.5 -end-2 grid min-w-4 place-items-center rounded-full bg-brick px-1 text-[0.625rem] leading-4 font-semibold text-on-accent tabular-nums">
      <span aria-hidden>{count > 9 ? "9+" : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
