import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { sessionCookieOptions } from "./cookie-options";
import type { Database } from "./database.types";

// Request-scoped client acting as the signed-in user: every query goes through RLS.
export async function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("active_company_id")?.value;

  return createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions,
    global: {
      headers: activeCompanyId ? { "x-company-id": activeCompanyId } : {},
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes the session.
        }
      },
    },
  });
}
