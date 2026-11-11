import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { AttendanceDetail } from "@/components/attendance/attendance-detail";
import { AttendanceTabs } from "@/components/attendance/attendance-tabs";
import { ManualAttendanceDialog } from "@/components/attendance/manual-attendance-dialog";
import { MonthNav } from "@/components/attendance/month-nav";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { monthRange } from "@/lib/attendance";
import { leaveDates, leaveDayRows, monthParam, RECORD_COLUMNS, toDayRow } from "@/lib/attendance-data";
import { formatDuration, formatTimeString, todayInRiyadh } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Totals = { present: number; absent: number; leave: number; lateCount: number; lateMinutes: number; earlyMinutes: number; outside: number; missing: number };

export default async function AttendanceSheetPage({ params, searchParams }: PageProps<"/[locale]/attendance/sheet">) {
  const locale = (await params).locale as Locale;
  const member = await requireMember(locale, ["owner", "admin", "hr", "manager"]);
  const t = await getTranslations({ locale, namespace: "attendance" });
  const query = await searchParams;
  const month = monthParam(query.month);
  const today = todayInRiyadh();
  const { from, to } = monthRange(month);
  const canCorrect = member.role === "owner" || member.role === "admin" || member.role === "hr";

  const supabase = await createClient();
  // Row level security scopes both: owner / HR see the company, a manager sees the direct team.
  const [{ data: employees }, { data: records }, { data: leaves }, { data: shifts }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name_ar, full_name_en, employee_number, shift_id")
      .eq("status", "active")
      .neq("role", "owner")
      .order("full_name_ar"),
    supabase.from("attendance_records").select(RECORD_COLUMNS).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false }),
    supabase.from("leave_requests").select("id, employee_id, type, start_date, end_date").eq("status", "approved").lte("start_date", to).gte("end_date", from),
    supabase.from("shifts").select("id, name_ar, name_en, start_time, end_time, work_days"),
  ]);
  const shiftMap = new Map((shifts ?? []).map((x) => [x.id, x]));
  const workDaysOf = new Map((shifts ?? []).map((x) => [x.id, x.work_days]));

  const nameOf = (e: { full_name_ar: string; full_name_en: string | null }) => (locale === "en" && e.full_name_en) || e.full_name_ar;
  const selectedId = z.uuid().safeParse(Array.isArray(query.employee) ? query.employee[0] : query.employee);
  const selected = selectedId.success ? (employees ?? []).find((e) => e.id === selectedId.data) : undefined;

  if (selected) {
    const own = (records ?? []).filter((r) => r.employee_id === selected.id);
    const days = [
      ...own.map((r) => toDayRow(r, today)),
      ...leaveDayRows((leaves ?? []).filter((l) => l.employee_id === selected.id), { from, to }, workDaysOf.get(selected.shift_id ?? "") ?? [], new Set(own.map((r) => r.work_date))),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-page">{t("title")}</h1>
        <AttendanceTabs role={member.role} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost">
              <Link href={{ pathname: "/attendance/sheet", query: { month } }}>
                {locale === "ar" ? <ArrowRight aria-hidden /> : <ArrowLeft aria-hidden />}
                {t("sheet.back")}
              </Link>
            </Button>
            <h2 className="text-section">{nameOf(selected)}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canCorrect && (
              <>
                <ManualAttendanceDialog
                  employees={employees ?? []}
                  today={today}
                  defaultEmployeeId={selected.id}
                />
                <Button asChild variant="secondary">
                  <a href={`${locale === "en" ? "/en" : ""}/attendance/sheet/pdf?month=${month}&employee=${selected.id}`} target="_blank" rel="noopener noreferrer">
                    <FileText aria-hidden />
                    {t("sheet.employeePdf")}
                  </a>
                </Button>
              </>
            )}
            <MonthNav pathname="/attendance/sheet" month={month} query={{ employee: selected.id }} latest={today.slice(0, 7)} />
          </div>
        </div>
        <AttendanceDetail employeeId={selected.id} days={days} canCorrect={canCorrect} today={today} />
      </main>
    );
  }

  const totals = new Map<string, Totals>();
  for (const r of records ?? []) {
    const x = totals.get(r.employee_id) ?? { present: 0, absent: 0, leave: 0, lateCount: 0, lateMinutes: 0, earlyMinutes: 0, outside: 0, missing: 0 };
    const d = toDayRow(r, today);
    if (d.status === "absent") x.absent += 1;
    else x.present += 1;
    if (d.late > 0) x.lateCount += 1;
    x.lateMinutes += d.late;
    x.earlyMinutes += d.early;
    if (d.outside || d.noLocation) x.outside += 1;
    if (d.missingCheckout) x.missing += 1;
    totals.set(r.employee_id, x);
  }
  const rows = (employees ?? []).map((e) => {
    const x = totals.get(e.id) ?? { present: 0, absent: 0, leave: 0, lateCount: 0, lateMinutes: 0, earlyMinutes: 0, outside: 0, missing: 0 };
    const recorded = new Set((records ?? []).filter((r) => r.employee_id === e.id).map((r) => r.work_date));
    const leaveDays = leaveDates((leaves ?? []).filter((l) => l.employee_id === e.id), { from, to }, workDaysOf.get(e.shift_id ?? "") ?? [], recorded).length;
    const empShift = e.shift_id ? shiftMap.get(e.shift_id) : undefined;
    const checkInTime = empShift?.start_time ? formatTimeString(locale, empShift.start_time) : "—";
    const checkOutTime = empShift?.end_time ? formatTimeString(locale, empShift.end_time) : "—";
    return { e, x: { ...x, leave: leaveDays }, checkInTime, checkOutTime };
  });
  const cell = "px-4 py-3 tabular-nums";

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-page">{t("title")}</h1>
      <AttendanceTabs role={member.role} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-secondary">{t("sheet.intro")}</p>
        <div className="flex flex-wrap items-center gap-3">
          {canCorrect && (
            <>
              <ManualAttendanceDialog employees={employees ?? []} today={today} />
              <Button asChild variant="secondary">
                <a href={`${locale === "en" ? "/en" : ""}/attendance/sheet/pdf?month=${month}`} target="_blank" rel="noopener noreferrer">
                  <FileText aria-hidden />
                  {t("sheet.pdf")}
                </a>
              </Button>
            </>
          )}
          <MonthNav pathname="/attendance/sheet" month={month} latest={today.slice(0, 7)} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-surface p-6 text-secondary">{t("sheet.empty")}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
            <table className="w-full text-table">
              <thead>
                <tr className="border-b border-line text-label text-ink-soft">
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.employee")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.checkIn")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.checkOut")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.present")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.absent")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.leave")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.late")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.early")}</th>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t("sheet.flagged")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, x, checkInTime, checkOutTime }) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-3 text-start font-medium">
                      <Link href={{ pathname: "/attendance/sheet", query: { month, employee: e.id } }} className="hover:underline focus-visible:outline-2 focus-visible:outline-indigo">
                        {nameOf(e)}
                      </Link>
                    </th>
                    <td className={cell}><bdi dir="ltr">{checkInTime}</bdi></td>
                    <td className={cell}><bdi dir="ltr">{checkOutTime}</bdi></td>
                    <td className={cell}>{x.present}</td>
                    <td className={`${cell} ${x.absent ? "text-brick" : ""}`}>{x.absent}</td>
                    <td className={cell}>{x.leave || "—"}</td>
                    <td className={cell}>{x.lateCount ? `${x.lateCount} · ${formatDuration(x.lateMinutes)}` : "—"}</td>
                    <td className={cell}>{x.earlyMinutes ? formatDuration(x.earlyMinutes) : "—"}</td>
                    <td className={`${cell} ${x.outside || x.missing ? "text-saffron" : ""}`}>{x.outside + x.missing || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map(({ e, x, checkInTime, checkOutTime }) => (
              <li key={e.id}>
                <Link
                  href={{ pathname: "/attendance/sheet", query: { month, employee: e.id } }}
                  className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 focus-visible:outline-2 focus-visible:outline-indigo"
                >
                  <span className="text-card">{nameOf(e)}</span>
                  <span className="grid grid-cols-2 gap-x-4 gap-y-1 text-secondary tabular-nums">
                    <span>{t("sheet.checkIn")}: <bdi dir="ltr">{checkInTime}</bdi></span>
                    <span>{t("sheet.checkOut")}: <bdi dir="ltr">{checkOutTime}</bdi></span>
                    <span>{t("sheet.present")}: {x.present}</span>
                    <span className={x.absent ? "text-brick" : ""}>{t("sheet.absent")}: {x.absent}</span>
                    <span>{t("sheet.leave")}: {x.leave || "—"}</span>
                    <span>{t("sheet.late")}: {x.lateCount ? `${x.lateCount} · ${formatDuration(x.lateMinutes)}` : "—"}</span>
                    <span>{t("sheet.flagged")}: {x.outside + x.missing || "—"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
