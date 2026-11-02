import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

// Bypasses RLS. Use only for Auth admin calls (create/ban/delete users, reset passwords, revoke
// sessions) after the caller's role was checked, and for the login rate-limit RPCs, which are
// granted to service_role alone. Never read or write tenant data with it. CLAUDE.md §5.4.
export function createAdminClient() {
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
