import { getTranslations } from "next-intl/server";
import { AssignForm } from "@/components/attendance/assign-form";
import { CalendarManager } from "@/components/attendance/calendar-manager";
import { RulesForm } from "@/components/attendance/rules-form";
import { ShiftsManager } from "@/components/attendance/shifts-manager";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { hhmm } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsShiftsPage({ params }: PageProps<"/[locale]/settings/shifts">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr"]);
  const tSettings = await getTranslations({ locale, namespace: "settings" });
  const tShifts = await getTranslations({ locale, namespace: "attendance.shifts" });
  const pick = (ar: string, en: string | null) => (locale === "en" && en) || ar;

  const supabase = await createClient();
  const [{ data: shifts }, { data: branches }, { data: departments }, { data: calendar }, { data: rules }, { data: employees }] = await Promise.all([
    supabase.from("shifts").select("id, name_ar, name_en, start_time, end_time, grace_minutes, ramadan_hours, work_days, employees(count)").eq("employees.status", "active").order("name_ar"),
    supabase.from("branches").select("id, name_ar, name_en").order("name_ar"),
    supabase.from("departments").select("id, name_ar, name_en").order("name_ar"),
    supabase.from("company_calendar").select("id, kind, name_ar, name_en, start_date, end_date").order("start_date", { ascending: false }).limit(100),
    supabase.from("attendance_rules").select("*").eq("company_id", member.company.id).single(),
    supabase.from("employees").select("id, full_name_ar, full_name_en, role, department_id, shift_id, branch_id").eq("status", "active").order("full_name_ar"),
  ]);

  const shiftNames = new Map((shifts ?? []).map((s) => [s.id, pick(s.name_ar, s.name_en)]));
  const branchNames = new Map((branches ?? []).map((b) => [b.id, pick(b.name_ar, b.name_en)]));
  // HR can't assign the owner or themself (the database says the same); the owner/admin can assign anyone.
  const isLeader = member.role === "owner" || member.role === "admin";
  const assignable = (employees ?? []).filter((e) => e.role !== "owner" && e.role !== "admin" && (isLeader || e.role !== "hr"));

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{tSettings("title")}</h1>
      </div>

      <SettingsTabs />

      <div className="flex flex-col gap-10 pt-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-card">{tShifts("title")}</h2>
          <p className="text-secondary">{tShifts("intro")}</p>
        </div>

        <ShiftsManager
          shifts={(shifts ?? []).map((s) => ({
            id: s.id,
            nameAr: s.name_ar,
            nameEn: s.name_en ?? "",
            startTime: hhmm(s.start_time),
            endTime: hhmm(s.end_time),
            graceMinutes: s.grace_minutes,
            ramadanHours: Number(s.ramadan_hours),
            workDays: s.work_days,
            employees: s.employees[0]?.count ?? 0,
          }))}
        />

        <AssignForm
          people={assignable.map((e) => ({
            id: e.id,
            name: pick(e.full_name_ar, e.full_name_en),
            departmentId: e.department_id,
            shift: e.shift_id ? (shiftNames.get(e.shift_id) ?? null) : null,
            branch: e.branch_id ? (branchNames.get(e.branch_id) ?? null) : null,
          }))}
          departments={(departments ?? []).map((d) => ({ value: d.id, label: pick(d.name_ar, d.name_en) }))}
          branches={(branches ?? []).map((b) => ({ value: b.id, label: pick(b.name_ar, b.name_en) }))}
          shifts={(shifts ?? []).map((s) => ({ value: s.id, label: pick(s.name_ar, s.name_en) }))}
        />

        <CalendarManager
          entries={(calendar ?? []).map((c) => ({
            id: c.id,
            kind: c.kind as "holiday" | "ramadan",
            nameAr: c.name_ar,
            nameEn: c.name_en ?? "",
            startDate: c.start_date,
            endDate: c.end_date,
          }))}
        />

        {rules && (
          <RulesForm
            canEdit={isLeader}
            rules={{
              tier1Minutes: rules.late_tier1_minutes,
              tier2Minutes: rules.late_tier2_minutes,
              tier3Minutes: rules.late_tier3_minutes,
              tier1Percent: Number(rules.late_tier1_fraction) * 100,
              tier2Percent: Number(rules.late_tier2_fraction) * 100,
              tier3Percent: Number(rules.late_tier3_fraction) * 100,
              tier4Percent: Number(rules.late_tier4_fraction) * 100,
              earlyGraceMinutes: rules.early_grace_minutes,
              absencePercent: Number(rules.absence_fraction) * 100,
            }}
          />
        )}
      </div>
    </main>
  );
}
