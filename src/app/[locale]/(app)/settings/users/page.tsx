import { getTranslations } from "next-intl/server";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { UsersManager, type EmployeeUserItem } from "@/components/settings/users-manager";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsUsersPage({ params }: PageProps<"/[locale]/settings/users">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr"]);
  const tSettings = await getTranslations({ locale, namespace: "settings" });

  const supabase = await createClient();
  const { data: rawEmployees } = await supabase
    .from("employees")
    .select("id, national_id, full_name_ar, full_name_en, job_title, role, user_id, locale, employee_number, departments(name_ar, name_en)")
    .eq("company_id", member.company.id)
    .neq("status", "deleted")
    .neq("role", "owner")
    .order("employee_number", { ascending: true, nullsFirst: false });

  const pick = (ar: string, en: string | null | undefined) => (locale === "en" && en) || ar;

  const employees: EmployeeUserItem[] = (rawEmployees ?? [])
    .map((e) => {
      const dept = Array.isArray(e.departments) ? e.departments[0] : e.departments;
      return {
        id: e.id,
        nationalId: e.national_id,
        name: pick(e.full_name_ar, e.full_name_en),
        jobTitle: e.job_title,
        departmentName: dept ? pick(dept.name_ar, dept.name_en) : null,
        role: e.role,
        hasUserAccount: !!e.user_id,
        locale: e.locale,
        employeeNumber: e.employee_number,
      };
    })
    .sort((a, b) => {
      if (!a.employeeNumber) return 1;
      if (!b.employeeNumber) return -1;
      return a.employeeNumber.localeCompare(b.employeeNumber, undefined, { numeric: true, sensitivity: "base" });
    });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{tSettings("title")}</h1>
      </div>

      <SettingsTabs />

      <div className="pt-2">
        <UsersManager employees={employees} canManage={member.role === "owner" || member.role === "admin" || member.role === "hr"} />
      </div>
    </main>
  );
}
