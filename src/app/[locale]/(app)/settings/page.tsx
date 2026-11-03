import { getTranslations } from "next-intl/server";
import { CompanyProfileForm, LogoForm } from "@/components/settings/settings-forms";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { signedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

// Company profile and logo: the owner's. Departments have their own page.
export default async function SettingsPage({ params }: PageProps<"/[locale]/settings">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner"]);
  const t = await getTranslations({ locale, namespace: "settings" });

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name_ar, name_en, commercial_reg, logo_path")
    .eq("id", member.company.id)
    .single();
  const logoUrl = await signedUrl(company?.logo_path ?? null, 600);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-page">{t("title")}</h1>
      {company && (
        <>
          <CompanyProfileForm
            defaults={{ nameAr: company.name_ar, nameEn: company.name_en ?? "", commercialReg: company.commercial_reg ?? "" }}
          />
          <LogoForm logoUrl={logoUrl} />
        </>
      )}
    </main>
  );
}
