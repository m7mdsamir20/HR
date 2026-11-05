"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { canEnter, homePathFor, loadAccount } from "@/lib/auth/account";
import { authEmailFor, isValidNationalId, normalizeNationalId } from "@/lib/auth/national-id";
import { clientIp, rateLimitKey } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: "invalid" | "locked" | "unavailable"; nationalId: string } | undefined;

const loginSchema = z.object({
  nationalId: z.string().max(40),
  password: z.string().min(1).max(128),
  locale: z.enum(routing.locales),
});

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const parsed = loginSchema.safeParse({
    nationalId: formData.get("nationalId"),
    password: formData.get("password"),
    locale,
  });
  const typed = typeof formData.get("nationalId") === "string" ? String(formData.get("nationalId")).slice(0, 40) : "";
  if (!parsed.success) return { error: "invalid", nationalId: typed };

  const nationalId = normalizeNationalId(parsed.data.nationalId);
  const idKey = rateLimitKey("id", nationalId);
  const ipKey = rateLimitKey("ip", await clientIp());
  const service = createAdminClient();

  // Checks the limits and records this attempt as a failure in one atomic step (fails closed if
  // the limiter is unreachable). It's flipped to success only after every check below passes.
  const { data: attempt, error: limitError } = await service.rpc("login_begin", { p_id_hash: idKey, p_ip_hash: ipKey });
  if (limitError) return { error: "unavailable", nationalId: typed };
  if (attempt === null) return { error: "locked", nationalId: typed };

  if (!isValidNationalId(nationalId)) return { error: "invalid", nationalId: typed };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: authEmailFor(nationalId), password: parsed.data.password });
  if (error) return { error: "invalid", nationalId: typed };

  // Correct password but no active membership (disabled, suspended, expired): same generic answer,
  // so the response never reveals that the account exists. CLAUDE.md §3.
  let account;
  try {
    account = await loadAccount(supabase);
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "unavailable", nationalId: typed };
  }
  if (!canEnter(account)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "invalid", nationalId: typed };
  }

  const { error: recordError } = await service.rpc("login_succeeded", { p_attempt: attempt });
  if (recordError) console.error("login_succeeded failed", recordError.code);
  // Employees land in the language saved in their profile.
  redirect({ href: homePathFor(account), locale: account.kind === "employee" ? account.locale : locale });
}

export async function switchCompany(companyId: string, locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  const id = z.uuid().safeParse(companyId);
  if (id.success) {
    cookieStore.set("active_company_id", id.data, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  redirect({ href: "/", locale });
}

export async function logout(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(formData.get("locale"));
  const cookieStore = await cookies();
  cookieStore.delete("active_company_id");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect({ href: "/login", locale });
}
