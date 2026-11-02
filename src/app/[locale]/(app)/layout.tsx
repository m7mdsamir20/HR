import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";

// Company workspace shell. Only the company's name shows here: there is no product name (CLAUDE.md §1).
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const companyName = (locale === "en" && member.company.name_en) || member.company.name_ar;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-8">
          <p className="truncate text-card">{companyName}</p>
          <div className="flex shrink-0 items-center gap-1">
            <LocaleSwitcher />
            <LogoutButton compact />
          </div>
        </div>
      </header>
      <div className="w-full flex-1 px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}
