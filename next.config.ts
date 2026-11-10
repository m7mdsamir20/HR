import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Static security headers for every response. CSP is per-request (nonce) and set in src/proxy.ts.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera for proof-of-work photos; location for the attendance check-in (this origin only).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Cache Components is off on purpose: every page reads the session and tenant data
// through Supabase RLS, so nothing tenant-scoped may be cached on the server (CLAUDE.md §5).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // PDF generation (CLAUDE.md §6.1): the Chromium build is loaded at runtime, not bundled, and the
  // committed fonts and chromium binaries must ship with the PDF routes on Vercel.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/[locale]/tasks/[id]/pdf": ["./src/assets/fonts/**", "./node_modules/@sparticuz/chromium/bin/**"],
    "/[locale]/employees/[id]/pdf": ["./src/assets/fonts/**", "./node_modules/@sparticuz/chromium/bin/**"],
    "/[locale]/leave/[id]/pdf": ["./src/assets/fonts/**", "./node_modules/@sparticuz/chromium/bin/**"],
    "/[locale]/payroll/slips/[id]/pdf": ["./src/assets/fonts/**", "./node_modules/@sparticuz/chromium/bin/**"],
    "/[locale]/attendance/sheet/pdf": ["./src/assets/fonts/**", "./node_modules/@sparticuz/chromium/bin/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
