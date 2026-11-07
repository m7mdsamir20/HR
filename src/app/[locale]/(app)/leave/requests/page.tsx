import { getTranslations } from "next-intl/server";
import { LeaveCancel, LeaveDecision } from "@/components/leave/leave-actions";
import { LeaveCard } from "@/components/leave/leave-card";
import { LeaveTabs } from "@/components/leave/leave-tabs";
import { ManualLeaveDialog } from "@/components/leave/manual-leave-dialog";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { localName } from "@/lib/employees";
import { todayInRiyadh } from "@/lib/format";
import type { LeaveStatus, LeaveType } from "@/lib/leave";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const FILTERS = ["action", "approved", "closed", "all"] as const;
type Filter = (typeof FILTERS)[number];

export default async function LeaveRequestsPage({ params, searchParams }: PageProps<"/[locale]/leave/requests">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr", "manager"]);
  const t = await getTranslations({ locale, namespace: "leave" });
  const query = await searchParams;
  const raw = Array.isArray(query.filter) ? query.filter[0] : query.filter;
  const filter: Filter = (FILTERS as readonly string[]).includes(raw ?? "") ? (raw as Filter) : "action";
  const today = todayInRiyadh();

  const supabase = await createClient();
  // Row level security scopes both queries: the company for owner / HR, the direct team for a manager.
  const [{ data: requests }, { data: employees }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, employee_id, type, start_date, end_date, days, status, reason, medical_ref, decision_note, days_full, days_three_quarter, days_unpaid")
      .neq("employee_id", member.employee_id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("employees").select("id, full_name_ar, full_name_en, role, manager_id, employee_number").neq("status", "deleted"),
  ]);
  const people = new Map((employees ?? []).map((e) => [e.id, e]));

  const isLeader = member.role === "owner" || member.role === "admin";
  const canCreateManual = isLeader || member.role === "hr" || member.role === "manager";
  const manualCandidates = (employees ?? []).filter((e) => {
    if (e.role === "owner" || e.role === "admin") return false;
    if (isLeader || member.role === "hr") return true;
    if (member.role === "manager") return e.manager_id === member.employee_id;
    return false;
  });

  // The same rule the database applies; the buttons are only shown when it would say yes.
  const canDecide = (status: string, employeeId: string) => {
    const e = people.get(employeeId);
    if (!e) return false;
    if (status === "pending_manager") return isLeader || (member.role === "manager" && e.manager_id === member.employee_id);
    if (status === "pending_hr") return isLeader || (member.role === "hr" && (e.role === "manager" || e.role === "employee"));
    return false;
  };
  const canCancel = (employeeId: string) => {
    const e = people.get(employeeId);
    return !!e && (isLeader || (member.role === "hr" && (e.role === "manager" || e.role === "employee")));
  };

  const rows = (requests ?? []).filter((r) => {
    if (filter === "action") return canDecide(r.status, r.employee_id);
    if (filter === "approved") return r.status === "approved";
    if (filter === "closed") return r.status === "rejected" || r.status === "cancelled";
    return true;
  });
  const waiting = (requests ?? []).filter((r) => canDecide(r.status, r.employee_id)).length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page">{t("title")}</h1>
        {canCreateManual && manualCandidates.length > 0 && (
          <ManualLeaveDialog employees={manualCandidates} today={today} />
        )}
      </div>
      <LeaveTabs role={member.role} />
      <p className="max-w-prose text-secondary">{t("inbox.intro")}</p>

      <nav aria-label={t("inbox.filter.label")} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={{ pathname: "/leave/requests", query: { filter: f } }}
            aria-current={filter === f ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-label text-ink-soft hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo",
              filter === f && "border-indigo bg-indigo/10 font-semibold text-indigo hover:bg-indigo/10",
            )}
          >
            {t(`inbox.filter.${f}`)}
            {f === "action" && waiting > 0 && <span className="rounded-full bg-brick px-1.5 text-caption text-on-accent tabular-nums">{waiting}</span>}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t(`inbox.empty.${filter}`)}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => {
            const e = people.get(r.employee_id);
            return (
              <LeaveCard
                key={r.id}
                row={{
                  id: r.id,
                  employeeName: e ? localName(locale, e.full_name_ar, e.full_name_en) : undefined,
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
                {canDecide(r.status, r.employee_id) && <LeaveDecision id={r.id} />}
                {r.status === "approved" && r.end_date >= today && canCancel(r.employee_id) && <LeaveCancel id={r.id} needsNote />}
              </LeaveCard>
            );
          })}
        </ul>
      )}
    </main>
  );
}
