import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/account";
import { generateWpsSif, type WpsEmployeeRecord } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const member = await requireMember("ar", ["owner", "hr"]);
  const supabase = await createClient();

  const [{ data: run }, { data: company }] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("id, year, month, total_net, employee_count")
      .eq("id", id)
      .single(),
    supabase
      .from("companies")
      .select("commercial_reg, name_ar")
      .eq("id", member.company.id)
      .single(),
  ]);

  if (!run) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { data: slips } = await supabase
    .from("payroll_slips")
    .select(`
      basic_salary,
      housing_allowance,
      transport_allowance,
      communication_allowance,
      other_allowances,
      total_deductions,
      net_salary,
      iban,
      bank_name,
      employee:employee_id (
        national_id,
        full_name_ar
      )
    `)
    .eq("payroll_run_id", id);

  const empRecords: WpsEmployeeRecord[] = (slips ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emp = s.employee as any;
    const otherEarnings =
      Number(s.transport_allowance) +
      Number(s.communication_allowance) +
      Number(s.other_allowances);

    return {
      nationalId: emp?.national_id ?? "0000000000",
      name: emp?.full_name_ar ?? "Employee",
      bankName: s.bank_name,
      iban: s.iban,
      basicSalary: Number(s.basic_salary),
      housingAllowance: Number(s.housing_allowance),
      otherEarnings,
      deductions: Number(s.total_deductions),
      netSalary: Number(s.net_salary),
    };
  });

  const yearStr = String(run.year);
  const monthStr = String(run.month).padStart(2, "0");
  const payDate = `${yearStr}-${monthStr}-28`;
  const today = new Date().toISOString().slice(0, 10);
  const cr = company?.commercial_reg || "0000000000";

  const sifContent = generateWpsSif(
    {
      employerId: cr,
      bankRoutingCode: "SAMA",
      fileCreationDate: today,
      paymentDate: payDate,
      recordsCount: run.employee_count,
      totalSalaries: Number(run.total_net),
    },
    empRecords
  );

  return new NextResponse(sifContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="WPS_SIF_${cr}_${yearStr}_${monthStr}.csv"`,
    },
  });
}
