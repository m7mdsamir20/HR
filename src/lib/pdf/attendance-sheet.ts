import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { monthRange } from "@/lib/attendance";
import { leaveDates } from "@/lib/attendance-data";
import { localName } from "@/lib/employees";
import { formatDayShort, formatDuration, formatMonth, formatTime, formatTimeString } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { issuedNow, loadBrand } from "./data";
import { documentHtml, esc, ltr, txt } from "./html";
import { renderPdf } from "./render";

type Mark = { text: string; color: string };

/**
 * Monthly attendance sheet:
 * - If employeeId is supplied, generates a full individual employee attendance sheet with daily arrival and departure times (12h format).
 * - Otherwise, generates the company-wide monthly sheet with scheduled arrival & departure times, daily marks, and totals.
 */
export async function buildAttendanceSheetPdf(
  locale: Locale,
  member: Member,
  month: string,
  employeeId?: string
): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();
  const { from, to } = monthRange(month);
  const lastDay = Number(to.slice(8));
  const monthLabel = formatMonth(locale, month);

  // If a specific employee is requested, build a detailed single-employee attendance sheet
  if (employeeId) {
    const [empRes, shiftRes, branchRes, recRes, leaveRes, brand, tp] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name_ar, full_name_en, national_id, employee_number, job_title, shift_id, branch_id")
        .eq("id", employeeId)
        .single(),
      supabase.from("shifts").select("id, name_ar, name_en, start_time, end_time, work_days"),
      supabase.from("branches").select("id, name_ar, name_en"),
      supabase
        .from("attendance_records")
        .select("work_date, check_in_at, check_out_at, status, late_minutes, early_minutes, worked_minutes, source, correction_note")
        .eq("employee_id", employeeId)
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: true }),
      supabase
        .from("leave_requests")
        .select("id, type, start_date, end_date")
        .eq("employee_id", employeeId)
        .eq("status", "approved")
        .lte("start_date", to)
        .gte("end_date", from),
      loadBrand(locale, member),
      getTranslations({ locale, namespace: "pdf" }),
    ]);

    const emp = empRes.data;
    if (!emp) return null;

    const shift = (shiftRes.data ?? []).find((s) => s.id === emp.shift_id);
    const branch = (branchRes.data ?? []).find((b) => b.id === emp.branch_id);
    const records = recRes.data ?? [];
    const leaves = leaveRes.data ?? [];

    const recByDate = new Map(records.map((r) => [r.work_date, r]));
    const isLeave = (iso: string) => leaves.some((l) => iso >= l.start_date && iso <= l.end_date);

    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let totalLate = 0;
    let totalEarly = 0;

    const dayRows = Array.from({ length: lastDay }, (_, i) => {
      const iso = `${month}-${String(i + 1).padStart(2, "0")}`;
      const rec = recByDate.get(iso);
      const onLeave = isLeave(iso);
      const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
      const isWorkDay = shift ? shift.work_days.includes(dow) : true;

      let inTime = "—";
      let outTime = "—";
      let workedStr = "—";
      let statusStr = "—";
      let statusColor = "#4a5875";

      if (rec?.status === "absent") {
        absentCount += 1;
        statusStr = locale === "ar" ? "غائب" : "Absent";
        statusColor = "#b23a2b";
      } else if (rec?.check_in_at) {
        presentCount += 1;
        inTime = formatTime(locale, rec.check_in_at);
        if (rec.check_out_at) {
          outTime = formatTime(locale, rec.check_out_at);
        }
        if (rec.worked_minutes !== null && rec.worked_minutes !== undefined) {
          workedStr = formatDuration(rec.worked_minutes);
        } else if (rec.check_out_at) {
          const diffMs = new Date(rec.check_out_at).getTime() - new Date(rec.check_in_at).getTime();
          const mins = Math.max(0, Math.floor(diffMs / 60000));
          workedStr = formatDuration(mins);
        }
        if (rec.late_minutes > 0) {
          totalLate += rec.late_minutes;
          statusStr = locale === "ar" ? `متأخر (${rec.late_minutes} دقيقة)` : `Late (${rec.late_minutes}m)`;
          statusColor = "#b23a2b";
        } else if (rec.early_minutes > 0) {
          totalEarly += rec.early_minutes;
          statusStr = locale === "ar" ? `انصراف مبكر (${rec.early_minutes} دقيقة)` : `Early (${rec.early_minutes}m)`;
          statusColor = "#c98a1b";
        } else {
          statusStr = locale === "ar" ? "حاضر في الموعد" : "On time";
          statusColor = "#1f7a55";
        }
      } else if (onLeave) {
        leaveCount += 1;
        statusStr = locale === "ar" ? "إجازة معتمدة" : "Approved Leave";
        statusColor = "#2f4a9e";
      } else if (!isWorkDay) {
        statusStr = locale === "ar" ? "عطلة أسبوعية" : "Day off";
        statusColor = "#9aa3b2";
      }

      const noteText = rec?.correction_note ? `<span style="font-size: 6.5pt; color: #7a869a; display: block;">${esc(rec.correction_note)}</span>` : "";

      return `
        <tr>
          <td style="text-align: center; color: #7a869a;">${i + 1}</td>
          <td style="font-weight: 500;">${esc(formatDayShort(locale, iso))}</td>
          <td style="text-align: center; font-family: 'InterEmbedded', monospace;"><bdi dir="ltr">${esc(inTime)}</bdi></td>
          <td style="text-align: center; font-family: 'InterEmbedded', monospace;"><bdi dir="ltr">${esc(outTime)}</bdi></td>
          <td style="text-align: center; font-family: 'InterEmbedded', monospace;"><bdi dir="ltr">${esc(workedStr)}</bdi></td>
          <td style="font-weight: 600; color: ${statusColor};">
            ${esc(statusStr)}
            ${noteText}
          </td>
        </tr>
      `;
    }).join("");

    const shiftTimes = shift
      ? `${formatTimeString(locale, shift.start_time)} – ${formatTimeString(locale, shift.end_time)}`
      : "—";

    const body = `
      <style>
        .emp-card { border: 1px solid #dde2ea; border-radius: 8px; padding: 12px 14px; background: #fff; margin-bottom: 12px; }
        .emp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 8pt; }
        .emp-item { display: flex; flex-direction: column; gap: 2px; }
        .emp-label { font-size: 7pt; color: #4a5875; }
        .emp-value { font-weight: 600; color: #18233d; }
        .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
        .kpi-card { border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff; text-align: center; }
        .kpi-title { font-size: 7pt; color: #4a5875; }
        .kpi-num { font-size: 11pt; font-weight: 700; margin-top: 2px; }
        table.detail-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; border: 1px solid #dde2ea; background: #fff; }
        table.detail-table th { background: #f6f7f9; color: #4a5875; font-weight: 700; font-size: 7.2pt; padding: 6px 8px; border-bottom: 1.5px solid #dde2ea; border-inline-end: 1px solid #eef2f6; }
        table.detail-table td { padding: 4px 8px; border-bottom: 1px solid #eef2f6; border-inline-end: 1px solid #f2f5f9; vertical-align: middle; }
        table.detail-table tr:nth-child(even) td { background-color: #fafbfd; }
        .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; break-inside: avoid; }
        .sig-box { border: 1px dashed #c0c7d5; border-radius: 6px; padding: 12px; text-align: center; background: #fff; }
        .sig-role { font-size: 8pt; font-weight: 700; color: #18233d; margin-bottom: 30px; }
        .sig-line { border-top: 1px solid #dde2ea; font-size: 7pt; color: #7a869a; padding-top: 4px; }
      </style>

      <div class="emp-card">
        <div class="emp-grid">
          <div class="emp-item">
            <span class="emp-label">${locale === "ar" ? "اسم الموظف" : "Employee"}</span>
            <span class="emp-value">${txt(localName(locale, emp.full_name_ar, emp.full_name_en))}</span>
          </div>
          <div class="emp-item">
            <span class="emp-label">${locale === "ar" ? "رقم الهوية / الإقامة" : "National ID"}</span>
            <span class="emp-value">${ltr(emp.national_id ?? "—")}</span>
          </div>
          <div class="emp-item">
            <span class="emp-label">${locale === "ar" ? "المسمى الوظيفي" : "Job Title"}</span>
            <span class="emp-value">${esc(emp.job_title ?? "—")}</span>
          </div>
          <div class="emp-item">
            <span class="emp-label">${locale === "ar" ? "مواعيد الوردية" : "Shift Hours"}</span>
            <span class="emp-value"><bdi dir="ltr">${esc(shiftTimes)}</bdi></span>
          </div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-title">${locale === "ar" ? "أيام الحضور" : "Days Present"}</div>
          <div class="kpi-num" style="color: #1f7a55;">${presentCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">${locale === "ar" ? "أيام الغياب" : "Days Absent"}</div>
          <div class="kpi-num" style="color: ${absentCount ? "#b23a2b" : "#18233d"};">${absentCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">${locale === "ar" ? "أيام الإجازات" : "Leave Days"}</div>
          <div class="kpi-num" style="color: #2f4a9e;">${leaveCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">${locale === "ar" ? "إجمالي التأخير" : "Total Late"}</div>
          <div class="kpi-num" style="color: ${totalLate ? "#b23a2b" : "#18233d"};">${totalLate ? `${totalLate} د` : "0"}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">${locale === "ar" ? "الانصراف المبكر" : "Early Out"}</div>
          <div class="kpi-num" style="color: ${totalEarly ? "#c98a1b" : "#18233d"};">${totalEarly ? `${totalEarly} د` : "0"}</div>
        </div>
      </div>

      <table class="detail-table">
        <thead>
          <tr>
            <th style="width: 24px; text-align: center;">#</th>
            <th style="width: 130px; text-align: start;">${locale === "ar" ? "اليوم والتاريخ" : "Day & Date"}</th>
            <th style="width: 85px; text-align: center;">${locale === "ar" ? "وقت الحضور" : "Check-in"}</th>
            <th style="width: 85px; text-align: center;">${locale === "ar" ? "وقت الانصراف" : "Check-out"}</th>
            <th style="width: 85px; text-align: center;">${locale === "ar" ? "ساعات العمل" : "Worked"}</th>
            <th style="text-align: start;">${locale === "ar" ? "الحالة والملاحظات" : "Status & Notes"}</th>
          </tr>
        </thead>
        <tbody>
          ${dayRows}
        </tbody>
      </table>

      <div class="sigs">
        <div class="sig-box">
          <div class="sig-role">${locale === "ar" ? "توقيع الموظف" : "Employee Signature"}</div>
          <div class="sig-line">${txt(localName(locale, emp.full_name_ar, emp.full_name_en))}</div>
        </div>
        <div class="sig-box">
          <div class="sig-role">${locale === "ar" ? "اعتماد الموارد البشرية" : "HR Approval"}</div>
          <div class="sig-line">${locale === "ar" ? "الاسم والتوقيع" : "Name & Signature"}</div>
        </div>
        <div class="sig-box">
          <div class="sig-role">${locale === "ar" ? "ختم المنشأة" : "Company Seal"}</div>
          <div class="sig-line">${esc((locale === "en" && member.company.name_en) || member.company.name_ar)}</div>
        </div>
      </div>
    `;

    const docTitle = locale === "ar" ? `كشف حضور وانصراف موظف - ${monthLabel}` : `Employee Attendance Record - ${monthLabel}`;
    const number = `ATT-${month}-${emp.employee_number || emp.id.slice(0, 6)}`;
    const html = documentHtml({
      locale,
      brand,
      title: docTitle,
      numberLabel: tp("number"),
      number,
      issuedLabel: tp("issued"),
      issued: esc(issuedNow(locale)),
      body,
    });
    const pdf = await renderPdf(html, {
      locale,
      footerLabel: `${docTitle} · ${number}`,
      pageLabel: tp("page"),
      ofLabel: tp("of"),
      landscape: false,
    });
    return { pdf, filename: `${number.toLowerCase()}.pdf` };
  }

  // Otherwise, build the company-wide monthly attendance sheet in landscape
  const [{ data: employees }, { data: records }, { data: deductions }, { data: shifts }, { data: holidays }, { data: leaves }] = await Promise.all([
    supabase.from("employees").select("id, full_name_ar, full_name_en, shift_id").neq("status", "deleted").order("full_name_ar"),
    supabase
      .from("attendance_records")
      .select("employee_id, work_date, status, late_minutes, early_minutes, check_in_at, check_out_at")
      .gte("work_date", from)
      .lte("work_date", to),
    supabase.from("attendance_deductions").select("employee_id, day_fraction").eq("status", "approved").gte("work_date", from).lte("work_date", to),
    supabase.from("shifts").select("id, name_ar, name_en, start_time, end_time, work_days"),
    supabase.from("company_calendar").select("start_date, end_date").eq("kind", "holiday").lte("start_date", to).gte("end_date", from),
    supabase.from("leave_requests").select("id, employee_id, type, start_date, end_date").eq("status", "approved").lte("start_date", to).gte("end_date", from),
  ]);

  const withRecords = new Set((records ?? []).map((r) => r.employee_id));
  const rows = (employees ?? []).filter((e) => e.shift_id !== null || withRecords.has(e.id));
  if (rows.length === 0) return null;

  const [brand, tp, tr] = await Promise.all([
    loadBrand(locale, member),
    getTranslations({ locale, namespace: "pdf" }),
    getTranslations({ locale, namespace: "attendance.sheet" }),
  ]);
  const shiftMap = new Map((shifts ?? []).map((s) => [s.id, s]));
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
        <th class="n" scope="row">${txt(localName(locale, e.full_name_ar, e.full_name_en))}</th>
        ${cells}
        <td class="t">${ltr(presentDays)}</td>
        <td class="t">${ltr(absentDays)}</td>
        <td class="t">${ltr(leaveOn.size)}</td>
        <td class="t">${ltr(lateCount)}</td>
        <td class="t">${ltr(approved ? Math.round(approved * 100) / 100 : 0)}</td>
      </tr>`;
    })
    .join("");

  const number = `ATT-${month}`;
  const body = `
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      table.sheet { table-layout: fixed; width: 100%; border-collapse: collapse; font-size: 7pt; }
      table.sheet th, table.sheet td { padding: 4px 1px; text-align: center; border-bottom: 1px solid #DDE2EA; border-inline-end: 1px solid #f2f5f9; font-size: 6.5pt; }
      table.sheet th { background: #f6f7f9; color: #4a5875; }
      table.sheet th.t { font-size: 6pt; line-height: 1.2; width: 9mm; }
      table.sheet td.d { font-size: 7.5pt; font-weight: 700; width: 3.5mm; }
      table.sheet th.n { width: 44mm; text-align: start; padding-inline: 4px; font-weight: 600; font-size: 7pt; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      table.sheet .t { width: 9mm; font-weight: 600; }
      .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 7pt; }
    </style>
    <h2 style="font-size: 11pt; margin-bottom: 8px;">${esc(monthLabel)}</h2>
    <table class="sheet">
      <thead>
        <tr>
          <th class="n">${esc(tr("employee"))}</th>
          ${dayHeads}
          <th class="t">${esc(tp("sheetPresent"))}</th>
          <th class="t">${esc(tp("sheetAbsent"))}</th>
          <th class="t">${esc(tp("sheetLeave"))}</th>
          <th class="t">${esc(tp("sheetLate"))}</th>
          <th class="t">${esc(tp("sheetDeduction"))}</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
    <div class="legend muted">
      <span><b style="color:${present.color}">${esc(present.text)}</b> ${esc(tp("legendPresent"))}</span>
      <span><b style="color:${late.color}">${esc(late.text)}</b> ${esc(tp("legendLate"))}</span>
      <span><b style="color:${absent.color}">${esc(absent.text)}</b> ${esc(tp("legendAbsent"))}</span>
      <span><b style="color:${onLeave.color}">${esc(onLeave.text)}</b> ${esc(tp("legendLeave"))}</span>
      <span><b style="color:${off.color}">${esc(off.text)}</b> ${esc(tp("legendOff"))}</span>
    </div>
    <p class="muted" style="margin-top: 6px; font-size: 6.5pt;">${esc(tp("sheetDeductionNote"))}</p>`;

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
  const pdf = await renderPdf(html, {
    locale,
    footerLabel: `${tp("attendanceSheetTitle")} · ${number}`,
    pageLabel: tp("page"),
    ofLabel: tp("of"),
    landscape: true,
  });
  return { pdf, filename: `${number.toLowerCase()}.pdf` };
}
