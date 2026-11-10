import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { issuedNow, loadBrand } from "./data";
import { documentHtml, esc, ltr, dt, pill } from "./html";
import { renderPdf } from "./render";

export async function buildPayrollRunPdf(
  locale: Locale,
  member: Member,
  runId: string
): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (!run) return null;

  const { data: slips } = await supabase
    .from("payroll_slips")
    .select(`
      *,
      employee:employee_id (
        id,
        national_id,
        id_type,
        full_name_ar,
        full_name_en,
        job_title
      )
    `)
    .eq("payroll_run_id", runId);

  let approverName: string | null = null;
  if (run.approved_by) {
    const { data: approverEmp } = await supabase
      .from("employees")
      .select("full_name_ar, full_name_en")
      .eq("user_id", run.approved_by)
      .maybeSingle();
    approverName =
      (locale === "en" && approverEmp?.full_name_en) || approverEmp?.full_name_ar || null;
  }

  const brand = await loadBrand(locale, member);
  const t = await getTranslations({ locale, namespace: "payroll" });
  const tp = await getTranslations({ locale, namespace: "pdf" });

  const isDraft = run.status === "draft";
  const isApproved = run.status === "approved" || run.status === "paid";
  const period = `${String(run.month).padStart(2, "0")} / ${run.year}`;
  const docNumber = `PAYROLL-${run.year}-${String(run.month).padStart(2, "0")}`;
  const currency = locale === "ar" ? "ر.س" : "SAR";

  const num = (v: unknown) =>
    Number(v ?? 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Calculate combined other allowances & other deductions
  const slipRows = (slips ?? []).map((s, idx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emp = s.employee as any;
    const empName = (locale === "en" && emp?.full_name_en) || emp?.full_name_ar || "—";
    const natId = emp?.national_id ?? "—";
    const jobTitle = emp?.job_title ?? "—";
    const otherAllowancesTotal =
      Number(s.transport_allowance ?? 0) +
      Number(s.communication_allowance ?? 0) +
      Number(s.other_allowances ?? 0);
    const attendanceDedTotal =
      Number(s.attendance_deduction ?? 0) + Number(s.leave_deduction ?? 0);
    const advanceAndOtherDedTotal =
      Number(s.advance_deduction ?? 0) + Number(s.other_deductions ?? 0);

    return `
      <tr>
        <td style="text-align: center; color: #4a5875;">${idx + 1}</td>
        <td style="font-weight: 600;">${esc(empName)}</td>
        <td style="text-align: center;">${ltr(natId)}</td>
        <td>${esc(jobTitle)}</td>
        <td style="text-align: end; font-family: 'InterEmbedded', monospace;">${ltr(num(s.basic_salary))}</td>
        <td style="text-align: end; font-family: 'InterEmbedded', monospace;">${ltr(num(s.housing_allowance))}</td>
        <td style="text-align: end; font-family: 'InterEmbedded', monospace;">${ltr(num(otherAllowancesTotal))}</td>
        <td style="text-align: end; font-weight: 700; font-family: 'InterEmbedded', monospace; background: #f8fafc;">${ltr(num(s.gross_salary))}</td>
        <td style="text-align: end; color: #b23a2b; font-family: 'InterEmbedded', monospace;">${ltr(num(s.gosi_employee))}</td>
        <td style="text-align: end; color: #b23a2b; font-family: 'InterEmbedded', monospace;">${ltr(num(attendanceDedTotal))}</td>
        <td style="text-align: end; color: #b23a2b; font-family: 'InterEmbedded', monospace;">${ltr(num(advanceAndOtherDedTotal))}</td>
        <td style="text-align: end; font-weight: 600; color: #b23a2b; font-family: 'InterEmbedded', monospace; background: #fff5f5;">${ltr(num(s.total_deductions))}</td>
        <td style="text-align: end; font-weight: 700; color: #2f4a9e; font-family: 'InterEmbedded', monospace; background: #f0f4fc;">${ltr(num(s.net_salary))}</td>
        <td style="font-size: 7.2pt; color: #4a5875; max-width: 140px; word-break: break-all;">
          ${s.bank_name ? `<span>${esc(s.bank_name)}</span><br>` : ""}
          ${s.iban ? `<span>${ltr(s.iban)}</span>` : "—"}
        </td>
      </tr>
    `;
  });

  const bannerHtml = isDraft
    ? `
      <div style="border: 1.5px solid #c98a1b; background: #c98a1b12; color: #7a4e05; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; break-inside: avoid;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${pill("saffron", locale === "ar" ? "مسودة غير معتمدة" : "Draft Run")}
          <span style="font-size: 8.8pt; font-weight: 600;">
            ${locale === "ar" ? "هذا الكشف مسودة مراجعة وتدقيق لمسير رواتب شهر " + period + " قبل الاعتماد النهائي، ولا يعتبر سند صرف رسمي." : "This is an unapproved draft for review and audit of " + period + " payroll prior to final approval."}
          </span>
        </div>
        <span style="font-size: 8pt; color: #7a4e05;">${locale === "ar" ? "بانتظار اعتماد الإدارة" : "Pending Approval"}</span>
      </div>
    `
    : `
      <div style="border: 1.5px solid #1f7a55; background: #1f7a5510; color: #0d4a32; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; break-inside: avoid;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${pill("stamp", locale === "ar" ? "مسير معتمد ومقفل" : "Approved & Locked")}
          <span style="font-size: 8.8pt; font-weight: 600;">
            ${locale === "ar" ? "كشف مسير رواتب معتمد رسمياً ومقفل للصرف والتحويل البنكي لشهر " + period : "Officially approved and locked payroll run for " + period}
          </span>
        </div>
        <div style="font-size: 8pt; color: #0d4a32; text-align: end;">
          <span>${locale === "ar" ? "تاريخ الاعتماد: " : "Approved: "}${dt(run.approved_at?.slice(0, 10) ?? "—")}</span>
          ${approverName ? `<br><span>${locale === "ar" ? "المعتمد: " : "By: "}${esc(approverName)}</span>` : ""}
        </div>
      </div>
    `;

  const kpisHtml = `
    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 14px; break-inside: avoid;">
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff;">
        <div style="font-size: 7.2pt; color: #4a5875;">${esc(t("employeeCount"))}</div>
        <div style="font-size: 11pt; font-weight: 700; color: #18233d; margin-top: 2px;">${run.employee_count}</div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff;">
        <div style="font-size: 7.2pt; color: #4a5875;">${esc(t("basicSalary"))}</div>
        <div style="font-size: 9.5pt; font-weight: 700; color: #18233d; margin-top: 2px;">${ltr(num(run.total_basic))} <span style="font-size: 7pt; font-weight: normal; color: #4a5875;">${currency}</span></div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff;">
        <div style="font-size: 7.2pt; color: #4a5875;">إجمالي البدلات</div>
        <div style="font-size: 9.5pt; font-weight: 700; color: #18233d; margin-top: 2px;">${ltr(num(Number(run.total_housing) + Number(run.total_other_allowances)))} <span style="font-size: 7pt; font-weight: normal; color: #4a5875;">${currency}</span></div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff;">
        <div style="font-size: 7.2pt; color: #4a5875;">${esc(t("totalGross"))}</div>
        <div style="font-size: 9.5pt; font-weight: 700; color: #18233d; margin-top: 2px;">${ltr(num(run.total_gross))} <span style="font-size: 7pt; font-weight: normal; color: #4a5875;">${currency}</span></div>
      </div>
      <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 8px 10px; background: #fff;">
        <div style="font-size: 7.2pt; color: #4a5875;">${esc(t("totalDeductions"))}</div>
        <div style="font-size: 9.5pt; font-weight: 700; color: #b23a2b; margin-top: 2px;">${ltr(num(run.total_deductions))} <span style="font-size: 7pt; font-weight: normal; color: #4a5875;">${currency}</span></div>
      </div>
      <div style="border: 1.5px solid #2f4a9e; border-radius: 6px; padding: 8px 10px; background: #f0f4fc;">
        <div style="font-size: 7.2pt; color: #2f4a9e; font-weight: 600;">${esc(t("totalNet"))}</div>
        <div style="font-size: 11pt; font-weight: 800; color: #2f4a9e; margin-top: 2px;">${ltr(num(run.total_net))} <span style="font-size: 7.5pt; font-weight: normal; color: #2f4a9e;">${currency}</span></div>
      </div>
    </div>
  `;

  const signaturesHtml = isDraft
    ? `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; break-inside: avoid;">
        <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
          <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
            ${locale === "ar" ? "١. إعداد شؤون الموظفين (HR)" : "1. HR Preparation"}
          </div>
          <div style="font-size: 7.8pt; color: #4a5875; display: flex; flex-direction: column; gap: 7px;">
            <div>${locale === "ar" ? "الاسم:" : "Name:"} ....................................................</div>
            <div>${locale === "ar" ? "التوقيع:" : "Signature:"} .................................................</div>
            <div>${locale === "ar" ? "التاريخ: ...... / ...... / ٢٠٢... م" : "Date: ..... / ..... / 202... "}</div>
          </div>
        </div>

        <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
          <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
            ${locale === "ar" ? "٢. المراجعة والتدقيق المالي" : "2. Financial Audit"}
          </div>
          <div style="font-size: 7.8pt; color: #4a5875; display: flex; flex-direction: column; gap: 7px;">
            <div>${locale === "ar" ? "الاسم:" : "Name:"} ....................................................</div>
            <div>${locale === "ar" ? "التوقيع:" : "Signature:"} .................................................</div>
            <div>${locale === "ar" ? "التاريخ: ...... / ...... / ٢٠٢... م" : "Date: ..... / ..... / 202... "}</div>
          </div>
        </div>

        <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
          <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
            ${locale === "ar" ? "٣. اعتماد الإدارة العامة" : "3. General Management Approval"}
          </div>
          <div style="font-size: 7.8pt; color: #4a5875; display: flex; flex-direction: column; gap: 7px;">
            <div>${locale === "ar" ? "الاسم:" : "Name:"} ....................................................</div>
            <div>${locale === "ar" ? "التوقيع:" : "Signature:"} .................................................</div>
            <div>${locale === "ar" ? "التاريخ: ...... / ...... / ٢٠٢... م" : "Date: ..... / ..... / 202... "}</div>
          </div>
        </div>
      </div>
    `
    : `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 18px; break-inside: avoid;">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; flex: 1;">
          <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
            <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
              ${locale === "ar" ? "مسؤول الصرف والتحويل البنكي" : "Disbursement Specialist"}
            </div>
            <div style="font-size: 7.8pt; color: #4a5875; display: flex; flex-direction: column; gap: 7px;">
              <div>${locale === "ar" ? "الاسم:" : "Name:"} ....................................................</div>
              <div>${locale === "ar" ? "التوقيع:" : "Signature:"} .................................................</div>
              <div>${locale === "ar" ? "التاريخ: ...... / ...... / ٢٠٢... م" : "Date: ..... / ..... / 202... "}</div>
            </div>
          </div>

          <div style="border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; background: #fff;">
            <div style="font-weight: 700; font-size: 8.5pt; color: #2f4a9e; margin-bottom: 8px; border-bottom: 1px solid #dde2ea; padding-bottom: 4px;">
              ${locale === "ar" ? "المدير المالي / المفوض بالتوقيع" : "CFO / Authorized Signatory"}
            </div>
            <div style="font-size: 7.8pt; color: #4a5875; display: flex; flex-direction: column; gap: 7px;">
              <div>${locale === "ar" ? "الاسم:" : "Name:"} ....................................................</div>
              <div>${locale === "ar" ? "التوقيع:" : "Signature:"} .................................................</div>
              <div>${locale === "ar" ? "التاريخ: ...... / ...... / ٢٠٢... م" : "Date: ..... / ..... / 202... "}</div>
            </div>
          </div>
        </div>

        <div style="display: inline-block; padding: 3px 4px; border: 2.5px solid #1f7a55; border-radius: 6px; transform: rotate(-3deg); background: #1f7a550d; flex-shrink: 0;">
          <div style="padding: 6px 20px; border: 1.5px dashed #1f7a55; border-radius: 3px; color: #1f7a55; font-size: 13pt; font-weight: 800; letter-spacing: 1px; text-align: center; line-height: 1.25;">
            <div>${locale === "ar" ? "معتمد ومقفل" : "APPROVED"}</div>
            <div style="font-size: 7.5pt; font-weight: 600; margin-top: 3px;">${dt(run.approved_at?.slice(0, 10) ?? "—")}</div>
          </div>
        </div>
      </div>
    `;

  const totalOtherAllowances = Number(run.total_other_allowances ?? 0);
  const totalAttendanceDeductions =
    Number(run.total_attendance_deductions ?? 0) + Number(run.total_leave_deductions ?? 0);
  const totalAdvanceAndOtherDeductions =
    Number(run.total_advance_deductions ?? 0) + Number(run.total_other_deductions ?? 0);

  const body = `
    <style>
      table.payroll-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; border: 1px solid #dde2ea; background: #fff; }
      table.payroll-table th { background: #f6f7f9; color: #4a5875; font-weight: 700; font-size: 7.2pt; padding: 6px 5px; border-bottom: 1.5px solid #dde2ea; border-inline-end: 1px solid #eef2f6; }
      table.payroll-table td { padding: 5px 5px; border-bottom: 1px solid #eef2f6; border-inline-end: 1px solid #f2f5f9; vertical-align: middle; }
      table.payroll-table tr:nth-child(even) td { background-color: #fafbfd; }
      table.payroll-table tr.total-row td { background: #eef4fe !important; font-weight: 700; color: #18233d; border-top: 2px solid #2f4a9e; border-bottom: 2px solid #2f4a9e; font-size: 7.8pt; }
    </style>

    ${bannerHtml}
    ${kpisHtml}

    <table class="payroll-table">
      <thead>
        <tr>
          <th style="width: 24px; text-align: center;">#</th>
          <th style="min-width: 130px; text-align: start;">${locale === "ar" ? "اسم الموظف" : "Employee"}</th>
          <th style="width: 80px; text-align: center;">${locale === "ar" ? "رقم الهوية" : "National ID"}</th>
          <th style="min-width: 100px; text-align: start;">${locale === "ar" ? "المسمى الوظيفي" : "Job Title"}</th>
          <th style="width: 65px; text-align: end;">${esc(t("basicSalary"))}</th>
          <th style="width: 60px; text-align: end;">${esc(t("housingAllowance"))}</th>
          <th style="width: 65px; text-align: end;">${locale === "ar" ? "بدلات أخرى" : "Other Allow."}</th>
          <th style="width: 72px; text-align: end; background: #edf2f7;">${esc(t("totalGross"))}</th>
          <th style="width: 60px; text-align: end; color: #b23a2b;">${locale === "ar" ? "التأمينات" : "GOSI"}</th>
          <th style="width: 65px; text-align: end; color: #b23a2b;">${locale === "ar" ? "خصم حضور" : "Att. Ded."}</th>
          <th style="width: 65px; text-align: end; color: #b23a2b;">${locale === "ar" ? "سلف وأخرى" : "Adv/Other"}</th>
          <th style="width: 70px; text-align: end; color: #b23a2b; background: #fee2e2;">${esc(t("totalDeductions"))}</th>
          <th style="width: 78px; text-align: end; color: #2f4a9e; background: #e0e7ff;">${esc(t("totalNet"))}</th>
          <th style="min-width: 120px; text-align: start;">${locale === "ar" ? "البنك والآيبان" : "Bank & IBAN"}</th>
        </tr>
      </thead>
      <tbody>
        ${slipRows.join("")}
        <tr class="total-row">
          <td colspan="4" style="text-align: start; padding-inline-start: 10px;">
            ${locale === "ar" ? "الإجمالي العام (" + (slips?.length ?? 0) + " موظف)" : "Total (" + (slips?.length ?? 0) + " employees)"}
          </td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace;">${ltr(num(run.total_basic))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace;">${ltr(num(run.total_housing))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace;">${ltr(num(totalOtherAllowances))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace; font-weight: 800; background: #e2e8f0 !important;">${ltr(num(run.total_gross))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace; color: #b23a2b;">${ltr(num(run.total_gosi_employee))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace; color: #b23a2b;">${ltr(num(totalAttendanceDeductions))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace; color: #b23a2b;">${ltr(num(totalAdvanceAndOtherDeductions))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace; font-weight: 800; color: #b23a2b; background: #fecaca !important;">${ltr(num(run.total_deductions))}</td>
          <td style="text-align: end; font-family: 'InterEmbedded', monospace; font-weight: 800; color: #2f4a9e; background: #c7d2fe !important;">${ltr(num(run.total_net))}</td>
          <td style="font-size: 7pt; color: #4a5875;">${currency}</td>
        </tr>
      </tbody>
    </table>

    ${run.notes ? `<div style="margin-top: 10px; font-size: 8pt; color: #4a5875; background: #f6f7f9; border: 1px solid #dde2ea; border-radius: 6px; padding: 6px 10px;"><strong>${esc(t("notes"))}:</strong> ${esc(run.notes)}</div>` : ""}

    ${signaturesHtml}
  `;

  const pageTitle = isDraft
    ? locale === "ar"
      ? `مسودة مسير رواتب شهر ${period}`
      : `Draft Payroll Run - ${period}`
    : locale === "ar"
      ? `كشف مسير رواتب شهر ${period}`
      : `Approved Payroll Run Sheet - ${period}`;

  const html = documentHtml({
    locale,
    brand,
    title: pageTitle,
    numberLabel: tp("number"),
    number: docNumber,
    issuedLabel: tp("issued"),
    issued: esc(issuedNow(locale)),
    body,
    landscape: true,
  });

  const pdf = await renderPdf(html, {
    locale,
    footerLabel: `${brand.name} · ${pageTitle} · ${docNumber}`,
    pageLabel: tp("page"),
    ofLabel: tp("of"),
    landscape: true,
  });

  const filename = `${docNumber.toLowerCase()}${isDraft ? "-draft" : "-approved"}.pdf`;
  return { pdf, filename };
}
