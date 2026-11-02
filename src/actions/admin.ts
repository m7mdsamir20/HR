"use server";

// System admin actions. Each one: authenticate → authorize (requirePlatformAdmin) → zod → execute.
// Tenant writes run as the signed-in admin so RLS and the audit triggers apply; the service-role
// client is used only for the Auth admin call. CLAUDE.md §5.
import { refresh } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/auth/account";
import { authEmailFor } from "@/lib/auth/national-id";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createCompanyFields,
  createCompanySchema,
  invalidFields,
  subscriptionSchema,
  type CreateCompanyField,
} from "@/lib/validation/company";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const idSchema = z.uuid();

export type CreateCompanyState =
  | {
      error: "invalid" | "nationalIdTaken" | "unexpected";
      fields?: Partial<Record<CreateCompanyField, true>>;
      // Typed values to refill the form. Never includes the password.
      values: Partial<Record<CreateCompanyField, string>>;
    }
  | undefined;

export async function createCompany(_prev: CreateCompanyState, formData: FormData): Promise<CreateCompanyState> {
  const locale = localeSchema.parse(formData.get("locale"));
  await requirePlatformAdmin(locale);

  const raw = Object.fromEntries(createCompanyFields.map((f) => [f, String(formData.get(f) ?? "")]));
  const values = Object.fromEntries(
    createCompanyFields.filter((f) => f !== "password").map((f) => [f, raw[f]!.slice(0, 200)]),
  );
  const parsed = createCompanySchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid", fields: invalidFields(parsed.error), values };
  const d = parsed.data;

  const service = createAdminClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: authEmailFor(d.ownerNationalId),
    password: d.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    if (createError?.code === "email_exists") return { error: "nationalIdTaken", fields: { ownerNationalId: true }, values };
    if (createError?.code === "weak_password") return { error: "invalid", fields: { password: true }, values };
    console.error("createCompany: auth user", createError?.code);
    return { error: "unexpected", values };
  }

  const supabase = await createClient();
  const { data: companyId, error } = await supabase.rpc("admin_create_company", {
    p_name_ar: d.nameAr,
    p_name_en: d.nameEn ?? "",
    p_commercial_reg: d.commercialReg ?? "",
    p_max_employees: d.maxEmployees,
    p_subscription_ends_at: d.endsAt,
    p_owner_user_id: created.user.id,
    p_owner_national_id: d.ownerNationalId,
    p_owner_name_ar: d.ownerNameAr,
    p_owner_name_en: d.ownerNameEn ?? "",
    p_owner_phone: d.ownerPhone ?? "",
  });
  if (error || !companyId) {
    // Don't leave an Auth user behind that holds the national ID.
    await service.auth.admin.deleteUser(created.user.id);
    if (error?.code === "23505") return { error: "nationalIdTaken", fields: { ownerNationalId: true }, values };
    console.error("createCompany: rpc", error?.code);
    return { error: "unexpected", values };
  }

  redirect({ href: `/admin/companies/${companyId}`, locale });
}

export type SubscriptionState =
  | { ok: true }
  | { ok: false; error: "invalid" | "belowActive" | "unexpected"; activeCount?: number; fields?: Partial<Record<"maxEmployees" | "endsAt", true>> }
  | undefined;

export async function updateSubscription(
  companyId: string,
  _prev: SubscriptionState,
  formData: FormData,
): Promise<SubscriptionState> {
  const locale = localeSchema.parse(formData.get("locale"));
  await requirePlatformAdmin(locale);
  const id = idSchema.safeParse(companyId);
  const parsed = subscriptionSchema.safeParse({ maxEmployees: formData.get("maxEmployees"), endsAt: formData.get("endsAt") });
  if (!id.success) return { ok: false, error: "unexpected" };
  if (!parsed.success) return { ok: false, error: "invalid", fields: invalidFields(parsed.error) };

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id.data)
    .eq("status", "active");
  if (countError || count === null) return { ok: false, error: "unexpected" };
  if (parsed.data.maxEmployees < count) {
    return { ok: false, error: "belowActive", activeCount: count, fields: { maxEmployees: true } };
  }

  const { data, error } = await supabase
    .from("companies")
    .update({ max_employees: parsed.data.maxEmployees, subscription_ends_at: parsed.data.endsAt })
    .eq("id", id.data)
    .select("id");
  if (error || data.length !== 1) return { ok: false, error: "unexpected" };

  refresh();
  return { ok: true };
}

const statusSchema = z.enum(["active", "suspended"]);

export async function setCompanyStatus(companyId: string, status: string, formData: FormData): Promise<void> {
  const locale = localeSchema.parse(formData.get("locale"));
  await requirePlatformAdmin(locale);
  const id = idSchema.parse(companyId);
  const next = statusSchema.parse(status);

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ status: next }).eq("id", id);
  if (error) throw new Error("setCompanyStatus failed");
  refresh();
}
