"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserProfileMenu } from "@/components/app/user-profile-menu";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  name: string;
  role: Role;
  companyName: string;
  logo: string | null;
  unread: number;
}

export function AppHeader({ name, role, companyName, logo, unread }: AppHeaderProps) {
  const tNav = useTranslations("nav");

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-xs md:px-8">
      {/* Start side: On mobile shows Company Brand since sidebar is hidden; on desktop kept clean */}
      <div className="flex min-w-0 items-center gap-2.5 md:hidden">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            className="size-8 shrink-0 rounded-control border border-line bg-surface object-contain"
          />
        )}
        <span className="truncate text-card font-semibold text-ink">{companyName}</span>
      </div>

      {/* Spacer for desktop to keep actions at the end */}
      <div className="hidden md:block" aria-hidden />

      {/* End side: Notifications, Language Switcher (EN/AR), and User Profile Dropdown */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3 ms-auto md:ms-0">
        {/* Notifications Icon Button */}
        <Link
          href="/notifications"
          title={tNav("notifications")}
          aria-label={tNav("notifications")}
          className={cn(
            "relative flex size-9 items-center justify-center rounded-control border border-line bg-surface text-ink-soft transition-colors",
            "hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
          )}
        >
          <Bell className="size-4.5" aria-hidden />
          {unread > 0 && (
            <span
              className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[10px] font-bold text-white tabular-nums"
              aria-label={tNav("unread", { count: unread })}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>

        {/* Language Switcher Button (EN / AR) */}
        <LocaleSwitcher />

        {/* User Profile & Logout Dropdown */}
        <UserProfileMenu name={name} role={role} companyName={companyName} />
      </div>
    </header>
  );
}
