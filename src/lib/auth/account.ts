import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import { ROLES, type Role } from "./roles";

export { ROLES, type Role };

const companySchema = z.object({
  id: z.uuid(),
  name_ar: z.string(),
  name_en: z.string().nullable(),
  logo_path: z.string().nullable(),
  status: z.enum(["active", "suspended"]),
  subscription_ends_at: z.iso.date(),
  is_active: z.boolean(),
});

const accountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform_admin"), full_name: z.string() }),
  z.object({
    kind: z.literal("employee"),
    employee_id: z.uuid(),
    role: z.enum(ROLES),
    status: z.enum(["active", "disabled", "deleted"]),
    full_name_ar: z.string(),
    full_name_en: z.string().nullable(),
    locale: z.enum(["ar", "en"]),
    company: companySchema,
  }),
]);

export type Account = z.infer<typeof accountSchema>;
export type PlatformAdmin = Extract<Account, { kind: "platform_admin" }>;
export type Member = Extract<Account, { kind: "employee" }>;

/** The signed-in user's account as the database sees it (my_account RPC), or null. */
export async function loadAccount(supabase: SupabaseClient<Database>): Promise<Account | null> {
  const { data, error } = await supabase.rpc("my_account");
  if (error) throw new Error("my_account failed", { cause: error });
  return data === null ? null : accountSchema.parse(data);
}

/** Whether this account may use the app at all: a system admin, or an active member of an active company. */
export function canEnter(account: Account | null): account is PlatformAdmin | Member {
  if (!account) return false;
  if (account.kind === "platform_admin") return true;
  return account.status === "active" && account.company.is_active;
}

/** Cached per request: layouts, pages and actions in one render share a single lookup. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return loadAccount(supabase);
});

export function homePathFor(account: PlatformAdmin | Member): "/admin" | "/" {
  return account.kind === "platform_admin" ? "/admin" : "/";
}

// Guards. Call them in every page and Server Action (not only in layouts, which don't re-run on
// client navigation). The database enforces the same rules again through RLS.

export async function requirePlatformAdmin(locale: Locale): Promise<PlatformAdmin> {
  const account = await getAccount();
  if (account?.kind !== "platform_admin") redirect({ href: "/login", locale });
  return account as PlatformAdmin;
}

export async function requireMember(locale: Locale, roles?: readonly Role[]): Promise<Member> {
  const account = await getAccount();
  if (account?.kind === "platform_admin") redirect({ href: "/admin", locale });
  if (account?.kind !== "employee" || account.status !== "active") redirect({ href: "/login", locale });
  const member = account as Member;
  if (!member.company.is_active) {
    redirect({ href: member.role === "owner" ? "/subscription-ended" : "/login", locale });
  }
  if (roles && !roles.includes(member.role)) redirect({ href: "/", locale });
  return member;
}
