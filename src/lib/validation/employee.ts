import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";
import { isValidNationalId, normalizeNationalId } from "@/lib/auth/national-id";
import { passwordSchema } from "./company";

const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);
const digitsOnly = (v: unknown) => (typeof v === "string" ? normalizeNationalId(v) || undefined : v);
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());

const profileFields = {
  fullNameAr: z.string().trim().min(2).max(120),
  fullNameEn: z.preprocess(blankToUndefined, z.string().min(2).max(120).optional()),
  phone: z.preprocess(digitsOnly, z.string().regex(/^05\d{8}$/).optional()),
  jobTitle: z.preprocess(blankToUndefined, z.string().max(120).optional()),
  role: z.enum(ROLES),
  departmentId: optionalUuid,
  managerId: optionalUuid,
};

export const createEmployeeSchema = z.object({
  nationalId: z.string().transform(normalizeNationalId).refine(isValidNationalId),
  ...profileFields,
  locale: z.enum(["ar", "en"]),
  password: passwordSchema,
});

export const updateEmployeeSchema = z.object(profileFields);

export type EmployeeField = keyof z.infer<typeof createEmployeeSchema>;
export const createEmployeeFields = Object.keys(createEmployeeSchema.shape) as EmployeeField[];
export const updateEmployeeFields = Object.keys(updateEmployeeSchema.shape) as EmployeeField[];
