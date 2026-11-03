"use server";

// The signed-in employee's own account: password change and language. CLAUDE.md §2, §3.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { authEmailFor } from "@/lib/auth/national-id";
import { publicEnv } from "@/lib/env";
import { toActionError, type ActionError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { passwordSchema } from "@/lib/validation/company";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

export type PasswordState =
  | { ok: true }
  | { ok: false; error: "wrongCurrent" | "mismatch" | "weak" | "samePassword" | ActionError }
  | undefined;

const passwordChangeSchema = z.object({
  current: z.string().min(1).max(128),
  next: passwordSchema,
  confirm: z.string(),
});

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const member = await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const parsed = passwordChangeSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, error: field === "next" ? "weak" : "wrongCurrent" };
  }
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { ok: false, error: "mismatch" };
  if (next === current) return { ok: false, error: "samePassword" };

  const supabase = await createClient();
  // Guessing the current password through this form is limited like a login.
  const { error: limitError } = await supabase.rpc("consume_rate_limit", { p_kind: "password_change" });
  if (limitError) return { ok: false, error: toActionError(limitError, "changePassword") };

  const { data: me } = await supabase.from("employees").select("national_id").eq("id", member.employee_id).single();
  if (!me) return { ok: false, error: "unexpected" };

  // Check the current password on a throwaway client, so the user's own cookie session is untouched,
  // then end the session that check created.
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = publicEnv();
  const verifier = createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: authEmailFor(me.national_id), password: current });
  if (verifyError) return { ok: false, error: "wrongCurrent" };
  await verifier.auth.signOut({ scope: "local" });

  const { error: updateError } = await supabase.auth.updateUser({ password: next });
  if (updateError) {
    if (updateError.code === "same_password") return { ok: false, error: "samePassword" };
    if (updateError.code === "weak_password") return { ok: false, error: "weak" };
    console.error("changePassword: update", updateError.code);
    return { ok: false, error: "unexpected" };
  }

  // Every other device has to sign in again with the new password. CLAUDE.md §3.
  await supabase.auth.signOut({ scope: "others" });
  const { error: auditError } = await supabase.rpc("profile_password_changed");
  if (auditError) console.error("changePassword: audit", auditError.code);
  return { ok: true };
}

export async function setLanguage(formData: FormData): Promise<void> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const next = z.enum(routing.locales).parse(formData.get("language"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("profile_set_locale", { p_locale: next });
  if (error) throw new Error(toActionError(error, "setLanguage"));
  redirect({ href: "/profile", locale: next });
}
