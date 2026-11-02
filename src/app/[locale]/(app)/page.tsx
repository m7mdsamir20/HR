import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "app" });
  const tRoles = await getTranslations({ locale, namespace: "roles" });

  // RLS returns only rows this member may see; for their own row that's always allowed.
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("employees")
    .select("national_id")
    .eq("id", member.employee_id)
    .single();

  const name = (locale === "en" && member.full_name_en) || member.full_name_ar;
  const companyName = (locale === "en" && member.company.name_en) || member.company.name_ar;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-page">{t("greeting", { name })}</h1>

      <section aria-labelledby="profile-title" className="rounded-card border border-line bg-surface p-4 md:p-6">
        <h2 id="profile-title" className="mb-4 text-section">
          {t("profileTitle")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label={t("fullName")} value={name} />
          <Item label={t("nationalId")} value={<bdi dir="ltr" className="tabular-nums">{me?.national_id}</bdi>} />
          <Item label={t("role")} value={tRoles(member.role)} />
          <Item label={t("company")} value={companyName} />
        </dl>
      </section>

      <p className="text-secondary">{t("comingNext")}</p>
    </main>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-secondary">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
