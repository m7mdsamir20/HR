import { isAuthorizedCron } from "@/lib/security/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 100;

// Daily job (vercel.json): deletes uploads that no report, document or logo points at and that are
// older than a day (SECURITY.md F12). Authorized by CRON_SECRET only; anything else is a plain 404.
// The service-role client is used here for the Storage API and the orphan list, nothing else.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response(null, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("orphan_files", { p_older_than: "1 day" });
  if (error) {
    console.error("cleanup-files: list", error.code);
    return Response.json({ ok: false }, { status: 500 });
  }

  const names = (data ?? []).map((r) => r.name);
  let deleted = 0;
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const { data: removed, error: removeError } = await supabase.storage.from(BUCKET).remove(batch);
    if (removeError) {
      console.error("cleanup-files: remove", removeError.name);
      return Response.json({ ok: false, deleted }, { status: 500 });
    }
    deleted += removed?.length ?? 0;
  }
  return Response.json({ ok: true, found: names.length, deleted });
}
