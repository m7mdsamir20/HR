import { getTranslations } from "next-intl/server";
import { CompanyProfileForm, LogoForm } from "@/components/settings/settings-forms";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { signedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

// Company profile and logo (owner can edit; HR can view). Branches and shifts live in sibling tabs.
export default async function SettingsPage({ params }: PageProps<"/[locale]/settings">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "hr"]);
  const t = await getTranslations({ locale, namespace: "settings" });

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name_ar, name_en, commercial_reg, tax_number, phone, email, address, logo_path")
    .eq("id", member.company.id)
    .single();
  const logoUrl = await signedUrl(company?.logo_path ?? null, 600);
  const isOwner = member.role === "owner";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{t("title")}</h1>
      </div>

      <SettingsTabs />

      {company && (
        <div className="flex flex-col gap-6 pt-2">
          <CompanyProfileForm
            defaults={{
              nameAr: company.name_ar,
              nameEn: company.name_en ?? "",
              commercialReg: company.commercial_reg ?? "",
              taxNumber: company.tax_number ?? "",
              phone: company.phone ?? "",
              email: company.email ?? "",
              address: company.address ?? "",
            }}
            canEdit={isOwner}
          />
          <LogoForm logoUrl={logoUrl} canEdit={isOwner} />
        </div>
      )}
    </main>
  );
}
