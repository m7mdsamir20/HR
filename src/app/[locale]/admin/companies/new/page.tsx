import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CreateCompanyForm } from "@/components/admin/create-company-form";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/auth/account";
import { todayInRiyadh } from "@/lib/format";

export default async function NewCompanyPage({ params }: PageProps<"/[locale]/admin/companies/new">) {
  const locale = (await params).locale as Locale;
  await requirePlatformAdmin(locale);
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {t("companies.title")}
        </Link>
        <h1 className="text-page">{t("create.title")}</h1>
      </div>
      <CreateCompanyForm minDate={todayInRiyadh()} />
    </main>
  );
}
