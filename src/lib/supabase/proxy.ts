import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

// Refreshes the Supabase session cookie on the response the i18n proxy already built.
// Authorization is NOT decided here: pages and Server Actions check the session themselves.
export async function refreshSession(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        // Auth cookies must never be cached and served to another user.
        for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
      },
    },
  });

  // Validates the JWT and refreshes it when expired. Don't run code between createServerClient and this.
  await supabase.auth.getClaims();
}
