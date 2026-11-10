import { getTranslations } from "next-intl/server";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { FactsSection } from "@/components/form-section";
import { ChangePasswordForm, LanguageForm } from "@/components/profile/profile-forms";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { nationalityName } from "@/lib/countries";
import { loadDocuments } from "@/lib/employee-documents";
import { localName } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type Pay = {
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  communication_allowance: number;
  other_allowances: number;
  bank_name: string | null;
  iban: string | null;
  gosi_number: string | null;
};
type MyProfile = Record<string, string | number | null> & { pay: Pay | null };

export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "profile" });
  const te = await getTranslations({ locale, namespace: "employees" });
  const tRoles = await getTranslations({ locale, namespace: "roles" });

  // Own record and own pay; the manager by name only (my_profile RPC).
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_profile");
  const me = (data ?? {}) as MyProfile;
  const str = (k: string) => (me[k] === null || me[k] === undefined ? null : String(me[k]));
  const date = (k: string) => (str(k) ? formatDate(locale, str(k)!) : null);
  const ltr = (v: string | null) => (v ? <bdi dir="ltr">{v}</bdi> : null);
  const opt = (group: "gender" | "maritalStatus" | "contractType" | "employmentType", k: string) =>
    str(k) ? te(`options.${group}.${str(k)}` as "options.gender.male") : null;
  const amount = (v: number | undefined) => (
    <>
      <bdi dir="ltr">{formatAmount(v)}</bdi> <span className="text-secondary">{te("form.currency")}</span>
    </>
  );
  const documents = await loadDocuments(locale, member.employee_id);
  const pay = me.pay;
  const total = pay
    ? pay.basic_salary + pay.housing_allowance + pay.transport_allowance + pay.communication_allowance + pay.other_allowances
    : 0;

  const isStaff = member.role !== "owner" && member.role !== "admin";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{localName(locale, member.full_name_ar, member.full_name_en)}</h1>
        <p className="text-secondary">
          {tRoles(member.role)}
          {str("job_title") && ` · ${str("job_title")}`}
        </p>
      </div>

      <FactsSection
        title={te("form.sections.identity")}
        items={[
          { label: te("columns.nationalId"), value: ltr(str("national_id")) },
          { label: te("form.nationality"), value: nationalityName(locale, str("nationality")) },
          { label: te("form.gender"), value: opt("gender", "gender") },
          { label: te("form.birthDate"), value: date("birth_date") },
          { label: te("form.maritalStatus"), value: opt("maritalStatus", "marital_status") },
          { label: te("form.phone"), value: ltr(str("phone")) },
          { label: te("form.email"), value: ltr(str("email")) },
        ]}
      />
      {isStaff && (
        <>
          <FactsSection
            title={te("form.sections.work")}
            items={[
              { label: te("form.employeeNumber"), value: ltr(str("employee_number")) },
              { label: te("columns.department"), value: str("department_ar") ? localName(locale, str("department_ar")!, str("department_en")) : null },
              { label: te("columns.manager"), value: str("manager_ar") ? localName(locale, str("manager_ar")!, str("manager_en")) : null },
              { label: te("form.occupation"), value: str("occupation") },
              { label: te("form.hireDate"), value: date("hire_date") },
            ]}
          />
          <FactsSection
            title={te("form.sections.contract")}
            items={[
              { label: te("form.employmentType"), value: opt("employmentType", "employment_type") },
              { label: te("form.contractType"), value: opt("contractType", "contract_type") },
              { label: te("form.contractStart"), value: date("contract_start") },
              { label: te("form.contractEnd"), value: date("contract_end") },
              { label: te("form.probationDays"), value: str("probation_days") },
            ]}
          />
          {pay && (
            <FactsSection
              title={te("form.sections.pay")}
              items={[
                { label: te("form.basicSalary"), value: amount(pay.basic_salary) },
                { label: te("form.housingAllowance"), value: amount(pay.housing_allowance) },
                { label: te("form.transportAllowance"), value: amount(pay.transport_allowance) },
                { label: te("form.communicationAllowance"), value: amount(pay.communication_allowance) },
                { label: te("form.otherAllowances"), value: amount(pay.other_allowances) },
                { label: te("form.totalSalary"), value: amount(total) },
                { label: te("form.bankName"), value: pay.bank_name },
                { label: te("form.iban"), value: ltr(pay.iban) },
              ]}
            />
          )}
          <DocumentsPanel employeeId={member.employee_id} documents={documents} canManage={false} />
          <p className="text-secondary">{t("detailsNote")}</p>
        </>
      )}

      <ChangePasswordForm />
      <LanguageForm current={str("locale") === "en" ? "en" : "ar"} />
    </main>
  );
}
