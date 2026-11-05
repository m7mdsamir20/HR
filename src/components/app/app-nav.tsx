"use client";

import {
  Banknote,
  BarChart3,
  CalendarDays,
  Clock,
  HandCoins,
  House,
  ListChecks,
  Network,
  Settings,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type Key =
  | "home"
  | "tasks"
  | "myTasks"
  | "employees"
  | "team"
  | "attendance"
  | "analytics"
  | "leave"
  | "payroll"
  | "advances"
  | "departments"
  | "branches"
  | "shifts"
  | "settings";

type Item = { href: string; key: Key; icon: typeof House; tab: boolean };

// Header now holds notifications, language switcher, profile dropdown and logout.
// Tab bar on phones holds the 5 primary daily actions.
function itemsFor(role: Role): Item[] {
  const isLeader = role === "owner" || role === "admin";
  const manages = isLeader || role === "manager";
  const items: Item[] = [
    { href: "/", key: "home", icon: House, tab: true },
  ];

  // Employees is right after Home, followed by Departments for Owner/Admin/HR
  if (isLeader || role === "hr") {
    items.push({ href: "/employees", key: "employees", icon: Users, tab: true });
    items.push({ href: "/departments", key: "departments", icon: Network, tab: false });
  } else if (role === "manager") {
    items.push({ href: "/employees", key: "team", icon: Users, tab: true });
  }

  // Tasks is now under Employees & Departments
  items.push({ href: "/tasks", key: manages ? "tasks" : "myTasks", icon: ListChecks, tab: true });

  // Attendance: owner goes directly to the attendance sheet
  items.push({
    href: role === "owner" ? "/attendance/sheet" : "/attendance",
    key: "attendance",
    icon: Clock,
    tab: true,
  });
  items.push({ href: "/analytics", key: "analytics", icon: BarChart3, tab: true });

  // Sidebar-only management modules
  items.push({ href: "/leave", key: "leave", icon: CalendarDays, tab: false });
  if (isLeader || role === "hr" || role === "employee") {
    items.push({ href: "/payroll", key: "payroll", icon: Banknote, tab: false });
    items.push({ href: "/advances", key: "advances", icon: HandCoins, tab: false });
  }
  if (isLeader || role === "hr") {
    items.push({ href: "/settings", key: "settings", icon: Settings, tab: false });
  }

  return items;
}

const isCurrent = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Sidebar links from md up; a bottom tab bar on phones. */
export function AppNav({ role, variant }: { role: Role; variant: "sidebar" | "tabs"; unread?: number }) {
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
                    current && "font-semibold text-indigo"
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="truncate max-w-16">{t(key)}</span>
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
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo",
              current && "bg-indigo/10 font-semibold text-indigo hover:bg-indigo/10 hover:text-indigo"
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            <span className="grow truncate">{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
