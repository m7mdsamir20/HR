import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls the job URLs with `Authorization: Bearer $CRON_SECRET`. Only a secret of at
 * least 32 characters counts: an unset or short secret means the job refuses every call.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
