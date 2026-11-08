// Content-Security-Policy with a per-request nonce (CLAUDE.md §5.15).
// Scripts: nonce + strict-dynamic only. Styles allow inline because React style attributes need it;
// script injection is the risk CSP guards against here.
export function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseWs = supabase.replace(/^http/, "ws");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${supabaseWs} https://vitals.vercel-insights.com`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Generated PDFs are served by two Route Handlers. The page policy lists `object-src 'none'`, which
 * can stop a browser's built-in PDF viewer from opening them, and a PDF has no scripts or
 * subresources for the policy to restrict. They get a policy without `default-src`/`object-src`
 * that still forbids framing, forms and base tags.
 */
export const PDF_CSP = "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const PDF_PATH = /^(\/en)?\/(tasks|employees|leave|payroll\/slips)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/pdf$/;
const SHEET_PDF_PATH = /^(\/en)?\/attendance\/sheet\/pdf$/;

export function isPdfPath(pathname: string): boolean {
  return PDF_PATH.test(pathname) || SHEET_PDF_PATH.test(pathname);
}
