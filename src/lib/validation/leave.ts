import { z } from "zod";
import { normalizeAmount } from "@/lib/money";
import { LEAVE_TYPES } from "@/lib/leave";

const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

export const leaveRequestSchema = z
  .object({
    type: z.enum(LEAVE_TYPES),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    reason: optional(z.string().min(3).max(500)),
    medicalRef: optional(z.string().regex(/^[A-Za-z0-9-]{4,40}$/)),
  })
  .refine((l) => l.endDate >= l.startDate, { path: ["endDate"] });

export const leaveDecisionSchema = z
  .object({
    id: z.uuid(),
    decision: z.enum(["approve", "reject"]),
    note: optional(z.string().min(3).max(500)),
  })
  .refine((d) => d.decision === "approve" || d.note !== undefined, { path: ["note"] });

export const leaveCancelSchema = z.object({ id: z.uuid(), note: optional(z.string().min(3).max(500)) });

export const adjustmentSchema = z.object({
  employeeId: z.uuid(),
  days: z.preprocess(
    (v) => (typeof v === "string" ? normalizeAmount(v) || undefined : v),
    z.coerce.number().min(-365).max(365).refine((n) => n !== 0 && Math.round(n * 2) === n * 2),
  ),
  reason: z.string().trim().min(3).max(300),
});
