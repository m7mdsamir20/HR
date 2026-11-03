// Local development data: a system admin and one demo company with a user per role.
// Refuses to run anywhere but a local Supabase (CLAUDE.md §5.17).
// Run after `supabase db reset`: pnpm db:seed
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";

if (process.env.VERCEL_ENV === "production" || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error("seed-dev only runs against a local Supabase (http://127.0.0.1:<port>).");
  process.exit(1);
}

// Test accounts for local development only. Same password for all of them.
const PASSWORD = "Dev-pass-2026";
const ADMIN = { nationalId: "1000000001", name: "مدير النظام" };
const COMPANY = { name_ar: "شركة الإنشاءات التجريبية", name_en: "Demo Construction Co.", max_employees: 25 };
const DEPARTMENTS = [
  { key: "ops", name_ar: "التشغيل والصيانة", name_en: "Operations" },
  { key: "admin", name_ar: "الشؤون الإدارية", name_en: "Administration" },
];
const USERS = [
  { nationalId: "1000000002", name_ar: "خالد العتيبي", name_en: "Khalid Alotaibi", role: "owner", dept: "admin",
    file: { gender: "male", job_title: "المدير العام", hire_date: "2020-01-05", contract_type: "unlimited" },
    pay: { basic_salary: 30000, housing_allowance: 7500, transport_allowance: 1500 } },
  { nationalId: "1000000003", name_ar: "نورة القحطاني", name_en: "Noura Alqahtani", role: "hr", dept: "admin",
    file: { gender: "female", job_title: "أخصائية موارد بشرية", hire_date: "2022-03-01", contract_type: "unlimited" },
    pay: { basic_salary: 12000, housing_allowance: 3000, transport_allowance: 800, iban: "SA0380000000608010167519", bank_name: "مصرف الراجحي" } },
  { nationalId: "1000000004", name_ar: "فهد الشمري", name_en: "Fahad Alshammari", role: "manager", dept: "ops",
    file: { gender: "male", job_title: "مشرف التشغيل", hire_date: "2021-09-12", contract_type: "unlimited" },
    pay: { basic_salary: 9000, housing_allowance: 2250, transport_allowance: 700 } },
  { nationalId: "2000000005", name_ar: "أحمد حسن", name_en: "Ahmed Hassan", role: "employee", dept: "ops", reportsTo: "1000000004",
    file: { gender: "male", nationality: "EG", job_title: "فني صيانة", occupation: "فني كهرباء", marital_status: "married",
      hire_date: "2024-02-01", contract_type: "fixed", contract_start: "2024-02-01", contract_end: "2026-12-31", probation_days: 90 },
    pay: { basic_salary: 4000, housing_allowance: 1000, transport_allowance: 400, communication_allowance: 100 } },
];

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function authUser(nationalId) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${nationalId}@users.invalid`,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${nationalId}: ${error.message}`);
  return data.user.id;
}

async function main() {
  const adminId = await authUser(ADMIN.nationalId);
  check(await admin.from("platform_admins").insert({ user_id: adminId, national_id: ADMIN.nationalId, full_name: ADMIN.name }));

  const endsAt = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const { data: company, error } = await admin
    .from("companies")
    .insert({ ...COMPANY, subscription_ends_at: endsAt })
    .select("id")
    .single();
  if (error) throw error;

  const { data: depts, error: deptError } = await admin
    .from("departments")
    .insert(DEPARTMENTS.map(({ name_ar, name_en }) => ({ company_id: company.id, name_ar, name_en })))
    .select("id, name_ar");
  if (deptError) throw deptError;
  const deptId = (key) => depts.find((d) => d.name_ar === DEPARTMENTS.find((x) => x.key === key).name_ar).id;

  const ids = new Map();
  for (const u of USERS) {
    const userId = await authUser(u.nationalId);
    const { data, error: e } = await admin
      .from("employees")
      .insert({
        company_id: company.id,
        user_id: userId,
        national_id: u.nationalId,
        id_type: u.nationalId.startsWith("1") ? "citizen" : "resident",
        full_name_ar: u.name_ar,
        full_name_en: u.name_en,
        role: u.role,
        nationality: u.nationalId.startsWith("1") ? "SA" : u.file.nationality,
        ...Object.fromEntries(Object.entries(u.file).filter(([k]) => k !== "nationality")),
        department_id: deptId(u.dept),
        manager_id: u.reportsTo ? ids.get(u.reportsTo) : null,
      })
      .select("id")
      .single();
    if (e) throw e;
    ids.set(u.nationalId, data.id);
    check(await admin.from("employee_compensation").insert({ employee_id: data.id, company_id: company.id, ...u.pay }));
  }

  // Demo tasks in different states (written with the service role: users can only write through RPCs).
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const manager = ids.get("1000000004");
  const ahmed = ids.get("2000000005");
  check(
    await admin.from("tasks").insert([
      { company_id: company.id, created_by: manager, assignee_id: ahmed, title: "صيانة مكيفات المستودع", priority: "urgent", due_date: day(-1), status: "in_progress", started_at: new Date().toISOString(), location: "المستودع الرئيسي", expected_hours: 3 },
      { company_id: company.id, created_by: manager, assignee_id: ahmed, title: "فحص لوحات الكهرباء بالفرع الثاني", priority: "high", due_date: day(0), due_time: "15:00", status: "assigned", expected_hours: 2 },
      { company_id: company.id, created_by: manager, assignee_id: ahmed, title: "جرد قطع الغيار", priority: "medium", due_date: day(1), status: "assigned" },
      { company_id: company.id, created_by: manager, assignee_id: ahmed, title: "تدريب الفنيين الجدد على السلامة", priority: "low", due_date: day(5), status: "assigned", expected_hours: 6 },
    ]),
  );
  check(
    await admin.from("employee_documents").insert([
      { company_id: company.id, employee_id: ahmed, doc_type: "iqama", number: "2000000005", issue_date: "2023-01-10", expiry_date: day(20) },
      { company_id: company.id, employee_id: ahmed, doc_type: "health_card", expiry_date: day(200) },
    ]),
  );

  console.log(`Seeded system admin ${ADMIN.nationalId} and ${USERS.length} company users (password in scripts/seed-dev.mjs).`);
}

function check({ error }) {
  if (error) throw error;
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
