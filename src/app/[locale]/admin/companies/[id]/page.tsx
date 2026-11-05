import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { CompanyStatusButton } from "@/components/admin/company-status-button";
import { SubscriptionForm } from "@/components/admin/subscription-form";
import { StatusPill, type Tone } from "@/components/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/auth/account";
import { companyState, companyStateTone } from "@/lib/company-state";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const AUDIT_ACTIONS = [
  "company_insert",
  "company_update",
  "company_delete",
  "employee_insert",
  "employee_update",
  "employee_delete",
  "employee_password_reset",
  "employee_password_change",
  "department_insert",
  "department_update",
  "department_delete",
  "document_insert",
  "document_update",
  "document_delete",
  "compensation_insert",
  "compensation_update",
  "compensation_delete",
  "task_insert",
  "task_update",
  "task_delete",
  "task_approve",
  "branch_insert",
  "branch_update",
  "branch_delete",
  "shift_insert",
  "shift_update",
  "shift_delete",
  "calendar_insert",
  "calendar_update",
  "calendar_delete",
  "attendance_rules_insert",
  "attendance_rules_update",
  "attendance_assign",
  "attendance_correct",
  "leave_request",
  "leave_approve",
  "leave_reject",
  "leave_cancel",
  "leave_adjust",
  "deduction_approve",
  "deduction_waive",
  "deduction_reject",
  "payroll_run_create",
  "payroll_run_lock",
  "advance_request",
  "advance_approve",
  "advance_reject",
  "export_employee_card",
  "export_attendance_report",
  "export_leave_report",
  "export_payroll_wps",
] as const;

type AuditAction = (typeof AUDIT_ACTIONS)[number];
const isKnownAction = (a: string): a is AuditAction => (AUDIT_ACTIONS as readonly string[]).includes(a);

function auditActionTone(key: string): Tone {
  if (key.includes("approve") || key.includes("activate")) return "stamp";
  if (key.includes("reject") || key.includes("delete") || key.includes("cancel") || key.includes("waive")) return "brick";
  if (key.includes("update") || key.includes("correct") || key.includes("adjust") || key.includes("reset")) return "saffron";
  if (key.includes("insert") || key.includes("create") || key.includes("request") || key.includes("assign")) return "indigo";
  return "neutral";
}

export default async function CompanyPage({ params }: PageProps<"/[locale]/admin/companies/[id]">) {
  const { locale: rawLocale, id: rawId } = await params;
  const locale = rawLocale as Locale;
  await requirePlatformAdmin(locale);
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();

  const supabase = await createClient();
  const [{ data: company }, { data: owners }, { count: activeCount }, { data: activity }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name_ar, name_en, commercial_reg, status, max_employees, subscription_ends_at, created_at")
      .eq("id", id.data)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("id, full_name_ar, full_name_en, national_id, phone, status")
      .eq("company_id", id.data)
      .eq("role", "owner")
      .neq("status", "deleted")
      .order("created_at"),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id.data)
      .eq("status", "active"),
    supabase
      .from("audit_logs")
      .select("id, action, created_at")
      .eq("company_id", id.data)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (!company) notFound();

  const t = await getTranslations({ locale, namespace: "admin" });
  const name = (locale === "en" && company.name_en) || company.name_ar;
  const state = companyState(company);

  return (
    <main className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="inline-flex min-h-11 w-fit items-center gap-2 text-label text-ink-soft hover:text-ink">
          <ArrowRight className="size-4 ltr:-scale-x-100" aria-hidden />
          {t("companies.title")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-page">{name}</h1>
            <StatusPill tone={companyStateTone[state]}>{t(`status.${state}`)}</StatusPill>
          </div>
          <CompanyStatusButton companyId={company.id} companyName={name} suspended={company.status === "suspended"} />
        </div>
      </div>

      <dl className="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-4">
        <Fact label={t("company.commercialReg")} value={company.commercial_reg ? <bdi dir="ltr">{company.commercial_reg}</bdi> : "—"} />
        <Fact label={t("company.activeEmployees")} value={t("companies.seats", { used: activeCount ?? 0, max: company.max_employees })} />
        <Fact label={t("companies.endsAt")} value={formatDate(locale, company.subscription_ends_at)} />
        <Fact label={t("company.createdAt")} value={formatDateTime(locale, company.created_at)} />
      </dl>

      <div className="grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="subscription" className="flex flex-col gap-4">
          <h2 id="subscription" className="text-section">
            {t("company.subscriptionTitle")}
          </h2>
          <div className="rounded-card border border-line bg-surface p-4 md:p-6">
            <SubscriptionForm companyId={company.id} maxEmployees={company.max_employees} endsAt={company.subscription_ends_at} />
          </div>
        </section>

        <section aria-labelledby="owners" className="flex flex-col gap-4">
          <h2 id="owners" className="text-section">
            {t("company.owners")}
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {(owners ?? []).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <span className="flex flex-col">
                  <span className="font-semibold">{(locale === "en" && o.full_name_en) || o.full_name_ar}</span>
                  <span className="text-secondary tabular-nums">
                    <bdi dir="ltr">{o.national_id}</bdi>
                    {o.phone && (
                      <>
                        {"  ·  "}
                        <bdi dir="ltr">{o.phone}</bdi>
                      </>
                    )}
                  </span>
                </span>
                {o.status !== "active" && <StatusPill tone="brick">{t("lookup.employeeStatus.disabled")}</StatusPill>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="activity" className="flex flex-col gap-4">
        <h2 id="activity" className="text-section">
          {t("company.activity")}
        </h2>
        {activity && activity.length > 0 ? (
          <ol className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {activity.map((a) => {
              const key = a.action.replace(/\./g, "_");
              const label = isKnownAction(key) ? t(`company.actions.${key}`) : a.action.replace(/[._]/g, " ");
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <StatusPill tone={auditActionTone(key)}>{label}</StatusPill>
                  </div>
                  <span className="text-secondary tabular-nums text-sm">{formatDateTime(locale, a.created_at)}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-secondary">{t("company.noActivity")}</p>
        )}
      </section>
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
