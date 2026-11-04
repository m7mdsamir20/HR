import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Member } from "@/lib/auth/account";
import { localName, one } from "@/lib/employees";
import { formatDate, formatDateTime } from "@/lib/format";
import type { LeaveType } from "@/lib/leave";
import { createClient } from "@/lib/supabase/server";
import { issuedNow, loadBrand } from "./data";
import { documentHtml, dt, esc, grid, ltr, pill, txt } from "./html";
import { renderPdf } from "./render";

type Trail = { manager_name_ar: string | null; manager_name_en: string | null; decider_name_ar: string | null; decider_name_en: string | null };

/** An approved leave request: the employee, the leave, how it is paid, and who approved it and when. */
export async function buildLeaveRequestPdf(locale: Locale, member: Member, requestId: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = await createClient();
  // RLS: only the employee, their manager, HR and the owner can read the request.
  const { data: r } = await supabase
    .from("leave_requests")
    .select(
      "id, employee_id, type, start_date, end_date, days, reason, medical_ref, status, days_full, days_three_quarter, days_unpaid, manager_approved_at, decided_at, decision_note, created_at",
    )
    .eq("id", requestId)
    .eq("status", "approved")
    .maybeSingle();
  if (!r) return null;

  const [{ data: e }, { data: trail }, brand] = await Promise.all([
    supabase
      .from("employees")
      .select("national_id, full_name_ar, full_name_en, job_title, employee_number, department:departments(name_ar, name_en)")
      .eq("id", r.employee_id)
      .maybeSingle(),
    supabase.rpc("leave_request_trail", { p_id: r.id }),
    loadBrand(locale, member),
  ]);
  if (!e) return null;
  const names = trail as unknown as Trail | null;
  const approver = (ar: string | null | undefined, en: string | null | undefined) => (ar ? txt(localName(locale, ar, en ?? null)) : "—");

  const tl = await getTranslations({ locale, namespace: "leave" });
  const te = await getTranslations({ locale, namespace: "employees" });
  const tp = await getTranslations({ locale, namespace: "pdf" });
  const department = one(e.department);
  const number = `LV-${r.id.slice(0, 8).toUpperCase()}`;
  const date = (d: string) => dt(formatDate(locale, d));
  const reduced = (r.days_three_quarter ?? 0) > 0 || (r.days_unpaid ?? 0) > 0;

  const body = `
    <div class="card" style="margin-bottom:6px">
      <strong style="font-size:13pt">${txt(localName(locale, e.full_name_ar, e.full_name_en))}</strong>
      ${pill("stamp", tl("status.approved"))}
      <div class="muted">${e.job_title ? esc(e.job_title) : ""}</div>
    </div>

    <h2>${esc(tp("leaveEmployee"))}</h2>
    ${grid([
      { label: te("columns.nationalId"), value: ltr(e.national_id) },
      { label: te("form.employeeNumber"), value: e.employee_number ? ltr(e.employee_number) : "—" },
      { label: te("columns.department"), value: department ? txt(localName(locale, department.name_ar, department.name_en)) : "—" },
    ])}

    <h2>${esc(tp("leaveDetails"))}</h2>
    ${grid([
      { label: tl("form.type"), value: esc(tl(`types.${r.type as LeaveType}`)) },
      { label: tl("form.startDate"), value: date(r.start_date) },
      { label: tl("form.endDate"), value: date(r.end_date) },
      { label: tp("leaveDays"), value: ltr(r.days) },
      ...(reduced
        ? [{ label: tp("leavePay"), value: esc(tl("requests.paySplit", { full: r.days_full ?? 0, three: r.days_three_quarter ?? 0, unpaid: r.days_unpaid ?? 0 })), wide: true }]
        : [{ label: tp("leavePay"), value: esc(tp("leavePaidFull")) }]),
      ...(r.medical_ref ? [{ label: tl("requests.medicalRef"), value: ltr(r.medical_ref) }] : []),
      ...(r.reason ? [{ label: tl("form.reason"), value: txt(r.reason), wide: true }] : []),
    ])}

    <h2>${esc(tp("leaveApprovals"))}</h2>
    <table><thead><tr><th>${esc(tp("leaveStep"))}</th><th>${esc(tp("leaveBy"))}</th><th>${esc(tp("leaveWhen"))}</th></tr></thead><tbody>
      <tr><td>${esc(tp("leaveRequestedStep"))}</td><td>${txt(localName(locale, e.full_name_ar, e.full_name_en))}</td><td>${dt(formatDateTime(locale, r.created_at))}</td></tr>
      ${
        r.manager_approved_at
          ? `<tr><td>${esc(tp("leaveManagerStep"))}</td><td>${approver(names?.manager_name_ar, names?.manager_name_en)}</td><td>${dt(formatDateTime(locale, r.manager_approved_at))}</td></tr>`
          : ""
      }
      <tr><td>${esc(tp("leaveFinalStep"))}</td><td>${approver(names?.decider_name_ar, names?.decider_name_en)}${r.decision_note ? `<div class="muted">${txt(r.decision_note)}</div>` : ""}</td><td>${r.decided_at ? dt(formatDateTime(locale, r.decided_at)) : "—"}</td></tr>
    </tbody></table>
  `;

  const html = documentHtml({
    locale,
    brand,
    title: tp("leaveRequestTitle"),
    numberLabel: tp("number"),
    number,
    issuedLabel: tp("issued"),
    issued: esc(issuedNow(locale)),
    body,
  });
  const pdf = await renderPdf(html, { locale, footerLabel: `${tp("leaveRequestTitle")} · ${number}`, pageLabel: tp("page"), ofLabel: tp("of") });
  return { pdf, filename: `${number.toLowerCase()}.pdf` };
}
