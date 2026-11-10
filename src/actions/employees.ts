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
  toRpcPayload,
  updateEmployeeFields,
  updateEmployeeSchema,
  type EmployeeField,
} from "@/lib/validation/employee";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const idSchema = z.uuid();
const PEOPLE_ROLES = ["owner", "admin", "hr"] as const;
// Banned until deleted or re-enabled; Supabase takes a duration, so this is effectively forever.
const BAN_FOREVER = "876000h";

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
  const values = Object.fromEntries(fields.map((f) => [f, raw[f]!.slice(0, 200)]));
  return { raw, values };
}

export async function createEmployee(_prev: EmployeeFormState, formData: FormData): Promise<EmployeeFormState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const { raw, values } = readFields(formData, createEmployeeFields);
  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) return { error: "invalid", fields: invalidFields(parsed.error), values };
  const d = parsed.data;

  // Authorize and spend creation allowance
  const supabase = await createClient();
  const { error: beginError } = await supabase.rpc("employee_create_begin", { p_role: "employee" });
  if (beginError) return { error: toActionError(beginError, "createEmployee"), values };

  // Set nationality to SA if citizen
  const effectiveNationality = d.idType === "citizen" ? "SA" : d.nationality || "";
  const { file, pay } = toRpcPayload({ ...d, nationality: effectiveNationality });

  // Call employee_create with null user_id (user account is separate in Settings > Users)
  const { data: employeeId, error } = await supabase.rpc("employee_create", {
    p_user_id: null as unknown as string,
    p_national_id: d.nationalId,
    p_role: "employee",
    p_file: file,
    p_pay: pay,
  });

  if (error || !employeeId) {
    const code = toActionError(error, "createEmployee");
    return { error: code, fields: code === "nationalIdTaken" ? { nationalId: true } : undefined, values };
  }

  redirect({ href: `/employees/${employeeId}`, locale });
}

export type UserAccountState =
  | { ok: true }
  | { ok: false; error: "invalid" | "nationalIdTaken" | "weak_password" | ActionError; fields?: Record<string, boolean> }
  | undefined;

export async function createUserAccount(
  _prev: UserAccountState,
  formData: FormData
): Promise<UserAccountState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, ["owner", "admin", "hr"]);

  const employeeId = String(formData.get("employeeId") ?? "");
  const role = String(formData.get("role") ?? "");
  const userLocale = String(formData.get("locale") ?? "ar");
  const password = String(formData.get("password") ?? "");

  const idParsed = z.uuid().safeParse(employeeId);
  const roleParsed = z.enum(["admin", "hr", "manager", "employee"]).safeParse(role);
  const localeParsed = z.enum(["ar", "en"]).safeParse(userLocale);
  const passParsed = passwordSchema.safeParse(password);

  if (!idParsed.success || !roleParsed.success || !localeParsed.success || !passParsed.success) {
    return {
      ok: false,
      error: "invalid",
      fields: {
        employeeId: !idParsed.success,
        role: !roleParsed.success,
        locale: !localeParsed.success,
        password: !passParsed.success,
      },
    };
  }

  const supabase = await createClient();
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, national_id, user_id")
    .eq("id", idParsed.data)
    .single();

  if (empErr || !emp) return { ok: false, error: "notFound" };

  const service = createAdminClient();
  const email = authEmailFor(emp.national_id);

  let userId: string;
  let createdNew = false;

  if (emp.user_id) {
    userId = emp.user_id;
    await service.auth.admin.updateUserById(userId, { password });
  } else {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created?.user) {
      userId = created.user.id;
      createdNew = true;
    } else if (createError?.code === "email_exists") {
      const { data: usersData } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const matched = usersData?.users.find((u) => u.email === email);
      if (!matched) return { ok: false, error: "unexpected" };
      userId = matched.id;
    } else {
      return { ok: false, error: "invalid", fields: { password: true } };
    }
  }

  const { error: assignError } = await supabase.rpc("employee_assign_user", {
    p_employee_id: emp.id,
    p_user_id: userId,
    p_role: roleParsed.data,
    p_locale: localeParsed.data,
  });

  if (assignError) {
    if (createdNew) {
      await service.auth.admin.deleteUser(userId);
    }
    return { ok: false, error: toActionError(assignError, "employee_assign_user") };
  }

  refresh();
  return { ok: true };
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
  const { file, pay } = toRpcPayload(d);
  const { error } = await supabase.rpc("employee_update", {
    p_employee_id: id.data,
    p_role: (d.role || "employee") as "owner" | "hr" | "manager" | "employee",
    p_file: file,
    p_pay: pay,
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
  if (error) return { ok: false, error: toActionError(error, "setEmployeeStatus") };

  if (userId) {
    const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: next.data === "disabled" ? BAN_FOREVER : "none",
    });
    if (banError) {
      console.error("setEmployeeStatus: ban", banError.code);
      return { ok: false, error: "unexpected" };
    }
  }

  refresh();
  return { ok: true };
}

export async function terminateEmployee(
  employeeId: string,
  _prev: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const id = idSchema.safeParse(employeeId);
  const rawType = formData.get("terminationType");
  const type = z.enum(["resignation", "contract_end", "termination", "absence", "other"]).safeParse(rawType);
  const dateStr = String(formData.get("terminationDate") ?? "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date().toISOString().slice(0, 10);
  const reason = String(formData.get("terminationReason") ?? "").slice(0, 500);

  if (!id.success || !type.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("employee_terminate", {
    p_employee_id: id.data,
    p_type: type.data,
    p_date: date,
    p_reason: reason,
  });
  if (error) return { ok: false, error: toActionError(error, "terminateEmployee") };

  if (userId) {
    await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: BAN_FOREVER,
    });
  }

  refresh();
  return { ok: true };
}

export async function reactivateEmployee(
  employeeId: string,
  _prev: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const locale = localeSchema.parse(formData.get("uiLocale"));
  await requireMember(locale, PEOPLE_ROLES);
  const id = idSchema.safeParse(employeeId);
  if (!id.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("employee_reactivate", {
    p_employee_id: id.data,
  });
  if (error) return { ok: false, error: toActionError(error, "reactivateEmployee") };

  if (userId) {
    await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
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
