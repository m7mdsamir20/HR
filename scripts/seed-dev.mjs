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
const USERS = [
  { nationalId: "1000000002", name_ar: "خالد العتيبي", name_en: "Khalid Alotaibi", role: "owner" },
  { nationalId: "1000000003", name_ar: "نورة القحطاني", name_en: "Noura Alqahtani", role: "hr" },
  { nationalId: "1000000004", name_ar: "فهد الشمري", name_en: "Fahad Alshammari", role: "manager" },
  { nationalId: "2000000005", name_ar: "أحمد حسن", name_en: "Ahmed Hassan", role: "employee", reportsTo: "1000000004" },
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
        manager_id: u.reportsTo ? ids.get(u.reportsTo) : null,
      })
      .select("id")
      .single();
    if (e) throw e;
    ids.set(u.nationalId, data.id);
  }

  console.log(`Seeded system admin ${ADMIN.nationalId} and ${USERS.length} company users (password in scripts/seed-dev.mjs).`);
}

function check({ error }) {
  if (error) throw error;
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
