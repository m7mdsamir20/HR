// Dev helper: signs in as a seeded user and saves one of the app's PDFs, so the output can be
// inspected as a file. Local Supabase only.
//   node --env-file=.env.local scripts/fetch-pdf.mjs <national_id> <path> <out.pdf>
//   e.g. ... 2000000005 /tasks/<id>/pdf task.pdf
import { writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";

const [nationalId, path, out] = process.argv.slice(2);
const base = process.env.APP_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url) || !nationalId || !path || !out) {
  console.error("Usage: fetch-pdf.mjs <national_id> <path> <out.pdf> (local Supabase only)");
  process.exit(1);
}

const jar = new Map();
const supabase = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await supabase.auth.signInWithPassword({ email: `${nationalId}@users.invalid`, password: "Dev-pass-2026" });
if (error) throw error;

const res = await fetch(base + path, { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
console.log(res.status, res.headers.get("content-type"));
if (res.ok) writeFileSync(out, Buffer.from(await res.arrayBuffer()));
