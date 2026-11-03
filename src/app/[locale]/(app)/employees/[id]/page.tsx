import { ArrowRight, Download, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { updateEmployee } from "@/actions/employees";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { EmployeeActions } from "@/components/employees/employee-actions";
import { EmployeeForm } from "@/components/employees/employee-form";
import { FactsSection } from "@/components/form-section";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { assignableRoles, canManageEmployee } from "@/lib/auth/permissions";
import { nationalityName } from "@/lib/countries";
import { loadDocuments } from "@/lib/employee-documents";
import { employeeFormOptions, localName, one } from "@/lib/employees";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const EMPLOYEE_COLUMNS =
  "id, national_id, id_type, full_name_ar, full_name_en, phone, email, employee_number, job_title, occupation, role, status, department_id, manager_id, nationality, gender, birth_date, marital_status, hire_date, contract_type, contract_start, contract_end, probation_days, created_at, department:departments(name_ar, name_en), manager:manager_id(full_name_ar, full_name_en)";

export default async function EmployeePage({ params }: PageProps<"/[locale]/employees/[id]">) {
  const { locale: rawLocale, id: rawId } = await params;
  const locale = rawLocale as Locale;
  const member = await requireMember(locale, ["owner", "hr", "manager"]);
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  if (id.data === member.employee_id) redirect({ href: "/profile", locale });

  // RLS returns nothing outside the caller's reach; the pay row only to whoever manages the file.
  const supabase = await createClient();
  const [{ data: e }, { data: pay }] = await Promise.all([
    supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("id", id.data).neq("status", "deleted").maybeSingle(),
    supabase.from("employee_compensation").select("*").eq("employee_id", id.data).maybeSingle(),
  ]);
  if (!e) notFound();

  const t = await getTranslations({ locale, namespace: "employees" });
  const tRoles = await getTranslations({ locale, namespace: "roles" });
  const tPdf = await getTranslations({ locale, namespace: "pdf" });
  const name = localName(locale, e.full_name_ar, e.full_name_en);
  const status = e.status as "active" | "disabled";
  const manager = one(e.manager);
  const canManage = canManageEmployee(member, { id: e.id, role: e.role, status });
  const [options, documents] = await Promise.all([
    canManage ? employeeFormOptions(locale, e.id) : Promise.resolve(null),
    canManage ? loadDocuments(locale, e.id) : Promise.resolve([]),
  ]);
  const date = (d: string | null) => (d ? formatDate(locale, d) : null);
  const s = (x: string | number | null | undefined) => (x === null || x === undefined || x === "" ? "" : String(x));

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/employees" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {member.role === "manager" ? t("detail.backTeam") : t("detail.back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page">{name}</h1>
          <StatusPill tone={status === "active" ? "stamp" : "brick"}>{t(`status.${status}`)}</StatusPill>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={`${locale === "en" ? "/en" : ""}/employees/${e.id}/pdf`} target="_blank" rel="noopener">
                <Printer aria-hidden />
                {tPdf("view")}
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`${locale === "en" ? "/en" : ""}/employees/${e.id}/pdf?download=1`}>
                <Download aria-hidden />
                {tPdf("download")}
              </a>
            </Button>
          </div>
        )}
        <p className="text-secondary">
          {tRoles(e.role)} · <bdi dir="ltr">{e.national_id}</bdi> · {t("detail.createdAt")} {formatDateTime(locale, e.created_at)}
        </p>
      </div>

      {canManage && options ? (
        <>
          <EmployeeForm
            mode="edit"
            action={updateEmployee.bind(null, e.id)}
            roles={assignableRoles(member.role)}
            departments={options.departments}
            managers={options.managers}
            nationalities={options.nationalities}
            idType={e.id_type}
            defaults={{
              fullNameAr: e.full_name_ar,
              fullNameEn: s(e.full_name_en),
              nationality: s(e.nationality),
              gender: s(e.gender),
              birthDate: s(e.birth_date),
              maritalStatus: s(e.marital_status),
              phone: s(e.phone),
              email: s(e.email),
              employeeNumber: s(e.employee_number),
              jobTitle: s(e.job_title),
              occupation: s(e.occupation),
              role: e.role,
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
          <DocumentsPanel employeeId={e.id} documents={documents} canManage />
          <section aria-labelledby="account-actions" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 md:p-6">
            <h2 id="account-actions" className="text-card">
              {t("detail.actions")}
            </h2>
            <EmployeeActions employeeId={e.id} name={name} status={status} />
          </section>
        </>
      ) : (
        <>
          <FactsSection
            title={t("form.sections.identity")}
            items={[
              { label: t("form.nationality"), value: nationalityName(locale, e.nationality) },
              { label: t("form.gender"), value: e.gender ? t(`options.gender.${e.gender as "male"}`) : null },
              { label: t("form.phone"), value: e.phone ? <bdi dir="ltr">{e.phone}</bdi> : null },
              { label: t("form.email"), value: e.email ? <bdi dir="ltr">{e.email}</bdi> : null },
            ]}
          />
          <FactsSection
            title={t("form.sections.work")}
            items={[
              { label: t("columns.department"), value: e.department ? localName(locale, e.department.name_ar, e.department.name_en) : null },
              { label: t("columns.manager"), value: manager ? localName(locale, manager.full_name_ar, manager.full_name_en) : null },
              { label: t("form.jobTitle"), value: e.job_title },
              { label: t("form.hireDate"), value: date(e.hire_date) },
            ]}
          />
          <p className="text-secondary">{member.role === "manager" ? t("detail.readOnly") : t("detail.noActions")}</p>
        </>
      )}
    </main>
  );
}
