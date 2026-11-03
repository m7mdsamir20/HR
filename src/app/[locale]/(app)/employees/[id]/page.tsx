import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { updateEmployee } from "@/actions/employees";
import { EmployeeActions } from "@/components/employees/employee-actions";
import { EmployeeForm } from "@/components/employees/employee-form";
import { StatusPill } from "@/components/status-pill";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { assignableRoles, canManageEmployee } from "@/lib/auth/permissions";
import { employeeFormOptions, localName, one } from "@/lib/employees";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function EmployeePage({ params }: PageProps<"/[locale]/employees/[id]">) {
  const { locale: rawLocale, id: rawId } = await params;
  const locale = rawLocale as Locale;
  const member = await requireMember(locale, ["owner", "hr", "manager"]);
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  if (id.data === member.employee_id) redirect({ href: "/profile", locale });

  // RLS returns nothing for someone outside the caller's reach (another company, not on the team).
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("employees")
    .select(
      "id, national_id, full_name_ar, full_name_en, phone, job_title, role, status, department_id, manager_id, created_at, department:departments(name_ar, name_en), manager:manager_id(full_name_ar, full_name_en)",
    )
    .eq("id", id.data)
    .neq("status", "deleted")
    .maybeSingle();
  if (!e) notFound();

  const t = await getTranslations({ locale, namespace: "employees" });
  const tRoles = await getTranslations({ locale, namespace: "roles" });
  const name = localName(locale, e.full_name_ar, e.full_name_en);
  const status = e.status as "active" | "disabled";
  const manager = one(e.manager);
  const canManage = canManageEmployee(member, { id: e.id, role: e.role, status });
  const options = canManage ? await employeeFormOptions(locale, e.id) : null;

  return (
    <main className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/employees" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {member.role === "manager" ? t("detail.backTeam") : t("detail.back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page">{name}</h1>
          <StatusPill tone={status === "active" ? "stamp" : "brick"}>{t(`status.${status}`)}</StatusPill>
        </div>
        <p className="text-secondary">
          {tRoles(e.role)}
          {e.job_title && ` · ${e.job_title}`}
        </p>
      </div>

      <dl className="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-4">
        <Fact label={t("columns.nationalId")} value={<bdi dir="ltr">{e.national_id}</bdi>} />
        <Fact label={t("form.phone")} value={e.phone ? <bdi dir="ltr">{e.phone}</bdi> : "—"} />
        <Fact label={t("columns.department")} value={e.department ? localName(locale, e.department.name_ar, e.department.name_en) : "—"} />
        <Fact label={t("columns.manager")} value={manager ? localName(locale, manager.full_name_ar, manager.full_name_en) : "—"} />
        <Fact label={t("detail.createdAt")} value={formatDateTime(locale, e.created_at)} />
      </dl>

      {canManage && options ? (
        <>
          <section aria-labelledby="edit" className="flex flex-col gap-4">
            <h2 id="edit" className="text-section">
              {t("detail.edit")}
            </h2>
            <EmployeeForm
              mode="edit"
              action={updateEmployee.bind(null, e.id)}
              roles={assignableRoles(member.role)}
              departments={options.departments}
              managers={options.managers}
              defaults={{
                fullNameAr: e.full_name_ar,
                fullNameEn: e.full_name_en ?? "",
                phone: e.phone ?? "",
                jobTitle: e.job_title ?? "",
                role: e.role,
                departmentId: e.department_id ?? "",
                managerId: e.manager_id ?? "",
              }}
            />
          </section>
          <section aria-labelledby="account-actions" className="flex flex-col gap-4">
            <h2 id="account-actions" className="text-section">
              {t("detail.actions")}
            </h2>
            <EmployeeActions employeeId={e.id} name={name} status={status} />
          </section>
        </>
      ) : (
        <p className="text-secondary">{member.role === "manager" ? t("detail.readOnly") : t("detail.noActions")}</p>
      )}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-secondary">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
