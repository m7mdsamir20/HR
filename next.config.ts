import type { NextConfig } from "next";

// Cache Components is off on purpose: every page reads the session and tenant data
// through Supabase RLS, so nothing tenant-scoped may be cached on the server (CLAUDE.md §5).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
