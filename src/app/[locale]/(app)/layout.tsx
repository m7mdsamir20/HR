import { AppNav } from "@/components/app/app-nav";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { signedUrl } from "@/lib/storage";
import { unreadNotifications } from "@/lib/task-data";

// Company workspace shell. Only the company's own name and logo show here: there is no product
// name (CLAUDE.md §1). Sidebar on the start side from md up, bottom tab bar on phones.
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const companyName = (locale === "en" && member.company.name_en) || member.company.name_ar;
  const myName = (locale === "en" && member.full_name_en) || member.full_name_ar;
  const [logo, unread] = await Promise.all([signedUrl(member.company.logo_path, 3600), unreadNotifications()]);

  const brand = (
    <span className="flex min-w-0 items-center gap-2.5">
      {logo && (
        // Signed, short-lived URL from private storage: next/image would cache it past its expiry.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="size-9 shrink-0 rounded-control border border-line bg-surface object-contain" />
      )}
      <span className="truncate text-card">{companyName}</span>
    </span>
  );

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden border-e border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col">
        <div className="px-4 pt-6 pb-4">{brand}</div>
        <div className="flex-1 px-3">
          <AppNav role={member.role} variant="sidebar" unread={unread} />
        </div>
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <p className="truncate px-3 text-secondary">{myName}</p>
          <LocaleSwitcher />
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:hidden">
          {brand}
          <div className="flex shrink-0 items-center gap-1">
            <LocaleSwitcher />
            <LogoutButton compact />
          </div>
        </header>
        {/* Bottom padding keeps content clear of the phone tab bar. */}
        <div className="w-full flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-8 md:pb-8">{children}</div>
      </div>

      <AppNav role={member.role} variant="tabs" unread={unread} />
    </div>
  );
}
