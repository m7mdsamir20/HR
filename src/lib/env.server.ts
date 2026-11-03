import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  // Supabase secret key (or the legacy service_role key). Bypasses RLS: Auth admin calls, the login limiter RPCs and the daily storage cleanup only.
  SUPABASE_SECRET_KEY: z.string().min(20),
  // Pepper for hashing national IDs and IPs in login_attempts.
  RATE_LIMIT_PEPPER: z.string().min(32),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  cached ??= serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    RATE_LIMIT_PEPPER: process.env.RATE_LIMIT_PEPPER,
  });
  return cached;
}
