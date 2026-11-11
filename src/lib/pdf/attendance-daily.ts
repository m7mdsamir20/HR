import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { issuedNow, loadBrand } from "./data";
import { documentHtml, esc, ltr } from "./html";
import { renderPdf } from "./render";

const localName = (locale: Locale, ar: string, en: string | null) => (locale === "en" && en) || ar;

export async function buildDailyAttendancePdf(
  locale: Locale,
  member: Member,
  dateStr: string
): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();

  const [{ data: employees }, { data: records }, { data: leaves }, { data: shifts }, { data: branches }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name_ar, full_name_en, employee_number, job_title, shift_id, branch_id")
        .eq("status", "active")
        .neq("role", "owner")
        .order("employee_number", { ascending: true }),
      supabase
        .from("attendance_records")
        .select("id, employee_id, check_in_at, check_out_at, status, late_minutes, worked_minutes, check_in_outside, correction_note")
        .eq("work_date", dateStr),
      supabase
        .from("leave_requests")
        .select("id, employee_id, type")
        .eq("status", "approved")
        .lte("start_date", dateStr)
        .gte("end_date", dateStr),
      supabase.from("shifts").select("id, name_ar, name_en, start_time, end_time, work_days"),
      supabase.from("branches").select("id, name_ar, name_en"),
    ]);

  if (!employees || employees.length === 0) return null;

  const [brand, t] = await Promise.all([
    loadBrand(locale, member),
    getTranslations({ locale, namespace: "attendance.daily" }),
  ]);

  const recMap = new Map((records ?? []).map((r) => [r.employee_id, r]));
  const leaveSet = new Set((leaves ?? []).map((l) => l.employee_id));
  const shiftMap = new Map((shifts ?? []).map((s) => [s.id, s]));
  const branchMap = new Map((branches ?? []).map((b) => [b.id, b]));

  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let leaveCount = 0;

  const rows = employees.map((emp, idx) => {
    const rec = recMap.get(emp.id);
    const onLeave = leaveSet.has(emp.id);
    const shift = emp.shift_id ? shiftMap.get(emp.shift_id) : undefined;
    const branch = emp.branch_id ? branchMap.get(emp.branch_id) : undefined;
    const isWorkDay = shift ? shift.work_days.includes(dow) : true;

    let statusText = "—";
    let statusColor = "#4a5875";
    let inTime = "—";
    let outTime = "—";
    let durationText = "—";
    let lateText = "—";

    if (onLeave) {
      leaveCount += 1;
      statusText = t("leaveStatus");
      statusColor = "#2f4a9e";
    } else if (rec?.status === "absent") {
      absentCount += 1;
      statusText = t("absentStatus");
      statusColor = "#b23a2b";
    } else if (rec?.check_in_at) {
      presentCount += 1;
      inTime = formatTime(locale, rec.check_in_at);
      if (rec.check_out_at) {
        outTime = formatTime(locale, rec.check_out_at);
      }
      if (rec.worked_minutes) {
        durationText = formatDuration(rec.worked_minutes);
      } else if (rec.check_out_at) {
        const diffMs = new Date(rec.check_out_at).getTime() - new Date(rec.check_in_at).getTime();
        durationText = formatDuration(Math.max(0, Math.floor(diffMs / 60000)));
      }

      if (rec.late_minutes > 0) {
        lateCount += 1;
        statusText = `${t("lateStatus")} (${rec.late_minutes} د)`;
        statusColor = "#b23a2b";
        lateText = `${rec.late_minutes} د`;
      } else {
        statusText = t("onTime");
        statusColor = "#1f7a55";
      }
    } else if (!isWorkDay) {
      statusText = t("offStatus");
      statusColor = "#9aa3b2";
    } else {
      absentCount += 1;
      statusText = t("absentStatus");
      statusColor = "#b23a2b";
    }

    const branchName = branch ? localName(locale, branch.name_ar, branch.name_en) : "";
    const jobOrBranch = [emp.job_title, branchName].filter(Boolean).join(" · ") || "—";
    const noteText = rec?.correction_note ? esc(rec.correction_note) : "—";

    return `
      <tr>
        <td style="text-align: center; color: #4a5875;">${idx + 1}</td>
        <td style="text-align: right; font-weight: 600; padding-right: 8px;">
          ${esc(localName(locale, emp.full_name_ar, emp.full_name_en))}
          ${emp.employee_number ? `<span style="font-size: 6.5pt; color: #7a869a; display: block; font-family: monospace;">#${esc(emp.employee_number)}</span>` : ""}
        </td>
        <td style="text-align: right; padding-right: 6px; font-size: 7.2pt; color: #4a5875;">${esc(jobOrBranch)}</td>
        <td style="text-align: center; font-weight: 700; color: ${statusColor}; font-size: 7.2pt;">${esc(statusText)}</td>
        <td style="text-align: center; font-family: 'InterEmbedded', monospace; font-size: 7.5pt; font-weight: 600;"><bdi dir="ltr">${esc(inTime)}</bdi></td>
        <td style="text-align: center; font-family: 'InterEmbedded', monospace; font-size: 7.5pt; font-weight: 600;"><bdi dir="ltr">${esc(outTime)}</bdi></td>
        <td style="text-align: center; font-family: 'InterEmbedded', monospace; font-size: 7.2pt;"><bdi dir="ltr">${esc(durationText)}</bdi></td>
        <td style="text-align: center; font-family: 'InterEmbedded', monospace; font-size: 7.2pt; color: ${lateText !== "—" ? "#b23a2b" : "inherit"}; font-weight: ${lateText !== "—" ? 700 : 400};">${esc(lateText)}</td>
        <td style="text-align: right; padding-right: 6px; font-size: 6.8pt; color: #7a869a;">${noteText}</td>
      </tr>
    `;
  }).join("");

  const kpisHtml = `
    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; break-inside: avoid;">
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff; text-align: right;">
        <div style="font-size: 7.2pt; color: #4a5875;">${esc(t("totalEmployees"))}</div>
        <div style="font-size: 11pt; font-weight: 700; color: #18233d; margin-top: 2px;">${employees.length}</div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff; text-align: right;">
        <div style="font-size: 7.2pt; color: #1f7a55; font-weight: 600;">${esc(t("present"))}</div>
        <div style="font-size: 11pt; font-weight: 700; color: #1f7a55; margin-top: 2px;">${presentCount}</div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff; text-align: right;">
        <div style="font-size: 7.2pt; color: #b23a2b; font-weight: 600;">${esc(t("late"))}</div>
        <div style="font-size: 11pt; font-weight: 700; color: #b23a2b; margin-top: 2px;">${lateCount}</div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff; text-align: right;">
        <div style="font-size: 7.2pt; color: #b23a2b; font-weight: 600;">${esc(t("absent"))}</div>
        <div style="font-size: 11pt; font-weight: 700; color: #b23a2b; margin-top: 2px;">${absentCount}</div>
      </div>
      <div style="border: 1.5px solid #2f4a9e; border-radius: 6px; padding: 8px 10px; background: #f0f4fc; text-align: right;">
        <div style="font-size: 7.2pt; color: #2f4a9e; font-weight: 600;">${esc(t("leave"))}</div>
        <div style="font-size: 11pt; font-weight: 800; color: #2f4a9e; margin-top: 2px;">${leaveCount}</div>
      </div>
    </div>
  `;

  const signaturesHtml = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; break-inside: avoid;">
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
        <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
          ${locale === "ar" ? "إعداد ومطابقة" : "Prepared By"}
        </div>
        <div style="font-size: 7.5pt; color: #4a5875; margin-bottom: 4px;">${locale === "ar" ? "مسؤول الحضور والموارد البشرية" : "HR & Attendance Officer"}</div>
        <div style="font-size: 7pt; color: #7a869a; margin-top: 20px;">${locale === "ar" ? "التوقيع: ......................................." : "Signature: ......................................."}</div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
        <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
          ${locale === "ar" ? "مراجعة العمليات" : "Operations Review"}
        </div>
        <div style="font-size: 7.5pt; color: #4a5875; margin-bottom: 4px;">${locale === "ar" ? "مدير العمليات والتشغيل" : "Operations Manager"}</div>
        <div style="font-size: 7pt; color: #7a869a; margin-top: 20px;">${locale === "ar" ? "التوقيع: ......................................." : "Signature: ......................................."}</div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
        <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
          ${locale === "ar" ? "الاعتماد النهائي" : "Approved By"}
        </div>
        <div style="font-size: 7.5pt; color: #4a5875; margin-bottom: 4px;">${locale === "ar" ? "المدير العام / المفوض" : "General Manager"}</div>
        <div style="font-size: 7pt; color: #7a869a; margin-top: 20px;">${locale === "ar" ? "التوقيع: ......................................." : "Signature: ......................................."}</div>
      </div>
    </div>
  `;

  const body = `
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      table.daily-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; border: 1px solid #dde2ea; background: #fff; }
      table.daily-table th { background: #f6f7f9; color: #4a5875; font-weight: 700; font-size: 7.2pt; padding: 6px 6px; border-bottom: 1.5px solid #dde2ea; border-inline-end: 1px solid #eef2f6; }
      table.daily-table td { padding: 5px 6px; border-bottom: 1px solid #eef2f6; border-inline-end: 1px solid #f2f5f9; vertical-align: middle; }
      table.daily-table tr:nth-child(even) td { background-color: #fafbfd; }
    </style>

    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
      <h2 style="font-size: 11pt; margin: 0; color: #18233d;">
        ${locale === "ar" ? `كشف الحضور والانصراف اليومي — ${formatDate(locale, dateStr)}` : `Daily Attendance Sheet — ${formatDate(locale, dateStr)}`}
      </h2>
      <span style="font-size: 7.5pt; color: #7a869a; font-family: monospace;">${dateStr}</span>
    </div>

    ${kpisHtml}

    <table class="daily-table">
      <thead>
        <tr>
          <th style="width: 24px; text-align: center;">#</th>
          <th style="min-width: 140px; text-align: right; padding-right: 8px;">${esc(t("employee"))}</th>
          <th style="min-width: 110px; text-align: right; padding-right: 6px;">القسم / الفرع</th>
          <th style="width: 85px; text-align: center;">${esc(t("status"))}</th>
          <th style="width: 80px; text-align: center;">${esc(t("checkIn"))}</th>
          <th style="width: 80px; text-align: center;">${esc(t("checkOut"))}</th>
          <th style="width: 65px; text-align: center;">${esc(t("duration"))}</th>
          <th style="width: 55px; text-align: center;">${esc(t("lateMinutes"))}</th>
          <th style="min-width: 100px; text-align: right; padding-right: 6px;">${esc(t("notes"))}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    ${signaturesHtml}
  `;

  const pageTitle = locale === "ar"
    ? `كشف الحضور اليومي - ${dateStr}`
    : `Daily Attendance Sheet - ${dateStr}`;

  const docNumber = `ATT-DAY-${dateStr}`;

  const html = documentHtml({
    locale,
    brand,
    title: pageTitle,
    numberLabel: locale === "ar" ? "رقم المستند" : "Doc No",
    number: docNumber,
    issuedLabel: locale === "ar" ? "تاريخ الإصدار" : "Issued",
    issued: esc(issuedNow(locale)),
    body,
  });

  const pdf = await renderPdf(html, {
    locale,
    footerLabel: `${pageTitle} · ${docNumber}`,
    pageLabel: locale === "ar" ? "صفحة" : "Page",
    ofLabel: locale === "ar" ? "من" : "of",
    landscape: true,
  });
  return { pdf, filename: `attendance-daily-${dateStr}.pdf` };
}
