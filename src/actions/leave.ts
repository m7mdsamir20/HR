"use server";

// Leave: requesting (everyone, for themself), deciding, cancelling, and balance adjustments (owner / HR).
// authenticate → authorize → zod → execute; the RPCs enforce the same rules (CLAUDE.md §5.7).
import { refresh } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/account";
import { leaveError, type LeaveError } from "@/lib/leave";
import { createClient } from "@/lib/supabase/server";
import { adjustmentSchema, leaveCancelSchema, leaveDecisionSchema, leaveRequestSchema } from "@/lib/validation/leave";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const fieldsOf = (error: z.ZodError) => [...new Set(error.issues.map((i) => String(i.path[0])))];

export type LeaveState = { ok: true } | { ok: false; error: LeaveError; fields?: string[] } | undefined;

export async function requestLeave(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const parsed = leaveRequestSchema.safeParse({
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason"),
    medicalRef: formData.get("medicalRef"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_request_create", {
    p: { type: d.type, start_date: d.startDate, end_date: d.endDate, reason: d.reason ?? "", medical_ref: d.medicalRef ?? "" },
  });
  if (error) return { ok: false, error: leaveError(error, "requestLeave") };
  refresh();
  return { ok: true };
}

export async function decideLeave(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr", "manager"]);
  const parsed = leaveDecisionSchema.safeParse({ id: formData.get("id"), decision: formData.get("decision"), note: formData.get("note") });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_request_decide", {
    p_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note as string,
  });
  if (error) return { ok: false, error: leaveError(error, "decideLeave"), fields: error.message === "note_required" ? ["note"] : undefined };
  refresh();
  return { ok: true };
}

export async function cancelLeave(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const parsed = leaveCancelSchema.safeParse({ id: formData.get("id"), note: formData.get("note") });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_request_cancel", { p_id: parsed.data.id, p_note: parsed.data.note as string });
  if (error) return { ok: false, error: leaveError(error, "cancelLeave"), fields: error.message === "note_required" ? ["note"] : undefined };
  refresh();
  return { ok: true };
}

export async function adjustBalance(_prev: LeaveState, formData: FormData): Promise<LeaveState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "admin", "hr"]);
  const parsed = adjustmentSchema.safeParse({ employeeId: formData.get("employeeId"), days: formData.get("days"), reason: formData.get("reason") });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_adjust", { p_employee: parsed.data.employeeId, p_days: parsed.data.days, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: leaveError(error, "adjustBalance") };
  refresh();
  return { ok: true };
}
