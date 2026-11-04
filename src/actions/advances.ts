"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { advancesError, type AdvanceError } from "@/lib/advances";
import { requireMember } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import {
  advanceCancelSchema,
  advanceDecisionSchema,
  advanceRepaymentSchema,
  advanceRequestSchema,
} from "@/lib/validation/advances";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const fieldsOf = (error: z.ZodError) => [...new Set(error.issues.map((i) => String(i.path[0])))];

export type AdvanceState = { ok: true } | { ok: false; error: AdvanceError; fields?: string[] } | undefined;

export async function requestAdvance(_prev: AdvanceState, formData: FormData): Promise<AdvanceState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const parsed = advanceRequestSchema.safeParse({
    amount: formData.get("amount"),
    installmentsCount: formData.get("installmentsCount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_request_create", {
    p_amount: parsed.data.amount,
    p_installments: parsed.data.installmentsCount,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: advancesError(error, "requestAdvance") };
  refresh();
  return { ok: true };
}

export async function decideAdvance(_prev: AdvanceState, formData: FormData): Promise<AdvanceState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "hr"]);
  const parsed = advanceDecisionSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_request_decide", {
    p_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_note: (parsed.data.note as string) || "",
  });
  if (error) {
    return {
      ok: false,
      error: advancesError(error, "decideAdvance"),
      fields: error.message === "note_required" ? ["note"] : undefined,
    };
  }
  refresh();
  return { ok: true };
}

export async function cancelAdvance(_prev: AdvanceState, formData: FormData): Promise<AdvanceState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")));
  const parsed = advanceCancelSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_request_cancel", {
    p_id: parsed.data.id,
  });
  if (error) return { ok: false, error: advancesError(error, "cancelAdvance") };
  refresh();
  return { ok: true };
}

export async function repayAdvance(_prev: AdvanceState, formData: FormData): Promise<AdvanceState> {
  await requireMember(localeSchema.parse(formData.get("uiLocale")), ["owner", "hr"]);
  const parsed = advanceRepaymentSchema.safeParse({
    advanceId: formData.get("advanceId"),
    amount: formData.get("amount"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: "invalid", fields: fieldsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_manual_repayment", {
    p_advance_id: parsed.data.advanceId,
    p_amount: parsed.data.amount,
    p_note: (parsed.data.note as string) || "",
  });
  if (error) return { ok: false, error: advancesError(error, "repayAdvance") };
  refresh();
  return { ok: true };
}

