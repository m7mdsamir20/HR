import { z } from "zod";

export const advanceRequestSchema = z.object({
  amount: z.coerce.number().min(100, "min_amount").max(100000, "max_amount"),
  installmentsCount: z.coerce.number().int().min(1, "min_installments").max(24, "max_installments"),
  reason: z.string().trim().min(3, "reason_short").max(500, "reason_long"),
});

export const advanceDecisionSchema = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(500, "note_long").optional().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.decision === "rejected") {
        return Boolean(data.note && data.note.length >= 3);
      }
      return true;
    },
    { message: "note_required", path: ["note"] }
  );

export const advanceCancelSchema = z.object({
  id: z.string().uuid(),
});

export const advanceRepaymentSchema = z.object({
  advanceId: z.string().uuid(),
  amount: z.coerce.number().positive("amount_positive"),
  note: z.string().trim().max(300, "note_long").optional().or(z.literal("")),
});

export type AdvanceRequestInput = z.infer<typeof advanceRequestSchema>;
export type AdvanceDecisionInput = z.infer<typeof advanceDecisionSchema>;
export type AdvanceCancelInput = z.infer<typeof advanceCancelSchema>;
export type AdvanceRepaymentInput = z.infer<typeof advanceRepaymentSchema>;

