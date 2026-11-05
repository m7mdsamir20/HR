import { AppHeader } from "@/components/app/app-header";
import { AppNav } from "@/components/app/app-nav";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { signedUrl } from "@/lib/storage";
import { unreadNotifications } from "@/lib/task-data";

// Company workspace shell. Only the company's own name and logo show here: there is no product
// name (CLAUDE.md §1). Sidebar on desktop, top header with actions & user profile, bottom tab bar on phones.
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const companyName = (locale === "en" && member.company.name_en) || member.company.name_ar;
  const myName = (locale === "en" && member.full_name_en) || member.full_name_ar;
  const [logo, unread] = await Promise.all([signedUrl(member.company.logo_path, 3600), unreadNotifications()]);

  const brand = (
    <span className="flex min-w-0 items-center gap-2.5">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="size-9 shrink-0 rounded-control border border-line bg-surface object-contain"
        />
      )}
      <span className="truncate font-semibold text-card text-ink">{companyName}</span>
    </span>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden border-e border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col">
        <div className="px-4 pt-6 pb-4">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3 py-1">
          <AppNav role={member.role} variant="sidebar" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header with Notifications, Language Switcher (EN/AR), and Profile/Logout Dropdown */}
        <AppHeader
          name={myName}
          role={member.role}
          companyId={member.company.id}
          companyName={companyName}
          logo={logo}
          unread={unread}
          companies={member.companies}
        />

        {/* Content container */}
        <div className="w-full flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-8 md:pb-8">{children}</div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <AppNav role={member.role} variant="tabs" />
    </div>
  );
}
