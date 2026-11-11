import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BalanceCards } from "@/components/leave/balance-cards";
import { LeaveCancel } from "@/components/leave/leave-actions";
import { LeaveCard } from "@/components/leave/leave-card";
import { LeaveTabs } from "@/components/leave/leave-tabs";
import { RequestForm } from "@/components/leave/request-form";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { todayInRiyadh } from "@/lib/format";
import type { LeaveBalance, LeaveStatus, LeaveType } from "@/lib/leave";
import { createClient } from "@/lib/supabase/server";

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export default async function LeavePage({ params }: PageProps<"/[locale]/leave">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  if (member.role === "owner") {
    redirect(`/${locale}/leave/requests`);
  }
  const t = await getTranslations({ locale, namespace: "leave" });
  const today = todayInRiyadh();

  const supabase = await createClient();
  const [{ data: balance }, { data: requests }, { data: me }] = await Promise.all([
    supabase.rpc("leave_balance", { p_employee: member.employee_id }),
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date, days, status, reason, medical_ref, decision_note, days_full, days_three_quarter, days_unpaid")
      .eq("employee_id", member.employee_id)
      .order("start_date", { ascending: false })
      .limit(50),
    supabase.from("employees").select("gender").eq("id", member.employee_id).single(),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-page">{t("title")}</h1>
      <LeaveTabs role={member.role} />

      {balance && <BalanceCards balance={balance as unknown as LeaveBalance} />}

      <RequestForm
        today={today}
        minDate={addDays(today, -30)}
        maxDate={addDays(today, 365)}
        genderLocked={me?.gender === "male" || me?.gender === "female" ? me.gender : null}
      />

      <section aria-labelledby="mine-heading" className="flex flex-col gap-4">
        <h2 id="mine-heading" className="text-section">
          {t("requests.title")}
        </h2>
        {(requests ?? []).length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("requests.empty")}</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {(requests ?? []).map((r) => (
              <LeaveCard
                key={r.id}
                row={{
                  id: r.id,
                  type: r.type as LeaveType,
                  startDate: r.start_date,
                  endDate: r.end_date,
                  days: r.days,
                  status: r.status as LeaveStatus,
                  reason: r.reason,
                  medicalRef: r.medical_ref,
                  decisionNote: r.decision_note,
                  daysFull: r.days_full,
                  daysThreeQuarter: r.days_three_quarter,
                  daysUnpaid: r.days_unpaid,
                }}
              >
                {(r.status === "pending_manager" || r.status === "pending_hr") && <LeaveCancel id={r.id} needsNote={false} />}
              </LeaveCard>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
