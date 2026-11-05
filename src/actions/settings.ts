"use server";

// Company settings: departments (owner / HR) and the company profile and logo (owner).
// authenticate → authorize → zod → execute; RLS and the RPCs enforce the same rules.
import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { normalizeNationalId } from "@/lib/auth/national-id";
import { toActionError, type ActionError } from "@/lib/errors";
import { MAX_LOGO_BYTES, sniffLogo } from "@/lib/files";
import { BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);

export type SettingsState =
  | { ok: true }
  | { ok: false; error: "invalid" | "fileType" | "fileSize" | "duplicate" | ActionError; fields?: string[] }
  | undefined;

const departmentSchema = z.object({
  nameAr: z.string().trim().min(2).max(80),
  nameEn: z.preprocess(blankToUndefined, z.string().min(2).max(80).optional()),
});

function fieldsOf(error: z.ZodError) {
  return error.issues.map((i) => String(i.path[0]));
}

export async function createDepartment(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const member = await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr"]);
  const parsed = departmentSchema.safeParse({ nameAr: formData.get("nameAr"), nameEn: formData.get("nameEn") });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .insert({ company_id: member.company.id, name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate", fields: ["nameAr"] };
    return { ok: false, error: toActionError(error, "createDepartment") };
  }
  refresh();
  return { ok: true };
}

export async function updateDepartment(departmentId: string, _prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr"]);
  const id = z.uuid().safeParse(departmentId);
  const parsed = departmentSchema.safeParse({ nameAr: formData.get("nameAr"), nameEn: formData.get("nameEn") });
  if (!id.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn ?? null })
    .eq("id", id.data)
    .select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "duplicate", fields: ["nameAr"] };
    return { ok: false, error: toActionError(error, "updateDepartment") };
  }
  if (data.length !== 1) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

export async function deleteDepartment(departmentId: string, _prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr"]);
  const id = z.uuid().safeParse(departmentId);
  if (!id.success) return { ok: false, error: "notFound" };

  // Employees in it keep working without a department (FK: ON DELETE SET NULL on the column).
  const supabase = await createClient();
  const { data, error } = await supabase.from("departments").delete().eq("id", id.data).select("id");
  if (error) return { ok: false, error: toActionError(error, "deleteDepartment") };
  if (data.length !== 1) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

const companySchema = z.object({
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.preprocess(blankToUndefined, z.string().min(2).max(120).optional()),
  commercialReg: z.preprocess(
    (v) => (typeof v === "string" ? normalizeNationalId(v) || undefined : v),
    z.string().regex(/^\d{10}$/).optional(),
  ),
  taxNumber: z.preprocess(
    (v) => (typeof v === "string" ? normalizeNationalId(v) || undefined : v),
    z.string().max(30).optional(),
  ),
  phone: z.preprocess(blankToUndefined, z.string().max(30).optional()),
  email: z.preprocess(blankToUndefined, z.string().email().max(200).optional()),
  address: z.preprocess(blankToUndefined, z.string().max(250).optional()),
});

export async function updateCompanyProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin"]);
  const parsed = companySchema.safeParse({
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    commercialReg: formData.get("commercialReg"),
    taxNumber: formData.get("taxNumber"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("company_update_profile", {
    p_name_ar: parsed.data.nameAr,
    p_name_en: parsed.data.nameEn ?? "",
    p_commercial_reg: parsed.data.commercialReg ?? "",
    p_tax_number: parsed.data.taxNumber ?? "",
    p_phone: parsed.data.phone ?? "",
    p_email: parsed.data.email ?? "",
    p_address: parsed.data.address ?? "",
  });
  if (error) return { ok: false, error: toActionError(error, "updateCompanyProfile") };
  refresh();
  return { ok: true };
}

export async function uploadLogo(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const member = await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin"]);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "invalid", fields: ["logo"] };
  if (file.size > MAX_LOGO_BYTES) return { ok: false, error: "fileSize", fields: ["logo"] };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffLogo(bytes);
  if (!kind) return { ok: false, error: "fileType", fields: ["logo"] };

  const supabase = await createClient();
  const { error: limitError } = await supabase.rpc("consume_rate_limit", { p_kind: "upload" });
  if (limitError) return { ok: false, error: toActionError(limitError, "uploadLogo") };

  // Random name under the company's own folder; the storage policy checks the folder again.
  const path = `${member.company.id}/logo/${randomUUID()}.${kind.ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (uploadError) {
    console.error("uploadLogo: storage", uploadError.name);
    return { ok: false, error: "unexpected" };
  }

  const { data: oldPath, error } = await supabase.rpc("company_set_logo", { p_logo_path: path });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: toActionError(error, "uploadLogo") };
  }
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  refresh();
  return { ok: true };
}

export async function removeLogo(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin"]);
  const supabase = await createClient();
  const { data: oldPath, error } = await supabase.rpc("company_set_logo", { p_logo_path: null as unknown as string });
  if (error) return { ok: false, error: toActionError(error, "removeLogo") };
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  refresh();
  return { ok: true };
}
