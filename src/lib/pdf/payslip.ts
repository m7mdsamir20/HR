import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { issuedNow, loadBrand } from "./data";
import { documentHtml, esc, grid, ltr, pill } from "./html";
import { renderPdf } from "./render";

export async function buildPayslipPdf(
  locale: Locale,
  member: Member,
  slipId: string
): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();

  const { data: slip } = await supabase
    .from("payroll_slips")
    .select(`
      *,
      run:payroll_run_id (
        year,
        month,
        status,
        approved_at
      ),
      employee:employee_id (
        id,
        national_id,
        id_type,
        full_name_ar,
        full_name_en,
        job_title,
        hire_date
      )
    `)
    .eq("id", slipId)
    .maybeSingle();

  if (!slip) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp = slip.employee as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = slip.run as any;

  const brand = await loadBrand(locale, member);
  const t = await getTranslations({ locale, namespace: "payroll" });
  const tp = await getTranslations({ locale, namespace: "pdf" });

  const empName = (locale === "en" && emp?.full_name_en) || emp?.full_name_ar || "—";
  const docNumber = `PAY-${run.year}-${String(run.month).padStart(2, "0")}-${emp?.national_id?.slice(-4) || "0000"}`;
  const period = `${String(run.month).padStart(2, "0")} / ${run.year}`;

  const body = `
    <div class="card" style="margin-bottom: 8px;">
      <strong style="font-size: 13pt;">${esc(empName)}</strong>
      ${pill(run.status === "approved" ? "stamp" : "saffron", t(`status.${run.status}`))}
      <div class="muted">${emp?.job_title ? esc(emp.job_title) : ""}</div>
    </div>

    <h2>بيانات الموظف والفترة</h2>
    ${grid([
      { label: "رقم الهوية / الإقامة", value: ltr(emp?.national_id ?? "—") },
      { label: t("period"), value: ltr(period) },
      { label: t("bankName"), value: esc(slip.bank_name ?? "—") },
      { label: t("iban"), value: slip.iban ? ltr(slip.iban) : "—", wide: true },
    ])}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;">
      <div>
        <h2>${esc(t("earnings"))}</h2>
        <table>
          <thead>
            <tr><th>البند</th><th style="text-align: end;">المبلغ</th></tr>
          </thead>
          <tbody>
            <tr><td>${esc(t("basicSalary"))}</td><td style="text-align: end;">${ltr(`${Number(slip.basic_salary).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("housingAllowance"))}</td><td style="text-align: end;">${ltr(`${Number(slip.housing_allowance).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("transportAllowance"))}</td><td style="text-align: end;">${ltr(`${Number(slip.transport_allowance).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("communicationAllowance"))}</td><td style="text-align: end;">${ltr(`${Number(slip.communication_allowance).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("otherAllowancesField"))}</td><td style="text-align: end;">${ltr(`${Number(slip.other_allowances).toFixed(2)} SAR`)}</td></tr>
            <tr style="font-weight: bold; background: #F6F7F9;"><td>${esc(t("totalGross"))}</td><td style="text-align: end;">${ltr(`${Number(slip.gross_salary).toFixed(2)} SAR`)}</td></tr>
          </tbody>
        </table>
      </div>

      <div>
        <h2>${esc(t("deductions"))}</h2>
        <table>
          <thead>
            <tr><th>البند</th><th style="text-align: end;">المبلغ</th></tr>
          </thead>
          <tbody>
            <tr><td>${esc(t("gosiEmployee"))}</td><td style="text-align: end; color: #B23A2B;">${ltr(`${Number(slip.gosi_employee).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("attendanceDeduction"))}</td><td style="text-align: end; color: #B23A2B;">${ltr(`${Number(slip.attendance_deduction).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("leaveDeduction"))}</td><td style="text-align: end; color: #B23A2B;">${ltr(`${Number(slip.leave_deduction).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("advanceDeduction"))}</td><td style="text-align: end; color: #B23A2B;">${ltr(`${Number(slip.advance_deduction).toFixed(2)} SAR`)}</td></tr>
            <tr><td>${esc(t("otherDeductions"))}</td><td style="text-align: end; color: #B23A2B;">${ltr(`${Number(slip.other_deductions).toFixed(2)} SAR`)}</td></tr>
            <tr style="font-weight: bold; background: #F6F7F9;"><td>${esc(t("totalDeductions"))}</td><td style="text-align: end; color: #B23A2B;">${ltr(`${Number(slip.total_deductions).toFixed(2)} SAR`)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top: 20px; background: #EEF2F6; border: 2px solid #2F4A9E; padding: 16px; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 14px; color: #55627A;">${esc(t("netSalary"))}</span>
          <div style="font-size: 22px; font-weight: 700; color: #2F4A9E;">
            ${ltr(`${Number(slip.net_salary).toFixed(2)} SAR`)}
          </div>
        </div>
        <div style="text-align: end; font-size: 12px; color: #55627A;">
          <span>${esc(t("gosiEmployer"))}: </span>
          <strong>${ltr(`${Number(slip.gosi_employer).toFixed(2)} SAR`)}</strong>
        </div>
      </div>
    </div>

    ${slip.notes ? `<div class="card" style="margin-top: 12px;"><p><strong>${esc(t("notes"))}:</strong> ${esc(slip.notes)}</p></div>` : ""}
  `;

  const html = documentHtml({
    locale,
    brand,
    title: t("title"),
    numberLabel: tp("number"),
    number: docNumber,
    issuedLabel: tp("issued"),
    issued: esc(issuedNow(locale)),
    body,
  });

  const pdf = await renderPdf(html, {
    locale,
    footerLabel: `${brand.name} · ${docNumber}`,
    pageLabel: tp("page"),
    ofLabel: tp("of"),
  });

  return { pdf, filename: `${docNumber.toLowerCase()}.pdf` };
}
