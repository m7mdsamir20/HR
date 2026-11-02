"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
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
  const record = async (success: boolean) => {
    await service.rpc("login_record", { p_id_hash: idKey, p_ip_hash: ipKey, p_success: success });
  };

  // Fail closed: if the limiter can't be checked, nobody signs in.
  const { data: allowed, error: limitError } = await service.rpc("login_allowed", { p_id_hash: idKey, p_ip_hash: ipKey });
  if (limitError) return { error: "unavailable", nationalId: typed };
  if (!allowed) return { error: "locked", nationalId: typed };

  if (!isValidNationalId(nationalId)) {
    await record(false);
    return { error: "invalid", nationalId: typed };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: authEmailFor(nationalId), password: parsed.data.password });
  if (error) {
    await record(false);
    return { error: "invalid", nationalId: typed };
  }

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
    await record(false);
    return { error: "invalid", nationalId: typed };
  }

  await record(true);
  redirect({ href: homePathFor(account), locale });
}

export async function logout(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect({ href: "/login", locale });
}
