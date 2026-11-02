import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/auth/account";

// Sidebar on the start side from md up (right in Arabic); a top bar with the same links on phones.
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const locale = (await params).locale as Locale;
  const admin = await requirePlatformAdmin(locale);
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-e md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 md:block md:px-4 md:pt-6">
          <p className="text-card">{t("panel")}</p>
          <div className="md:hidden">
            <LogoutButton compact />
          </div>
        </div>
        <div className="overflow-x-auto px-3 py-2 md:flex-1 md:py-4">
          <AdminNav />
        </div>
        <div className="hidden flex-col gap-2 border-t border-line p-3 md:flex">
          <p className="truncate px-3 text-secondary">{admin.full_name}</p>
          <LocaleSwitcher />
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="w-full px-4 py-6 md:px-8 md:py-8">{children}</div>
        <div className="flex justify-center pb-6 md:hidden">
          <LocaleSwitcher />
        </div>
      </div>
    </div>
  );
}
