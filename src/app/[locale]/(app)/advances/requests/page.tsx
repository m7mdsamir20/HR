import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdvanceCard } from "@/components/advances/advance-card";
import { AdvanceTabs } from "@/components/advances/advance-tabs";
import type { Locale } from "@/i18n/routing";
import type { AdvanceStatus } from "@/lib/advances";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { loadNames } from "@/lib/task-data";

export default async function AdvanceRequestsPage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  if (member.role !== "owner" && member.role !== "hr") {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "advances" });
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("advance_requests")
    .select("id, employee_id, amount, installments_count, monthly_installment, paid_amount, remaining_amount, reason, status, decision_note, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const employeeIds = (requests ?? []).map((r) => r.employee_id);
  const names = await loadNames(locale, employeeIds);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-secondary">{t("description")}</p>
      </div>

      <AdvanceTabs role={member.role} />

      <section aria-labelledby="pending-heading" className="flex flex-col gap-4">
        <h2 id="pending-heading" className="text-section">
          {t("pendingRequests")}
        </h2>

        {(requests ?? []).length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">
            {t("emptyPending")}
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {(requests ?? []).map((a) => (
              <AdvanceCard
                key={a.id}
                row={{
                  id: a.id,
                  employeeId: a.employee_id,
                  employeeName: names.get(a.employee_id) ?? null,
                  amount: a.amount,
                  installmentsCount: a.installments_count,
                  monthlyInstallment: a.monthly_installment,
                  paidAmount: a.paid_amount,
                  remainingAmount: a.remaining_amount,
                  reason: a.reason,
                  status: a.status as AdvanceStatus,
                  decisionNote: a.decision_note,
                  createdAt: a.created_at,
                }}
                currentEmployeeId={member.employee_id}
                canManage={true}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
