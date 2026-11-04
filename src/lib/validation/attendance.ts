import { z } from "zod";
import { normalizeAmount } from "@/lib/money";

const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
// Arabic-Indic digits and separators are accepted; empty stays "missing" instead of becoming 0.
const num = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" ? normalizeAmount(v) || undefined : v), z.coerce.number().min(min).max(max));
const whole = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" ? normalizeAmount(v) || undefined : v), z.coerce.number().int().min(min).max(max));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const branchSchema = z.object({
  nameAr: z.string().trim().min(2).max(80),
  nameEn: optional(z.string().min(2).max(80)),
  latitude: num(-90, 90),
  longitude: num(-180, 180),
  radius: whole(20, 5000),
});

export const shiftSchema = z
  .object({
    nameAr: z.string().trim().min(2).max(80),
    nameEn: optional(z.string().min(2).max(80)),
    startTime: time,
    endTime: time,
    graceMinutes: whole(0, 120),
    ramadanHours: num(1, 12).refine((h) => Math.round(h * 10) === h * 10),
    workDays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
  })
  .refine((s) => s.endTime > s.startTime, { path: ["endTime"] });

export const calendarSchema = z
  .object({
    kind: z.enum(["holiday", "ramadan"]),
    nameAr: z.string().trim().min(2).max(80),
    nameEn: optional(z.string().min(2).max(80)),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .refine((c) => c.endDate >= c.startDate && Date.parse(c.endDate) - Date.parse(c.startDate) <= 45 * 86_400_000, { path: ["endDate"] });

// Fractions are typed as a percentage of one day's pay.
export const rulesSchema = z
  .object({
    tier1Minutes: whole(1, 240),
    tier2Minutes: whole(1, 240),
    tier3Minutes: whole(1, 480),
    tier1Percent: num(0, 100),
    tier2Percent: num(0, 100),
    tier3Percent: num(0, 100),
    tier4Percent: num(0, 100),
    earlyGraceMinutes: whole(0, 120),
    absencePercent: num(0, 300),
  })
  .refine((r) => r.tier1Minutes < r.tier2Minutes && r.tier2Minutes < r.tier3Minutes, { path: ["tier2Minutes"] });

export const assignSchema = z.object({
  employeeIds: z.array(z.uuid()).min(1).max(500),
  branchId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
  shiftId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
});

export const correctionSchema = z
  .object({
    employeeId: z.uuid(),
    date: z.iso.date(),
    absent: z.boolean(),
    checkIn: optional(time),
    checkOut: optional(time),
    note: z.string().trim().min(3).max(500),
  })
  .refine((c) => c.absent || c.checkIn !== undefined, { path: ["checkIn"] })
  .refine((c) => c.checkOut === undefined || (c.checkIn !== undefined && c.checkOut > c.checkIn), { path: ["checkOut"] });

export const decisionSchema = z
  .object({
    id: z.uuid(),
    decision: z.enum(["approve", "waive"]),
    note: optional(z.string().min(3).max(500)),
  })
  .refine((d) => d.decision === "approve" || d.note !== undefined, { path: ["note"] });

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracy: z.number().min(0).max(100_000).nullable(),
});
export type Location = z.infer<typeof locationSchema>;

/** YYYY-MM, defaulting to the current month in Riyadh. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
