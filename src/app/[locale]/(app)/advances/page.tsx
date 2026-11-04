import { getTranslations } from "next-intl/server";
import { AdvanceCard } from "@/components/advances/advance-card";
import { AdvanceRequestForm } from "@/components/advances/advance-request-form";
import { AdvanceTabs } from "@/components/advances/advance-tabs";
import type { Locale } from "@/i18n/routing";
import type { AdvanceStatus } from "@/lib/advances";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

export default async function AdvancesPage({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  const t = await getTranslations({ locale, namespace: "advances" });

  const supabase = await createClient();
  const { data: advances } = await supabase
    .from("advance_requests")
    .select("id, employee_id, amount, installments_count, monthly_installment, paid_amount, remaining_amount, reason, status, decision_note, created_at")
    .eq("employee_id", member.employee_id)
    .order("created_at", { ascending: false });

  const hasActiveOrPending = (advances ?? []).some(
    (a) => a.status === "pending" || (a.status === "approved" && a.remaining_amount > 0)
  );

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-secondary">{t("description")}</p>
      </div>

      <AdvanceTabs role={member.role} />

      {!hasActiveOrPending && <AdvanceRequestForm />}

      <section aria-labelledby="my-advances-heading" className="flex flex-col gap-4">
        <h2 id="my-advances-heading" className="text-section">
          {t("myAdvances")}
        </h2>

        {(advances ?? []).length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">
            {t("emptyMine")}
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {(advances ?? []).map((a) => (
              <AdvanceCard
                key={a.id}
                row={{
                  id: a.id,
                  employeeId: a.employee_id,
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
                canManage={member.role === "owner" || member.role === "hr"}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

