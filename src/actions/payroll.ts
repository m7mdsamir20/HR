"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { payrollError, type PayrollError } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";
import {
  payrollRunApproveSchema,
  payrollRunCreateSchema,
  payrollRunDeleteSchema,
  payrollSlipAdjustSchema,
} from "@/lib/validation/payroll";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const fieldsOf = (error: z.ZodError) => [...new Set(error.issues.map((i) => String(i.path[0])))];

export type PayrollState = { ok: true; runId?: string } | { ok: false; error: PayrollError; fields?: string[] } | undefined;

export async function createPayrollRun(_prev: PayrollState, formData: FormData): Promise<PayrollState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "hr"]);
  const parsed = payrollRunCreateSchema.safeParse({
    year: formData.get("year"),
    month: formData.get("month"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { data: runId, error } = await supabase.rpc("payroll_run_create", {
    p_year: parsed.data.year,
    p_month: parsed.data.month,
    p_notes: (parsed.data.notes as string) || "",
  });

  if (error) return { ok: false, error: payrollError(error, "createPayrollRun") };
  refresh();
  return { ok: true, runId: runId ?? undefined };
}

export async function adjustPayrollSlip(_prev: PayrollState, formData: FormData): Promise<PayrollState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "hr"]);
  const parsed = payrollSlipAdjustSchema.safeParse({
    slipId: formData.get("slipId"),
    otherAllowances: formData.get("otherAllowances"),
    otherDeductions: formData.get("otherDeductions"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("payroll_slip_adjust", {
    p_slip_id: parsed.data.slipId,
    p_other_allowances: parsed.data.otherAllowances,
    p_other_deductions: parsed.data.otherDeductions,
    p_notes: (parsed.data.notes as string) || "",
  });

  if (error) return { ok: false, error: payrollError(error, "adjustPayrollSlip") };
  refresh();
  return { ok: true };
}

export async function approvePayrollRun(_prev: PayrollState, formData: FormData): Promise<PayrollState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner"]);
  const parsed = payrollRunApproveSchema.safeParse({ runId: formData.get("runId") });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("payroll_run_approve", {
    p_run_id: parsed.data.runId,
  });

  if (error) return { ok: false, error: payrollError(error, "approvePayrollRun") };
  refresh();
  return { ok: true };
}

export async function deletePayrollRun(_prev: PayrollState, formData: FormData): Promise<PayrollState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "hr"]);
  const parsed = payrollRunDeleteSchema.safeParse({ runId: formData.get("runId") });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("payroll_run_delete", {
    p_run_id: parsed.data.runId,
  });

  if (error) return { ok: false, error: payrollError(error, "deletePayrollRun") };
  refresh();
  return { ok: true };
}
