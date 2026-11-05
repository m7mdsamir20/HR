import { ArrowRight, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { updateEmployee } from "@/actions/employees";
import { EmployeeForm } from "@/components/employees/employee-form";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { canManageEmployee } from "@/lib/auth/permissions";
import { employeeFormOptions, localName } from "@/lib/employees";
import { createClient } from "@/lib/supabase/server";

const EMPLOYEE_COLUMNS =
  "id, national_id, id_type, iqama_start, iqama_end, full_name_ar, full_name_en, phone, email, employee_number, job_title, occupation, role, status, department_id, manager_id, nationality, gender, birth_date, marital_status, hire_date, contract_type, contract_start, contract_end, probation_days, created_at";

export default async function EmployeeEditPage({ params }: PageProps<"/[locale]/employees/[id]">) {
  const { locale: rawLocale, id: rawId } = await params;
  const locale = rawLocale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr"]);
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  if (id.data === member.employee_id) redirect({ href: "/profile", locale });

  const supabase = await createClient();
  const [{ data: e }, { data: pay }] = await Promise.all([
    supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("id", id.data).neq("status", "deleted").maybeSingle(),
    supabase.from("employee_compensation").select("*").eq("employee_id", id.data).maybeSingle(),
  ]);
  if (!e) notFound();

  const status = e.status as "active" | "disabled" | "terminated";
  const canManage = canManageEmployee(member, { id: e.id, role: e.role, status: e.status as "active" | "disabled" | "terminated" | "deleted" });
  if (!canManage) redirect({ href: `/employees/${e.id}`, locale });

  const [options, t, tPdf] = await Promise.all([
    employeeFormOptions(locale, e.id),
    getTranslations({ locale, namespace: "employees" }),
    getTranslations({ locale, namespace: "pdf" }),
  ]);
  if (!options) notFound();

  const name = localName(locale, e.full_name_ar, e.full_name_en);
  const s = (x: string | number | null | undefined) => (x === null || x === undefined || x === "" ? "" : String(x));
  const statusTone: Tone = status === "active" ? "stamp" : status === "disabled" ? "brick" : "saffron";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/employees/${e.id}`} className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          العودة لصفحة مشاهدة الموظف
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page font-bold text-ink">تعديل بيانات {name}</h1>
          <StatusPill tone={statusTone}>{t(`status.${status}`)}</StatusPill>
          {e.employee_number && (
            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-[6px] bg-paper text-ink border border-line">
              {e.employee_number}
            </span>
          )}
          <Button asChild variant="outline" size="sm" className="ms-auto">
            <a href={`${locale === "en" ? "/en" : ""}/employees/${e.id}/pdf`} target="_blank" rel="noopener">
              <Printer className="size-4" aria-hidden />
              {tPdf("view")}
            </a>
          </Button>
        </div>
      </div>

      <EmployeeForm
        mode="edit"
        action={updateEmployee.bind(null, e.id)}
        departments={options.departments}
        managers={options.managers}
        nationalities={options.nationalities}
        idType={e.id_type}
        defaults={{
          fullNameAr: e.full_name_ar,
          fullNameEn: s(e.full_name_en),
          nationalId: e.national_id,
          idType: e.id_type,
          nationality: s(e.nationality),
          iqamaStart: s(e.iqama_start),
          iqamaEnd: s(e.iqama_end),
          gender: s(e.gender),
          birthDate: s(e.birth_date),
          maritalStatus: s(e.marital_status),
          phone: s(e.phone),
          email: s(e.email),
          employeeNumber: s(e.employee_number),
          jobTitle: s(e.job_title),
          occupation: s(e.occupation),
          departmentId: s(e.department_id),
          managerId: s(e.manager_id),
          hireDate: s(e.hire_date),
          contractType: s(e.contract_type),
          contractStart: s(e.contract_start),
          contractEnd: s(e.contract_end),
          probationDays: s(e.probation_days),
          basicSalary: s(pay?.basic_salary),
          housingAllowance: s(pay?.housing_allowance),
          transportAllowance: s(pay?.transport_allowance),
          communicationAllowance: s(pay?.communication_allowance),
          otherAllowances: s(pay?.other_allowances),
          bankName: s(pay?.bank_name),
          iban: s(pay?.iban),
          gosiNumber: s(pay?.gosi_number),
        }}
      />
    </main>
  );
}
