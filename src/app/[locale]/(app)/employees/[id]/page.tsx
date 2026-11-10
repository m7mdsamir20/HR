import { ArrowRight, Pencil, Printer, ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { EmployeeStatusDialog } from "@/components/employees/employee-status-dialog";
import { FactsSection } from "@/components/form-section";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { canManageEmployee } from "@/lib/auth/permissions";
import { nationalityName } from "@/lib/countries";
import { localName, one } from "@/lib/employees";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const EMPLOYEE_COLUMNS =
  "id, national_id, id_type, iqama_start, iqama_end, full_name_ar, full_name_en, phone, email, employee_number, job_title, occupation, role, status, department_id, manager_id, nationality, gender, birth_date, marital_status, hire_date, employment_type, contract_type, contract_start, contract_end, probation_days, termination_type, termination_date, termination_reason, created_at, department:departments(name_ar, name_en), manager:manager_id(full_name_ar, full_name_en)";

export default async function EmployeeViewPage({ params }: PageProps<"/[locale]/employees/[id]">) {
  const { locale: rawLocale, id: rawId } = await params;
  const locale = rawLocale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr", "manager"]);
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
  const tPdf = await getTranslations({ locale, namespace: "pdf" });
  const name = localName(locale, e.full_name_ar, e.full_name_en);
  const status = e.status as "active" | "disabled" | "terminated";
  const manager = one(e.manager);
  const canManage = canManageEmployee(member, { id: e.id, role: e.role, status: e.status as "active" | "disabled" | "terminated" | "deleted" });

  const date = (d: string | null) => (d ? formatDate(locale, d) : null);

  const statusTone: Tone = status === "active" ? "stamp" : status === "disabled" ? "brick" : "saffron";

  // Compute total monthly gross salary
  const gross = pay
    ? Number(pay.basic_salary || 0) +
      Number(pay.housing_allowance || 0) +
      Number(pay.transport_allowance || 0) +
      Number(pay.communication_allowance || 0) +
      Number(pay.other_allowances || 0)
    : 0;

  return (
    <main className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3">
        <Link href="/employees" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {member.role === "manager" ? t("detail.backTeam") : t("detail.back")}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-page font-bold text-ink">{name}</h1>
            <StatusPill tone={statusTone}>{t(`status.${status}`)}</StatusPill>
            {e.employee_number && (
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-[6px] bg-paper text-ink border border-line">
                {e.employee_number}
              </span>
            )}
          </div>

          {/* Action Buttons: Print, Edit, Status/Termination */}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`${locale === "en" ? "/en" : ""}/employees/${e.id}/pdf`} target="_blank" rel="noopener">
                <Printer className="size-4" aria-hidden />
                {tPdf("view")}
              </a>
            </Button>

            {canManage && (
              <>
                <Button asChild variant="default" size="sm">
                  <Link href={`/employees/${e.id}/edit`}>
                    <Pencil className="size-4" aria-hidden />
                    {t("actions.edit")}
                  </Link>
                </Button>

                <EmployeeStatusDialog employeeId={e.id} name={name} status={status} />
              </>
            )}
          </div>
        </div>

        <p className="text-caption text-secondary">
          {t("detail.createdAt")} {formatDateTime(locale, e.created_at)}
        </p>
      </div>

      {/* Warning Banner if employee is terminated or disabled */}
      {status === "terminated" && (
        <div className="rounded-card border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 text-ink flex items-start gap-3">
          <ShieldAlert className="size-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
          <div className="flex flex-col gap-1 text-sm">
            <strong className="font-semibold text-amber-900 dark:text-amber-200">
              تم إنهاء خدمة الموظف ({e.termination_type ? t(`termination.types.${e.termination_type as "resignation"}`) : t("status.terminated")})
            </strong>
            <p className="text-caption text-secondary">
              تاريخ الانفصال: {e.termination_date ? formatDate(locale, e.termination_date) : "—"}
              {e.termination_reason && ` · ملاحظات: ${e.termination_reason}`}
            </p>
          </div>
        </div>
      )}

      {/* 1. البيانات الشخصية والهوية */}
      <FactsSection
        title={t("form.sections.identity")}
        items={[
          { label: t("form.fullNameAr"), value: e.full_name_ar },
          { label: t("form.fullNameEn"), value: e.full_name_en },
          { label: t("form.nationalId"), value: <bdi dir="ltr" className="font-mono">{e.national_id}</bdi> },
          { label: t("form.idType"), value: t(`form.idType${e.id_type === "citizen" ? "Citizen" : "Resident"}`) },
          { label: t("form.nationality"), value: nationalityName(locale, e.nationality) },
          ...(e.id_type === "resident"
            ? [
                { label: t("form.iqamaStart"), value: date(e.iqama_start) },
                { label: t("form.iqamaEnd"), value: date(e.iqama_end) },
              ]
            : []),
          { label: t("form.gender"), value: e.gender ? t(`options.gender.${e.gender as "male"}`) : null },
          { label: t("form.birthDate"), value: date(e.birth_date) },
          { label: t("form.maritalStatus"), value: e.marital_status ? t(`options.maritalStatus.${e.marital_status as "single"}`) : null },
          { label: t("form.phone"), value: e.phone ? <bdi dir="ltr">{e.phone}</bdi> : null },
          { label: t("form.email"), value: e.email ? <bdi dir="ltr">{e.email}</bdi> : null },
        ]}
      />

      {/* 2. بيانات العمل والوظيفة */}
      <FactsSection
        title={t("form.sections.work")}
        items={[
          { label: t("columns.code"), value: e.employee_number },
          { label: t("form.jobTitle"), value: e.job_title },
          { label: t("form.occupation"), value: e.occupation },
          { label: t("columns.department"), value: e.department ? localName(locale, e.department.name_ar, e.department.name_en) : null },
          { label: t("form.directManager"), value: manager ? localName(locale, manager.full_name_ar, manager.full_name_en) : null },
          { label: t("form.hireDate"), value: date(e.hire_date) },
        ]}
      />

      {/* 3. بيانات العقد */}
      {e.role !== "owner" && e.role !== "admin" && (
        <FactsSection
          title={t("form.sections.contract")}
          items={[
            { label: t("form.employmentType"), value: e.employment_type ? t(`options.employmentType.${e.employment_type as "full_time"}`) : null },
            { label: t("form.contractType"), value: e.contract_type ? t(`options.contractType.${e.contract_type as "fixed"}`) : null },
            { label: t("form.contractStart"), value: date(e.contract_start) },
            { label: t("form.contractEnd"), value: date(e.contract_end) },
            { label: t("form.probationDays"), value: e.probation_days !== null ? `${e.probation_days} ${locale === "ar" ? "يوم" : "days"}` : null },
          ]}
        />
      )}

      {/* 4. الراتب والبدلات والبيانات المالية (لمن يدير الملف فقط) */}
      {canManage && pay && e.role !== "owner" && e.role !== "admin" && (
        <FactsSection
          title={t("form.sections.pay")}
          items={[
            { label: t("form.basicSalary"), value: `${formatAmount(Number(pay.basic_salary || 0))} ${t("form.currency")}` },
            { label: t("form.housingAllowance"), value: `${formatAmount(Number(pay.housing_allowance || 0))} ${t("form.currency")}` },
            { label: t("form.transportAllowance"), value: `${formatAmount(Number(pay.transport_allowance || 0))} ${t("form.currency")}` },
            { label: t("form.communicationAllowance"), value: `${formatAmount(Number(pay.communication_allowance || 0))} ${t("form.currency")}` },
            { label: t("form.otherAllowances"), value: `${formatAmount(Number(pay.other_allowances || 0))} ${t("form.currency")}` },
            {
              label: t("form.totalSalary"),
              value: <strong className="text-ink font-bold">{formatAmount(gross)} {t("form.currency")}</strong>,
            },
            { label: t("form.bankName"), value: pay.bank_name },
            { label: t("form.iban"), value: pay.iban ? <bdi dir="ltr" className="font-mono">{pay.iban}</bdi> : null },
            { label: t("form.gosiNumber"), value: pay.gosi_number ? <bdi dir="ltr" className="font-mono">{pay.gosi_number}</bdi> : null },
          ]}
        />
      )}
    </main>
  );
}
