"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { switchCompany } from "@/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/i18n/routing";
import type { CompanySummary } from "@/lib/auth/account";
import { cn } from "@/lib/utils";

interface CompanySwitcherProps {
  currentCompanyId: string;
  companies: CompanySummary[];
}

export function CompanySwitcher({ currentCompanyId, companies }: CompanySwitcherProps) {
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  if (companies.length <= 1) return null;

  const current = companies.find((c) => c.id === currentCompanyId) ?? companies[0];
  const name = (locale === "en" && current?.name_en) || current?.name_ar || "";

  const handleSelect = (companyId: string) => {
    if (companyId === currentCompanyId || pending) return;
    startTransition(async () => {
      await switchCompany(companyId, locale);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label="تبديل المنشأة"
          className={cn(
            "flex h-9 max-w-56 items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-label font-medium text-ink transition-colors",
            "hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo disabled:opacity-50"
          )}
        >
          <Building2 className="size-4 shrink-0 text-indigo" aria-hidden />
          <span className="truncate">{name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-soft ms-auto" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64 p-1">
        <DropdownMenuLabel className="px-2 py-1.5 text-caption font-medium text-secondary">
          منشآتي ({companies.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {companies.map((c) => {
          const compName = (locale === "en" && c.name_en) || c.name_ar;
          const isSelected = c.id === currentCompanyId;

          return (
            <DropdownMenuItem
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className={cn(
                "flex items-center justify-between gap-2 px-2.5 py-2 cursor-pointer rounded-control",
                isSelected && "bg-indigo/5 text-indigo font-semibold"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="size-4 shrink-0 text-ink-soft" aria-hidden />
                <span className="truncate">{compName}</span>
              </div>
              {isSelected && <Check className="size-4 shrink-0 text-indigo" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
