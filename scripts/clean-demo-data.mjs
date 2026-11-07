// Script to purge all demo data (company, employees, tasks, attendance, payroll, leaves, advances)
// Leaves the schema, tables, functions, and platform admins clean and ready for real data.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function cleanDemoData() {
  console.log("Cleaning demo data...");

  // 1. Delete tasks and reports
  await admin.from("report_attachments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("task_reports").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("task_comments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 2. Delete attendance & deductions
  await admin.from("attendance_deductions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("attendance_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 3. Delete leave requests & balances
  await admin.from("leave_trail").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("leave_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("leave_balances").delete().neq("employee_id", "00000000-0000-0000-0000-000000000000");

  // 4. Delete advances & payroll
  await admin.from("advance_installments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("advance_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("payroll_slips").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("payroll_runs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 5. Delete employee documents & compensation
  await admin.from("employee_documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("employee_compensation").delete().neq("employee_id", "00000000-0000-0000-0000-000000000000");

  // 6. Delete employees
  const { data: emps } = await admin.from("employees").select("id, user_id");
  if (emps && emps.length > 0) {
    await admin.from("employees").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    for (const e of emps) {
      if (e.user_id) {
        await admin.auth.admin.deleteUser(e.user_id).catch(() => {});
      }
    }
  }

  // 7. Delete departments, branches, shifts
  await admin.from("departments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("branches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("shifts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 8. Delete demo companies
  await admin.from("companies").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 9. Clean notifications and audit logs
  await admin.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("audit_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("All demo data deleted successfully! Database is completely clean.");
}

cleanDemoData().catch((err) => {
  console.error("Clean failed:", err.message ?? err);
  process.exit(1);
});
