import { getTranslations } from "next-intl/server";
import { BranchesManager } from "@/components/attendance/branches-manager";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export default async function BranchesPage({ params }: PageProps<"/[locale]/branches">) {
  const locale = (await params).locale as Locale;
  await requireMember(locale, ["owner", "hr"]);
  const t = await getTranslations({ locale, namespace: "attendance.branches" });

  const supabase = await createClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name_ar, name_en, latitude, longitude, radius_m, employees(count)")
    .eq("employees.status", "active")
    .order("name_ar");

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-secondary">{t("intro")}</p>
      </div>
      <BranchesManager
        branches={(branches ?? []).map((b) => ({
          id: b.id,
          nameAr: b.name_ar,
          nameEn: b.name_en ?? "",
          latitude: Number(b.latitude),
          longitude: Number(b.longitude),
          radius: b.radius_m,
          employees: b.employees[0]?.count ?? 0,
        }))}
      />
    </main>
  );
}
