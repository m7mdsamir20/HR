"use client";

import { Building2, CalendarClock, MapPin, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs() {
  const t = useTranslations("settings.tabs");
  const pathname = usePathname();

  const tabs = [
    { href: "/settings", label: t("company"), icon: Building2 },
    { href: "/settings/branches", label: t("branches"), icon: MapPin },
    { href: "/settings/shifts", label: t("shifts"), icon: CalendarClock },
    { href: "/settings/users", label: t("users"), icon: UserCheck },
  ];

  return (
    <div className="flex border-b border-line gap-2 overflow-x-auto pb-1" role="tablist">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-label border-b-2 font-medium transition-colors",
              active
                ? "border-indigo text-indigo font-semibold"
                : "border-transparent text-ink-soft hover:text-ink hover:border-line"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
