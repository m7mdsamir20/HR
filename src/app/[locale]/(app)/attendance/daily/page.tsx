import { CheckCircle2, Clock, FileText, MapPin, ShieldAlert, UserCheck, Users, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AttendanceTabs } from "@/components/attendance/attendance-tabs";
import { DayNav } from "@/components/attendance/day-nav";
import { ManualAttendanceDialog } from "@/components/attendance/manual-attendance-dialog";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { formatDate, formatDuration, formatTime, formatTimeString, todayInRiyadh } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function shiftDay(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export default async function DailyAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr", "manager"]);
  const t = await getTranslations({ locale, namespace: "attendance.daily" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  const query = await searchParams;
  const today = todayInRiyadh();
  const yesterday = shiftDay(today, -1);
  const rawDate = typeof query.date === "string" ? query.date : Array.isArray(query.date) ? query.date[0] : "";
  const selectedDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  const canCorrect = member.role === "owner" || member.role === "admin" || member.role === "hr";

  const supabase = await createClient();
  const [
    { data: employees },
    { data: records },
    { data: leaves },
    { data: shifts },
    { data: branches },
    { data: calendar },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name_ar, full_name_en, employee_number, national_id, job_title, shift_id, branch_id")
      .eq("status", "active")
      .neq("role", "owner")
      .order("employee_number", { ascending: true }),
    supabase
      .from("attendance_records")
      .select("id, employee_id, check_in_at, check_out_at, status, late_minutes, early_minutes, worked_minutes, check_in_outside, check_in_distance_m, correction_note")
      .eq("work_date", selectedDate),
    supabase
      .from("leave_requests")
      .select("id, employee_id, type")
      .eq("status", "approved")
      .lte("start_date", selectedDate)
      .gte("end_date", selectedDate),
    supabase.from("shifts").select("id, name_ar, name_en, start_time, end_time, work_days"),
    supabase.from("branches").select("id, name_ar, name_en"),
    supabase
      .from("company_calendar")
      .select("kind, name_ar, name_en")
      .lte("start_date", selectedDate)
      .gte("end_date", selectedDate),
  ]);

  const holiday = (calendar ?? []).find((c) => c.kind === "holiday");
  const shiftMap = new Map((shifts ?? []).map((s) => [s.id, s]));
  const branchMap = new Map((branches ?? []).map((b) => [b.id, b]));
  const recMap = new Map((records ?? []).map((r) => [r.employee_id, r]));
  const leaveSet = new Set((leaves ?? []).map((l) => l.employee_id));

  const dow = new Date(`${selectedDate}T00:00:00Z`).getUTCDay();

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let leaveCount = 0;

  const rows = (employees ?? []).map((emp) => {
    const rec = recMap.get(emp.id);
    const onLeave = leaveSet.has(emp.id);
    const shift = emp.shift_id ? shiftMap.get(emp.shift_id) : undefined;
    const branch = emp.branch_id ? branchMap.get(emp.branch_id) : undefined;
    const isWorkDay = shift ? shift.work_days.includes(dow) : true;

    let statusKey: "onTime" | "lateStatus" | "absentStatus" | "leaveStatus" | "offStatus" = "absentStatus";
    let statusTone: "stamp" | "brick" | "indigo" | "neutral" = "brick";
    let inTime = "—";
    let outTime = "—";
    let workedStr = "—";
    let lateStr = "—";

    if (onLeave) {
      leaveCount += 1;
      statusKey = "leaveStatus";
      statusTone = "indigo";
    } else if (rec?.status === "absent") {
      absentCount += 1;
      statusKey = "absentStatus";
      statusTone = "brick";
    } else if (rec?.check_in_at) {
      presentCount += 1;
      inTime = formatTime(locale, rec.check_in_at);
      if (rec.check_out_at) {
        outTime = formatTime(locale, rec.check_out_at);
      }
      if (rec.worked_minutes) {
        workedStr = formatDuration(rec.worked_minutes);
      } else if (rec.check_out_at) {
        const diffMs = new Date(rec.check_out_at).getTime() - new Date(rec.check_in_at).getTime();
        workedStr = formatDuration(Math.max(0, Math.floor(diffMs / 60000)));
      }

      if (rec.late_minutes > 0) {
        lateCount += 1;
        statusKey = "lateStatus";
        statusTone = "brick";
        lateStr = `${rec.late_minutes} د`;
      } else {
        statusKey = "onTime";
        statusTone = "stamp";
      }
    } else if (holiday || !isWorkDay) {
      statusKey = "offStatus";
      statusTone = "neutral";
    } else {
      absentCount += 1;
      statusKey = "absentStatus";
      statusTone = "brick";
    }

    const empName = (locale === "en" && emp.full_name_en) || emp.full_name_ar;
    const shiftName = shift ? ((locale === "en" && shift.name_en) || shift.name_ar) : "—";
    const branchName = branch ? ((locale === "en" && branch.name_en) || branch.name_ar) : "";

    return {
      emp,
      rec,
      empName,
      shiftName,
      branchName,
      statusKey,
      statusTone,
      inTime,
      outTime,
      workedStr,
      lateStr,
      shiftWindow: shift ? `${formatTimeString(locale, shift.start_time)} – ${formatTimeString(locale, shift.end_time)}` : "—",
      outside: rec?.check_in_outside,
      note: rec?.correction_note,
    };
  });

  const cell = "px-4 py-3 tabular-nums";

  return (
    <main className="flex flex-col gap-6">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col gap-1">
        <h1 className="text-page">{t("title")}</h1>
        <p className="text-caption text-secondary">{t("subtitle")}</p>
      </div>

      <AttendanceTabs role={member.role} />

      {/* Date Filter & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-4">
        <DayNav
          pathname="/attendance/daily"
          date={selectedDate}
          today={today}
          yesterday={yesterday}
        />

        <div className="flex flex-wrap items-center gap-3">
          {canCorrect && (
            <ManualAttendanceDialog
              employees={employees ?? []}
              today={selectedDate}
            />
          )}

          <Button asChild variant="secondary">
            <a
              href={`${locale === "en" ? "/en" : ""}/attendance/daily/pdf?date=${selectedDate}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              <FileText className="size-4" aria-hidden />
              {t("printPdf")}
            </a>
          </Button>
        </div>
      </div>

      {/* Daily KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption text-secondary">{t("totalEmployees")}</span>
            <Users className="size-4 text-secondary" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{employees?.length ?? 0}</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption text-stamp font-medium">{t("present")}</span>
            <UserCheck className="size-4 text-stamp" aria-hidden />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-bold text-stamp tabular-nums">{presentCount}</p>
            {employees && employees.length > 0 && (
              <span className="text-caption text-secondary">
                ({Math.round((presentCount / employees.length) * 100)}%)
              </span>
            )}
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption text-brick font-medium">{t("late")}</span>
            <Clock className="size-4 text-brick" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-bold text-brick tabular-nums">{lateCount}</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption text-brick font-medium">{t("absent")}</span>
            <XCircle className="size-4 text-brick" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-bold text-brick tabular-nums">{absentCount}</p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-card border border-indigo/30 bg-indigo/5 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption text-indigo font-medium">{t("leave")}</span>
            <CheckCircle2 className="size-4 text-indigo" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-bold text-indigo tabular-nums">{leaveCount}</p>
        </div>
      </div>

      {/* Daily Records Table */}
      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">
          {t("empty")}
        </p>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line text-label text-ink-soft bg-paper/50">
                  <th scope="col" className="px-3 py-3 text-center w-12 font-medium">#</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("employee")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">القسم / الفرع</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">{t("status")}</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">{t("checkIn")}</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">{t("checkOut")}</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">{t("duration")}</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">{t("lateMinutes")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("location")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("notes")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.emp.id} className="border-b border-line last:border-0 hover:bg-paper/40 transition-colors">
                    <td className="px-3 py-3 text-center text-secondary text-caption">{idx + 1}</td>
                    <th scope="row" className="px-4 py-3 text-start font-medium">
                      <Link
                        href={{ pathname: "/attendance/sheet", query: { month: selectedDate.slice(0, 7), employee: row.emp.id } }}
                        className="hover:underline focus-visible:outline-2 focus-visible:outline-indigo text-ink font-semibold"
                      >
                        {row.empName}
                      </Link>
                      {row.emp.employee_number && (
                        <span className="block text-2xs text-secondary font-mono mt-0.5">
                          #{row.emp.employee_number}
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3 text-start text-caption text-secondary">
                      <div>{row.emp.job_title || "—"}</div>
                      {row.branchName && (
                        <span className="text-2xs text-ink-soft block">{row.branchName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusPill tone={row.statusTone}>{t(row.statusKey)}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-semibold text-ink">
                      <bdi dir="ltr">{row.inTime}</bdi>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-semibold text-ink">
                      <bdi dir="ltr">{row.outTime}</bdi>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-caption text-secondary">
                      <bdi dir="ltr">{row.workedStr}</bdi>
                    </td>
                    <td className="px-4 py-3 text-center text-caption">
                      {row.lateStr !== "—" ? (
                        <span className="font-semibold text-brick font-mono">{row.lateStr}</span>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-start text-caption">
                      {row.rec?.check_in_at ? (
                        row.outside ? (
                          <span className="inline-flex items-center gap-1 text-saffron font-medium text-2xs">
                            <ShieldAlert className="size-3.5" aria-hidden />
                            {t("outsideRange")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-stamp font-medium text-2xs">
                            <MapPin className="size-3.5" aria-hidden />
                            {t("inRange")}
                          </span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-start text-caption text-secondary">
                      {row.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((row) => (
              <li key={row.emp.id}>
                <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                    <div>
                      <span className="text-card font-bold text-ink">{row.empName}</span>
                      <span className="block text-2xs text-secondary">{row.emp.job_title}</span>
                    </div>
                    <StatusPill tone={row.statusTone}>{t(row.statusKey)}</StatusPill>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-caption">
                    <div className="rounded bg-paper p-2">
                      <span className="text-2xs text-secondary block">{t("checkIn")}</span>
                      <span className="font-mono font-bold text-ink text-sm"><bdi dir="ltr">{row.inTime}</bdi></span>
                    </div>
                    <div className="rounded bg-paper p-2">
                      <span className="text-2xs text-secondary block">{t("checkOut")}</span>
                      <span className="font-mono font-bold text-ink text-sm"><bdi dir="ltr">{row.outTime}</bdi></span>
                    </div>
                    <div className="rounded bg-paper p-2">
                      <span className="text-2xs text-secondary block">{t("duration")}</span>
                      <span className="font-mono text-secondary"><bdi dir="ltr">{row.workedStr}</bdi></span>
                    </div>
                    <div className="rounded bg-paper p-2">
                      <span className="text-2xs text-secondary block">{t("lateMinutes")}</span>
                      <span className={row.lateStr !== "—" ? "font-bold text-brick font-mono" : "text-secondary"}>
                        {row.lateStr}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
