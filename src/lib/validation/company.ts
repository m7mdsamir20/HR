import { z } from "zod";
import { isValidNationalId, normalizeNationalId } from "@/lib/auth/national-id";
import { todayInRiyadh } from "@/lib/format";

// Empty optional inputs arrive as "" from forms.
const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);
// Digits typed on an Arabic keyboard become 0-9; spaces and dashes go.
const digitsOnly = (v: unknown) => (typeof v === "string" ? normalizeNationalId(v) || undefined : v);

const nameAr = z.string().trim().min(2).max(120);
const nameEn = z.preprocess(blankToUndefined, z.string().min(2).max(120).optional());
const maxEmployees = z.coerce.number().int().min(1).max(100_000);

/** Supabase hashes passwords with bcrypt, which ignores bytes after the 72nd. */
export const passwordSchema = z
  .string()
  .min(8)
  .refine((p) => new TextEncoder().encode(p).length <= 72);

export const createCompanySchema = z.object({
  nameAr,
  nameEn,
  commercialReg: z.preprocess(digitsOnly, z.string().regex(/^\d{10}$/).optional()),
  maxEmployees,
  endsAt: z.iso.date().refine((d) => d >= todayInRiyadh()),
  ownerNationalId: z.string().transform(normalizeNationalId).refine(isValidNationalId),
  ownerNameAr: nameAr,
  ownerNameEn: nameEn,
  ownerPhone: z.preprocess(digitsOnly, z.string().regex(/^05\d{8}$/).optional()),
  password: z.preprocess(blankToUndefined, passwordSchema.optional()),
});

export type CreateCompanyField = keyof z.infer<typeof createCompanySchema>;
export const createCompanyFields = Object.keys(createCompanySchema.shape) as CreateCompanyField[];

// Past dates are allowed here: setting yesterday is how an admin ends a subscription early.
export const subscriptionSchema = z.object({
  maxEmployees,
  endsAt: z.iso.date(),
});

/** Which fields failed, for marking inputs; messages come from the translation files. */
export function invalidFields<T extends string>(error: z.ZodError): Partial<Record<T, true>> {
  const out: Partial<Record<T, true>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") out[key as T] = true;
  }
  return out;
}
