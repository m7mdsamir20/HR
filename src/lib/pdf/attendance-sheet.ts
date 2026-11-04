import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { monthRange } from "@/lib/attendance";
import { leaveDates } from "@/lib/attendance-data";
import { localName } from "@/lib/employees";
import { formatMonth } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { issuedNow, loadBrand } from "./data";
import { documentHtml, esc, ltr, txt } from "./html";
import { renderPdf } from "./render";

type Mark = { text: string; color: string };

/**
 * The monthly attendance sheet for owner and HR: one row per employee, one column per day, with
 * the month's totals and the deduction days that were approved. The legend explains each mark.
 */
export async function buildAttendanceSheetPdf(locale: Locale, member: Member, month: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();
  const { from, to } = monthRange(month);
  const lastDay = Number(to.slice(8));

  const [{ data: employees }, { data: records }, { data: deductions }, { data: shifts }, { data: holidays }, { data: leaves }] = await Promise.all([
    supabase.from("employees").select("id, full_name_ar, full_name_en, shift_id").neq("status", "deleted").order("full_name_ar"),
    supabase
      .from("attendance_records")
      .select("employee_id, work_date, status, late_minutes, early_minutes")
      .gte("work_date", from)
      .lte("work_date", to),
    supabase.from("attendance_deductions").select("employee_id, day_fraction").eq("status", "approved").gte("work_date", from).lte("work_date", to),
    supabase.from("shifts").select("id, work_days"),
    supabase.from("company_calendar").select("start_date, end_date").eq("kind", "holiday").lte("start_date", to).gte("end_date", from),
    supabase.from("leave_requests").select("id, employee_id, type, start_date, end_date").eq("status", "approved").lte("start_date", to).gte("end_date", from),
  ]);

  const withRecords = new Set((records ?? []).map((r) => r.employee_id));
  const rows = (employees ?? []).filter((e) => e.shift_id !== null || withRecords.has(e.id));
  if (rows.length === 0) return null;

  const [brand, tp, tr] = await Promise.all([loadBrand(locale, member), getTranslations({ locale, namespace: "pdf" }), getTranslations({ locale, namespace: "attendance.sheet" })]);
  const workDays = new Map((shifts ?? []).map((s) => [s.id, s.work_days]));
  const isHoliday = (iso: string) => (holidays ?? []).some((h) => iso >= h.start_date && iso <= h.end_date);

  const byEmployee = new Map<string, Map<string, { status: string; late: number; early: number }>>();
  for (const r of records ?? []) {
    const days = byEmployee.get(r.employee_id) ?? new Map();
    days.set(r.work_date, { status: r.status, late: r.late_minutes, early: r.early_minutes });
    byEmployee.set(r.employee_id, days);
  }
  const approvedDays = new Map<string, number>();
  for (const d of deductions ?? []) approvedDays.set(d.employee_id, (approvedDays.get(d.employee_id) ?? 0) + Number(d.day_fraction));

  const present: Mark = { text: "✓", color: "#1F7A55" };
  const late: Mark = { text: locale === "ar" ? "ت" : "L", color: "#B23A2B" };
  const absent: Mark = { text: locale === "ar" ? "غ" : "A", color: "#B23A2B" };
  const off: Mark = { text: "·", color: "#9AA3B2" };
  const onLeave: Mark = { text: locale === "ar" ? "إ" : "V", color: "#2F4A9E" };

  const dayHeads = Array.from({ length: lastDay }, (_, i) => `<th class="d">${i + 1}</th>`).join("");
  const bodyRows = rows
    .map((e) => {
      const days = byEmployee.get(e.id) ?? new Map();
      const leaveOn = new Set(
        leaveDates((leaves ?? []).filter((l) => l.employee_id === e.id), { from, to }, e.shift_id !== null ? (workDays.get(e.shift_id) ?? []) : [], new Set(days.keys())).map((x) => x.date),
      );
      let presentDays = 0;
      let absentDays = 0;
      let lateCount = 0;
      const cells = Array.from({ length: lastDay }, (_, i) => {
        const iso = `${month}-${String(i + 1).padStart(2, "0")}`;
        const rec = days.get(iso);
        let mark: Mark | null = null;
        if (rec?.status === "absent") {
          absentDays += 1;
          mark = absent;
        } else if (rec) {
          presentDays += 1;
          if (rec.late > 0) lateCount += 1;
          mark = rec.late > 0 ? late : present;
        } else if (leaveOn.has(iso)) {
          mark = onLeave;
        } else {
          const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
          const scheduled = e.shift_id !== null && (workDays.get(e.shift_id) ?? []).includes(dow) && !isHoliday(iso);
          if (e.shift_id !== null && !scheduled) mark = off;
        }
        return `<td class="d" style="color:${mark?.color ?? "inherit"}">${mark ? esc(mark.text) : ""}</td>`;
      }).join("");
      const approved = approvedDays.get(e.id) ?? 0;
      return `<tr>
        <th class="n" scope="row">${txt(localName(locale, e.full_name_ar, e.full_name_en))}</th>${cells}
        <td class="t">${ltr(presentDays)}</td><td class="t">${ltr(absentDays)}</td><td class="t">${ltr(leaveOn.size)}</td><td class="t">${ltr(lateCount)}</td>
        <td class="t">${ltr(approved ? Math.round(approved * 100) / 100 : 0)}</td>
      </tr>`;
    })
    .join("");

  const monthLabel = formatMonth(locale, month);
  const number = `ATT-${month}`;
  const body = `
    <style>
      table.sheet{table-layout:fixed;width:100%;font-size:7pt}
      table.sheet th,table.sheet td{padding:3px 0;text-align:center;border-bottom:1px solid #DDE2EA;font-size:6.5pt}
      table.sheet th.t{font-size:6pt;line-height:1.2}
      table.sheet td.d{font-size:8pt;font-weight:700}
      table.sheet th.n{width:30mm;text-align:start;padding-inline:3px;font-weight:600;font-size:7pt;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      table.sheet .d{width:3.3mm}
      table.sheet .t{width:9mm;font-weight:600}
      .legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
    </style>
    <h2>${esc(monthLabel)}</h2>
    <table class="sheet"><thead><tr>
      <th class="n">${esc(tr("employee"))}</th>${dayHeads}
      <th class="t">${esc(tp("sheetPresent"))}</th><th class="t">${esc(tp("sheetAbsent"))}</th><th class="t">${esc(tp("sheetLeave"))}</th><th class="t">${esc(tp("sheetLate"))}</th><th class="t">${esc(tp("sheetDeduction"))}</th>
    </tr></thead><tbody>${bodyRows}</tbody></table>
    <div class="legend muted">
      <span><b style="color:${present.color}">${esc(present.text)}</b> ${esc(tp("legendPresent"))}</span>
      <span><b style="color:${late.color}">${esc(late.text)}</b> ${esc(tp("legendLate"))}</span>
      <span><b style="color:${absent.color}">${esc(absent.text)}</b> ${esc(tp("legendAbsent"))}</span>
      <span><b style="color:${onLeave.color}">${esc(onLeave.text)}</b> ${esc(tp("legendLeave"))}</span>
      <span><b style="color:${off.color}">${esc(off.text)}</b> ${esc(tp("legendOff"))}</span>
    </div>
    <p class="muted" style="margin-top:6px">${esc(tp("sheetDeductionNote"))}</p>`;

  const html = documentHtml({
    locale,
    brand,
    title: tp("attendanceSheetTitle"),
    numberLabel: tp("number"),
    number,
    issuedLabel: tp("issued"),
    issued: esc(issuedNow(locale)),
    body,
  });
  const pdf = await renderPdf(html, { locale, footerLabel: `${tp("attendanceSheetTitle")} · ${number}`, pageLabel: tp("page"), ofLabel: tp("of") });
  return { pdf, filename: `${number.toLowerCase()}.pdf` };
}
