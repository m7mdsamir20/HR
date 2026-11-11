import { getTranslations } from "next-intl/server";
import { AttendanceTabs } from "@/components/attendance/attendance-tabs";
import { CheckInPanel, type PanelState } from "@/components/attendance/check-in-panel";
import { DayRows } from "@/components/attendance/day-rows";
import { MonthNav } from "@/components/attendance/month-nav";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { hhmm, monthRange } from "@/lib/attendance";
import { leaveDayRows, monthParam, RECORD_COLUMNS, toDayRow } from "@/lib/attendance-data";
import { formatTime, formatTimeString, todayInRiyadh } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Current time in Riyadh as "HH:MM", to compare with the shift's end. */
const nowInRiyadh = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = Math.min(h * 60 + m + Math.round(hours * 60), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default async function AttendancePage({ params, searchParams }: PageProps<"/[locale]/attendance">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale);
  if (member.role === "owner" || member.role === "admin") {
    redirect({ href: "/attendance/daily", locale });
  }
  const t = await getTranslations({ locale, namespace: "attendance" });
  const month = monthParam((await searchParams).month);
  const today = todayInRiyadh();
  const { from, to } = monthRange(month);

  const supabase = await createClient();
  const { data: me } = await supabase.from("employees").select("shift_id, branch_id").eq("id", member.employee_id).single();
  const [shiftQuery, branchQuery, todayQuery, monthQuery, calendarQuery, leaveQuery] = await Promise.all([
    me?.shift_id
      ? supabase.from("shifts").select("name_ar, name_en, start_time, end_time, work_days, ramadan_hours").eq("id", me.shift_id).single()
      : null,
    me?.branch_id ? supabase.from("branches").select("name_ar, name_en").eq("id", me.branch_id).single() : null,
    supabase.from("attendance_records").select(RECORD_COLUMNS).eq("employee_id", member.employee_id).eq("work_date", today).maybeSingle(),
    supabase.from("attendance_records").select(RECORD_COLUMNS).eq("employee_id", member.employee_id).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false }),
    supabase.from("company_calendar").select("kind, name_ar, name_en").lte("start_date", today).gte("end_date", today),
    supabase
      .from("leave_requests")
      .select("id, type, start_date, end_date")
      .eq("employee_id", member.employee_id)
      .eq("status", "approved")
      .lte("start_date", to)
      .gte("end_date", from),
  ]);

  const shift = shiftQuery?.data ?? null;
  const branch = branchQuery?.data ?? null;
  const record = todayQuery.data;
  const calendar = calendarQuery.data ?? [];
  const holiday = calendar.find((c) => c.kind === "holiday");
  const ramadan = calendar.some((c) => c.kind === "ramadan");
  const pick = (ar: string, en: string | null) => (locale === "en" && en) || ar;

  let state: PanelState = "ready";
  let endTime = shift ? hhmm(shift.end_time) : "";
  if (shift && ramadan) endTime = addHours(hhmm(shift.start_time), Number(shift.ramadan_hours));

  if (!shift) state = "noShift";
  else if (record?.check_in_at) state = record.check_out_at ? "done" : "in";
  else if (holiday) state = "holiday";
  else if (!shift.work_days.includes(new Date(`${today}T00:00:00Z`).getUTCDay())) state = "dayOff";
  else if (nowInRiyadh() >= endTime) state = "shiftOver";

  const recorded = new Set((monthQuery.data ?? []).map((r) => r.work_date));
  const days = [
    ...(monthQuery.data ?? []).map((r) => toDayRow(r, today)),
    ...leaveDayRows(leaveQuery.data ?? [], { from, to }, shift?.work_days ?? [], recorded),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const todayRow = record ? toDayRow(record, today) : undefined;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-page">{t("title")}</h1>
      <AttendanceTabs role={member.role} />

      <CheckInPanel
        state={state}
        holidayName={holiday ? pick(holiday.name_ar, holiday.name_en) : undefined}
        shiftName={shift ? pick(shift.name_ar, shift.name_en) : undefined}
        branchName={branch ? pick(branch.name_ar, branch.name_en) : undefined}
        windowText={shift ? `${formatTimeString(locale, shift.start_time)} – ${formatTimeString(locale, endTime)}` : undefined}
        ramadanHours={shift && ramadan ? Number(shift.ramadan_hours) : undefined}
        checkInTime={record?.check_in_at ? formatTime(locale, record.check_in_at) : undefined}
        checkOutTime={record?.check_out_at ? formatTime(locale, record.check_out_at) : undefined}
        lateMinutes={record?.late_minutes}
        outside={todayRow?.outside}
        noLocation={todayRow?.noLocation}
      />

      <section className="flex flex-col gap-4" aria-labelledby="history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="history-heading" className="text-section">
            {t("history")}
          </h2>
          <MonthNav pathname="/attendance" month={month} latest={today.slice(0, 7)} />
        </div>
        <DayRows days={days} />
      </section>
    </main>
  );
}
