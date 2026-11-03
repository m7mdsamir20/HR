import { getTranslations } from "next-intl/server";
import { CompanyProfileForm, DepartmentsManager, LogoForm } from "@/components/settings/settings-forms";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { signedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

// Owner: company profile, logo and departments. HR: departments only.
export default async function SettingsPage({ params }: PageProps<"/[locale]/settings">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "hr"]);
  const t = await getTranslations({ locale, namespace: "settings" });
  const isOwner = member.role === "owner";

  const supabase = await createClient();
  const [{ data: company }, { data: departments }] = await Promise.all([
    isOwner
      ? supabase.from("companies").select("name_ar, name_en, commercial_reg, logo_path").eq("id", member.company.id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("departments")
      .select("id, name_ar, name_en, employees(count)")
      .eq("employees.status", "active")
      .order("name_ar"),
  ]);
  const logoUrl = isOwner ? await signedUrl(company?.logo_path ?? null, 600) : null;

  return (
    <main className="flex flex-col gap-10">
      <h1 className="text-page">{t("title")}</h1>

      {isOwner && company && (
        <>
          <section aria-labelledby="company" className="flex flex-col gap-4">
            <h2 id="company" className="text-section">
              {t("company.title")}
            </h2>
            <CompanyProfileForm
              defaults={{ nameAr: company.name_ar, nameEn: company.name_en ?? "", commercialReg: company.commercial_reg ?? "" }}
            />
          </section>

          <section aria-labelledby="logo-title" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="logo-title" className="text-section">
                {t("logo.title")}
              </h2>
              <p className="text-secondary">{t("logo.intro")}</p>
            </div>
            <LogoForm logoUrl={logoUrl} />
          </section>
        </>
      )}

      <section aria-labelledby="departments" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="departments" className="text-section">
            {t("departments.title")}
          </h2>
          <p className="text-secondary">{t("departments.intro")}</p>
        </div>
        <DepartmentsManager
          departments={(departments ?? []).map((d) => ({
            id: d.id,
            nameAr: d.name_ar,
            nameEn: d.name_en ?? "",
            employees: d.employees[0]?.count ?? 0,
          }))}
        />
      </section>
    </main>
  );
}
