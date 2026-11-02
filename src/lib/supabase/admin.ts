import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

// Bypasses RLS. Use only for Auth admin calls (create/ban/delete users, reset passwords, revoke
// sessions) after the caller's role was checked. Never read tenant data with it. CLAUDE.md §5.4.
export function createAdminClient() {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
