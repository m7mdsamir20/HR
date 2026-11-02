import type { CookieOptionsWithName } from "@supabase/ssr";

// The browser never talks to Supabase directly: every read and write goes through Server
// Components and Server Actions. So the session cookie can be httpOnly, which keeps the access
// and refresh tokens out of reach of any script on the page. Secure outside local development.
export const sessionCookieOptions: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
