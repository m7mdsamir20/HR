// Creates a system admin account. The only way to make one: there is no UI for it.
//   node --env-file=.env.local scripts/create-platform-admin.mjs <national_id> "<full name>"
// The password is read from the terminal (hidden), never from arguments or shell history.
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const [nationalId, fullName] = process.argv.slice(2);
if (!/^[12]\d{9}$/.test(nationalId ?? "") || !fullName || fullName.trim().length < 2) {
  console.error('Usage: create-platform-admin.mjs <10-digit national ID> "<full name>"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
  process.exit(1);
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(prompt)) rl.output.write(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await askHidden("Password (min 12 characters): ");
if (password.length < 12) {
  console.error("Password too short.");
  process.exit(1);
}
if ((await askHidden("Repeat password: ")) !== password) {
  console.error("Passwords do not match.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.createUser({
  email: `${nationalId}@users.invalid`,
  password,
  email_confirm: true,
});
if (error) {
  console.error(`Could not create the account: ${error.message}`);
  process.exit(1);
}

const { error: insertError } = await admin
  .from("platform_admins")
  .insert({ user_id: data.user.id, national_id: nationalId, full_name: fullName.trim() });
if (insertError) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error(`Could not register the system admin: ${insertError.message}`);
  process.exit(1);
}

console.log(`System admin ${nationalId} created.`);
