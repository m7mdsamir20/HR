import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { nationalityName } from "@/lib/countries";
import { loadDocuments } from "@/lib/employee-documents";
import { localName, one } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { issuedNow, loadBrand } from "./data";
import { documentHtml, dt, esc, grid, ltr, pill, txt } from "./html";
import { renderPdf } from "./render";

/** The employee data card for owner and HR: identity, work, contract, pay (if readable), documents. */
export async function buildEmployeeCardPdf(locale: Locale, member: Member, employeeId: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();
  // RLS: outside the caller's reach nothing comes back; pay only for whoever manages the file.
  const [{ data: e }, { data: pay }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, national_id, full_name_ar, full_name_en, phone, email, employee_number, job_title, occupation, role, status, nationality, gender, birth_date, marital_status, hire_date, contract_type, contract_start, contract_end, probation_days, department:departments(name_ar, name_en), manager:manager_id(full_name_ar, full_name_en)",
      )
      .eq("id", employeeId)
      .neq("status", "deleted")
      .maybeSingle(),
    supabase.from("employee_compensation").select("*").eq("employee_id", employeeId).maybeSingle(),
  ]);
  if (!e) return null;
  const [documents, brand] = await Promise.all([loadDocuments(locale, employeeId), loadBrand(locale, member)]);

  const te = await getTranslations({ locale, namespace: "employees" });
  const td = await getTranslations({ locale, namespace: "documents" });
  const tr = await getTranslations({ locale, namespace: "roles" });
  const tp = await getTranslations({ locale, namespace: "pdf" });
  const manager = one(e.manager);
  const date = (d: string | null) => (d ? dt(formatDate(locale, d)) : "—");
  const number = `EMP-${(e.employee_number ?? e.id.slice(0, 8)).toUpperCase()}`;
  const status = e.status as "active" | "disabled";

  const amount = (v: number) => `${ltr(formatAmount(v))} ${esc(te("form.currency"))}`;
  const payRows = pay
    ? ([
        ["basicSalary", pay.basic_salary],
        ["housingAllowance", pay.housing_allowance],
        ["transportAllowance", pay.transport_allowance],
        ["communicationAllowance", pay.communication_allowance],
        ["otherAllowances", pay.other_allowances],
      ] as const)
    : [];
  const total = payRows.reduce((sum, [, v]) => sum + Number(v), 0);

  const body = `
    <div class="card" style="margin-bottom:6px">
      <strong style="font-size:13pt">${txt(localName(locale, e.full_name_ar, e.full_name_en))}</strong>
      ${pill(status === "active" ? "stamp" : "brick", te(`status.${status}`))}
      <div class="muted">${esc(tr(e.role))}${e.job_title ? ` · ${esc(e.job_title)}` : ""}</div>
    </div>

    <h2>${esc(te("form.sections.identity"))}</h2>
    ${grid([
      { label: te("columns.nationalId"), value: ltr(e.national_id) },
      { label: te("form.nationality"), value: txt(nationalityName(locale, e.nationality)) },
      { label: te("form.gender"), value: e.gender ? esc(te(`options.gender.${e.gender as "male"}`)) : "—" },
      { label: te("form.birthDate"), value: date(e.birth_date) },
      { label: te("form.maritalStatus"), value: e.marital_status ? esc(te(`options.maritalStatus.${e.marital_status as "single"}`)) : "—" },
      { label: te("form.phone"), value: e.phone ? ltr(e.phone) : "—" },
      { label: te("form.email"), value: e.email ? ltr(e.email) : "—" },
    ])}

    <h2>${esc(te("form.sections.work"))}</h2>
    ${grid([
      { label: te("form.employeeNumber"), value: e.employee_number ? ltr(e.employee_number) : "—" },
      { label: te("columns.department"), value: e.department ? txt(localName(locale, e.department.name_ar, e.department.name_en)) : "—" },
      { label: te("columns.manager"), value: manager ? txt(localName(locale, manager.full_name_ar, manager.full_name_en)) : "—" },
      { label: te("form.occupation"), value: txt(e.occupation) },
      { label: te("form.hireDate"), value: date(e.hire_date) },
    ])}

    <h2>${esc(te("form.sections.contract"))}</h2>
    ${grid([
      { label: te("form.contractType"), value: e.contract_type ? esc(te(`options.contractType.${e.contract_type as "fixed"}`)) : "—" },
      { label: te("form.contractStart"), value: date(e.contract_start) },
      { label: te("form.contractEnd"), value: date(e.contract_end) },
      { label: te("form.probationDays"), value: e.probation_days !== null ? ltr(e.probation_days) : "—" },
    ])}

    ${
      pay
        ? `<h2>${esc(te("form.sections.pay"))}</h2>
           <table><tbody>
             ${payRows.map(([k, v]) => `<tr><td>${esc(te(`form.${k}`))}</td><td style="text-align:end">${amount(Number(v))}</td></tr>`).join("")}
             <tr><td><strong>${esc(te("form.totalSalary"))}</strong></td><td style="text-align:end"><strong>${amount(total)}</strong></td></tr>
           </tbody></table>
           <div style="height:8px"></div>
           ${grid([
             { label: te("form.bankName"), value: txt(pay.bank_name) },
             { label: te("form.iban"), value: pay.iban ? ltr(pay.iban) : "—" },
             { label: te("form.gosiNumber"), value: pay.gosi_number ? ltr(pay.gosi_number) : "—" },
           ])}`
        : ""
    }

    <h2>${esc(td("title"))}</h2>
    ${
      documents.length
        ? `<table><thead><tr><th>${esc(td("type"))}</th><th>${esc(td("number"))}</th><th>${esc(td("issueDate"))}</th><th>${esc(td("expiryDate"))}</th><th></th></tr></thead><tbody>
            ${documents
              .map(
                (d) => `<tr>
                  <td>${esc(td(`types.${d.docType as "iqama"}`))}</td>
                  <td>${d.number ? ltr(d.number) : "—"}</td>
                  <td>${d.issueDate ? dt(d.issueDate) : "—"}</td>
                  <td>${d.expiryDate ? dt(d.expiryDate) : "—"}${d.expiryHijri ? `<div class="muted">${dt(d.expiryHijri)}</div>` : ""}</td>
                  <td>${d.tone && d.status !== "noExpiry" ? pill(d.tone === "neutral" ? "neutral" : d.tone, td(`status.${d.status}`)) : ""}</td>
                </tr>`,
              )
              .join("")}
          </tbody></table>`
        : `<p class="muted">${esc(td("empty"))}</p>`
    }
  `;

  const html = documentHtml({
    locale,
    brand,
    title: tp("employeeCardTitle"),
    numberLabel: tp("number"),
    number,
    issuedLabel: tp("issued"),
    issued: esc(issuedNow(locale)),
    body,
  });
  const pdf = await renderPdf(html, { locale, footerLabel: `${tp("employeeCardTitle")} · ${number}`, pageLabel: tp("page"), ofLabel: tp("of") });
  return { pdf, filename: `${number.toLowerCase()}.pdf` };
}
