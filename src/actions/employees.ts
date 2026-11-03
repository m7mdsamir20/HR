"use server";

// Company people management (owner / HR). Each action: authenticate → authorize (requireMember with
// roles) → zod → execute. The RPCs re-check every rule in the database; the service-role client is
// used only for the Auth side (create, ban, password, delete). CLAUDE.md §3, §5.
import { refresh } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { authEmailFor } from "@/lib/auth/national-id";
import { toActionError, type ActionError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { passwordSchema, invalidFields } from "@/lib/validation/company";
import {
  createEmployeeFields,
  createEmployeeSchema,
  updateEmployeeFields,
  updateEmployeeSchema,
  type EmployeeField,
} from "@/lib/validation/employee";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const idSchema = z.uuid();
const PEOPLE_ROLES = ["owner", "hr"] as const;
// Banned until deleted or re-enabled; Supabase takes a duration, so this is effectively forever.
const BAN_FOREVER = "876000h";
// Optional uuid RPC arguments: the generated types mark them non-null, but SQL accepts null.
const noUuid = (v: string | undefined) => (v ?? null) as string;

export type EmployeeFormState =
  | {
      error: "invalid" | ActionError;
      fields?: Partial<Record<EmployeeField, true>>;
      values: Partial<Record<EmployeeField, string>>;
      saved?: false;
    }
  | { saved: true; error?: undefined }
  | undefined;

function readFields(formData: FormData, fields: EmployeeField[]) {
  const raw = Object.fromEntries(fields.map((f) => [f, String(formData.get(f) ?? "")]));
  const values = Object.fromEntries(fields.filter((f) => f !== "password").map((f) => [f, raw[f]!.slice(0, 200)]));
  return { raw, values };
}

export async function createEmployee(_prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const { raw, values } = readFields(formData, createEmployeeFields);
  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid", fields: invalidFields(parsed.error), values };
  const d = parsed.data;

  // Authorize and spend the creation allowance before calling Auth (no unlimited ID probing).
  const supabase = await createClient();
  const { error: beginError } = await supabase.rpc("employee_create_begin", { p_role: d.role });
  if (beginError) return { error: toActionError(beginError, "createEmployee"), values };

  const service = createAdminClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: authEmailFor(d.nationalId),
    password: d.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    // Same message whichever company holds the ID: never reveal it (CLAUDE.md §4).
    if (createError?.code === "email_exists") return { error: "nationalIdTaken", fields: { nationalId: true }, values };
    if (createError?.code === "weak_password") return { error: "invalid", fields: { password: true }, values };
    console.error("createEmployee: auth user", createError?.code);
    return { error: "unexpected", values };
  }

  const { data: employeeId, error } = await supabase.rpc("employee_create", {
    p_user_id: created.user.id,
    p_national_id: d.nationalId,
    p_full_name_ar: d.fullNameAr,
    p_full_name_en: d.fullNameEn ?? "",
    p_phone: d.phone ?? "",
    p_job_title: d.jobTitle ?? "",
    p_role: d.role,
    p_department_id: noUuid(d.departmentId),
    p_manager_id: noUuid(d.managerId),
    p_locale: d.locale,
  });
  if (error || !employeeId) {
    await service.auth.admin.deleteUser(created.user.id);
    const code = toActionError(error, "createEmployee");
    return { error: code, fields: code === "nationalIdTaken" ? { nationalId: true } : undefined, values };
  }

  redirect({ href: `/employees/${employeeId}`, locale });
}

export async function updateEmployee(employeeId: string, _prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const id = idSchema.safeParse(employeeId);
  const { raw, values } = readFields(formData, updateEmployeeFields);
  if (!id.success) return { error: "notFound", values };
  const parsed = updateEmployeeSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid", fields: invalidFields(parsed.error), values };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("employee_update", {
    p_employee_id: id.data,
    p_full_name_ar: d.fullNameAr,
    p_full_name_en: d.fullNameEn ?? "",
    p_phone: d.phone ?? "",
    p_job_title: d.jobTitle ?? "",
    p_role: d.role,
    p_department_id: noUuid(d.departmentId),
    p_manager_id: noUuid(d.managerId),
  });
  if (error) return { error: toActionError(error, "updateEmployee"), values };

  refresh();
  return { saved: true };
}

export type EmployeeActionState = { ok: true } | { ok: false; error: "invalid" | ActionError } | undefined;

export async function setEmployeeStatus(
  employeeId: string,
  status: "active" | "disabled",
  _prev: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const id = idSchema.safeParse(employeeId);
  const next = z.enum(["active", "disabled"]).safeParse(status);
  if (!id.success || !next.success) return { ok: false, error: "notFound" };

  // Database first: it authorizes, flips the status (RLS cuts access at once) and ends sessions.
  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("employee_set_status", {
    p_employee_id: id.data,
    p_status: next.data,
  });
  if (error || !userId) return { ok: false, error: toActionError(error, "setEmployeeStatus") };

  const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: next.data === "disabled" ? BAN_FOREVER : "none",
  });
  // A failed ban isn't a hole (RLS already blocks a disabled employee) but the login would still
  // succeed and then be refused; report it so the action can be retried.
  if (banError) {
    console.error("setEmployeeStatus: ban", banError.code);
    return { ok: false, error: "unexpected" };
  }

  refresh();
  return { ok: true };
}

export async function resetEmployeePassword(
  employeeId: string,
  _prev: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const id = idSchema.safeParse(employeeId);
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!id.success) return { ok: false, error: "notFound" };
  if (!password.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("employee_password_reset_begin", { p_employee_id: id.data });
  if (error || !userId) return { ok: false, error: toActionError(error, "resetEmployeePassword") };

  const { error: updateError } = await createAdminClient().auth.admin.updateUserById(userId, { password: password.data });
  if (updateError) {
    console.error("resetEmployeePassword: update", updateError.code);
    return { ok: false, error: updateError.code === "weak_password" ? "invalid" : "unexpected" };
  }
  return { ok: true };
}

export async function deleteEmployee(
  employeeId: string,
  _prev: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const parsedId = idSchema.safeParse(employeeId);
  if (!parsedId.success) return { ok: false, error: "notFound" };
  const id = parsedId.data;

  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("employee_delete_begin", { p_employee_id: id });
  if (error) return { ok: false, error: toActionError(error, "deleteEmployee") };

  // Remove the Auth account first so the national ID is free in Auth too. If this fails nothing
  // has been marked yet and the whole action can simply be retried.
  if (userId) {
    const { error: authError } = await createAdminClient().auth.admin.deleteUser(userId);
    if (authError) {
      console.error("deleteEmployee: auth", authError.code);
      return { ok: false, error: "unexpected" };
    }
  }

  const { error: finishError } = await supabase.rpc("employee_delete_finish", { p_employee_id: id });
  if (finishError) return { ok: false, error: toActionError(finishError, "deleteEmployee") };

  redirect({ href: "/employees", locale });
}
