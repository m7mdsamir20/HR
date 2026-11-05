import type { Locale } from "@/i18n/routing";
import { DepartmentsManager } from "@/components/departments/departments-manager";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export default async function DepartmentsPage({ params }: PageProps<"/[locale]/departments">) {
  const locale = (await params).locale as Locale;
  await requireMember(locale, ["owner", "hr"]);

  const supabase = await createClient();
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name_ar, name_en, employees(count)")
    .eq("employees.status", "active")
    .order("name_ar");

  return (
    <main className="flex flex-col gap-6">
      <DepartmentsManager
        departments={(departments ?? []).map((d) => ({
          id: d.id,
          nameAr: d.name_ar,
          nameEn: d.name_en ?? "",
          employees: d.employees[0]?.count ?? 0,
        }))}
      />
    </main>
  );
}
