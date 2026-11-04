import { z } from "zod";

export const payrollRunCreateSchema = z.object({
  year: z.coerce.number().int().min(2020, "invalid_year").max(2100, "invalid_year"),
  month: z.coerce.number().int().min(1, "invalid_month").max(12, "invalid_month"),
  notes: z.string().trim().max(500, "notes_long").optional().or(z.literal("")),
});

export const payrollSlipAdjustSchema = z.object({
  slipId: z.string().uuid(),
  otherAllowances: z.coerce.number().min(0, "invalid_amount"),
  otherDeductions: z.coerce.number().min(0, "invalid_amount"),
  notes: z.string().trim().max(300, "notes_long").optional().or(z.literal("")),
});

export const payrollRunApproveSchema = z.object({
  runId: z.string().uuid(),
});

export const payrollRunDeleteSchema = z.object({
  runId: z.string().uuid(),
});

export type PayrollRunCreateInput = z.infer<typeof payrollRunCreateSchema>;
export type PayrollSlipAdjustInput = z.infer<typeof payrollSlipAdjustSchema>;
