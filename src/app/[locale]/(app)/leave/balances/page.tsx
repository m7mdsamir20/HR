import { getTranslations } from "next-intl/server";
import { AdjustForm } from "@/components/leave/leave-actions";
import { LeaveTabs } from "@/components/leave/leave-tabs";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { localName } from "@/lib/employees";
import { formatDays, type LeaveBalance } from "@/lib/leave";
import { createClient } from "@/lib/supabase/server";

export default async function LeaveBalancesPage({ params }: PageProps<"/[locale]/leave/balances">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "hr"]);
  const t = await getTranslations({ locale, namespace: "leave" });

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name_ar, full_name_en, role")
    .eq("status", "active")
    .order("full_name_ar")
    .limit(200);
  const people = employees ?? [];
  // One lookup per employee: the balance is worked out by the database, not re-implemented here.
  const balances = await Promise.all(
    people.map(async (e) => {
      const { data } = await supabase.rpc("leave_balance", { p_employee: e.id });
      return [e.id, data as unknown as LeaveBalance | null] as const;
    }),
  );
  const byId = new Map(balances);
  // HR can't adjust the owner or themself (the database says the same); the owner can adjust anyone.
  const adjustable = people.filter((e) => member.role === "owner" || (e.role !== "owner" && e.role !== "hr"));
  const cell = "px-4 py-3 tabular-nums";

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-page">{t("title")}</h1>
      <LeaveTabs role={member.role} />
      <p className="max-w-prose text-secondary">{t("balances.intro")}</p>

      <AdjustForm employees={adjustable.map((e) => ({ value: e.id, label: localName(locale, e.full_name_ar, e.full_name_en) }))} />

      <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
        <table className="w-full text-table">
          <thead>
            <tr className="border-b border-line text-label text-ink-soft">
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("balances.employee")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("balances.service")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("balances.earned")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("balances.used")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("balances.pending")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("balances.remaining")}</th>
              <th scope="col" className="px-4 py-3 text-start font-medium">{t("balances.sick")}</th>
            </tr>
          </thead>
          <tbody>
            {people.map((e) => {
              const b = byId.get(e.id);
              return (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-3 text-start font-medium">{localName(locale, e.full_name_ar, e.full_name_en)}</th>
                  <td className={cell}>{b ? b.years_of_service : "—"}</td>
                  <td className={cell}>{b ? formatDays(b.annual_earned + b.annual_adjustments) : "—"}</td>
                  <td className={cell}>{b ? formatDays(b.annual_used) : "—"}</td>
                  <td className={cell}>{b ? formatDays(b.annual_pending) : "—"}</td>
                  <td className={`${cell} font-semibold ${b && b.annual_remaining <= 3 ? "text-brick" : ""}`}>{b ? formatDays(b.annual_remaining) : "—"}</td>
                  <td className={cell}>{b ? `${b.sick_used + b.sick_pending}/120` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {people.map((e) => {
          const b = byId.get(e.id);
          return (
            <li key={e.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
              <span className="text-card">{localName(locale, e.full_name_ar, e.full_name_en)}</span>
              {b && (
                <span className="grid grid-cols-2 gap-x-4 gap-y-1 text-secondary tabular-nums">
                  <span>{t("balances.remaining")}: <b className={b.annual_remaining <= 3 ? "text-brick" : "text-ink"}>{formatDays(b.annual_remaining)}</b></span>
                  <span>{t("balances.earned")}: {formatDays(b.annual_earned + b.annual_adjustments)}</span>
                  <span>{t("balances.used")}: {formatDays(b.annual_used)}</span>
                  <span>{t("balances.sick")}: {b.sick_used + b.sick_pending}/120</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
