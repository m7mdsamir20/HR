import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env.server";

/** Keyed hash for login_attempts: raw national IDs and IPs are never stored. CLAUDE.md §5.10. */
export function rateLimitKey(kind: "id" | "ip", value: string): string {
  return createHmac("sha256", serverEnv().RATE_LIMIT_PEPPER).update(`${kind}:${value}`).digest("base64url");
}

/** Client IP as set by Vercel's edge (it overwrites any client-sent value). Locally: "local". */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
