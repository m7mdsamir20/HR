"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { logout } from "@/actions/auth";
import { StatusPill } from "@/components/status-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import type { Role } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

interface UserProfileMenuProps {
  name: string;
  role: Role;
  companyName: string;
}

export function UserProfileMenu({ name, role, companyName }: UserProfileMenuProps) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tRoles = useTranslations("roles");
  const tNav = useTranslations("nav");

  const initial = name.trim().charAt(0).toUpperCase() || "م";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-label text-ink shadow-2xs transition-colors",
            "hover:bg-paper hover:border-line/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
          )}
          aria-label={name}
        >
          <div className="flex size-6.5 items-center justify-center rounded-full bg-indigo/10 text-caption font-bold text-indigo">
            {initial}
          </div>
          <span className="hidden max-w-28 truncate font-medium sm:inline-block md:max-w-36">
            {name}
          </span>
          <ChevronDown className="size-3.5 text-secondary" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        {/* User Identity Header */}
        <DropdownMenuLabel className="flex flex-col gap-2 p-3 font-normal">
          <span className="font-semibold text-ink text-sm truncate">{name}</span>
          <div className="flex items-center">
            <StatusPill tone="indigo">{tRoles(role)}</StatusPill>
          </div>
          <span className="text-caption text-secondary truncate">{companyName}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Profile Link */}
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2 text-ink">
            <UserRound className="size-4 text-ink-soft" aria-hidden />
            <span>{tNav("profile")}</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Logout Action */}
        <DropdownMenuItem asChild className="text-brick focus:bg-brick/10 focus:text-brick cursor-pointer">
          <form action={logout} className="w-full">
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="flex w-full items-center gap-2 text-start">
              <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
              <span>{t("logout")}</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
