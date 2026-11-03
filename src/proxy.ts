import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { buildCsp, isPdfPath, PDF_CSP } from "@/lib/security/csp";
import { refreshSession } from "@/lib/supabase/proxy";

const handleI18n = createIntlMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // next-intl copies the request headers into the response it builds, so Next.js reads the nonce
  // from this CSP header and adds it to its own scripts.
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const response = handleI18n(request);
  await refreshSession(request, response);
  response.headers.set("content-security-policy", isPdfPath(request.nextUrl.pathname) ? PDF_CSP : csp);
  return response;
}

export const config = {
  // Everything except API routes, Next internals, Vercel internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
