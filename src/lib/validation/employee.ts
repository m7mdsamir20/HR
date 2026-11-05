import { z } from "zod";
import { isValidNationalId, normalizeNationalId } from "@/lib/auth/national-id";
import { ROLES } from "@/lib/auth/roles";
import { isValidSaudiIban, normalizeAmount, normalizeIban } from "@/lib/money";

const blankToUndefined = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : v);
const digitsOnly = (v: unknown) => (typeof v === "string" ? normalizeNationalId(v) || undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const optionalDate = optional(z.iso.date());
const money = z.preprocess(
  (v) => (typeof v === "string" ? normalizeAmount(v) || "0" : v),
  z.coerce.number().min(0).max(9_999_999).multipleOf(0.01),
);

export const GENDERS = ["male", "female"] as const;
export const MARITAL_STATUSES = ["single", "married", "divorced", "widowed"] as const;
export const CONTRACT_TYPES = ["fixed", "unlimited"] as const;

const fileFields = {
  fullNameAr: z.string().trim().min(2).max(120),
  fullNameEn: optional(z.string().min(2).max(120)),
  nationality: optional(z.string().regex(/^[A-Z]{2}$/)),
  gender: optional(z.enum(GENDERS)),
  birthDate: optionalDate,
  maritalStatus: optional(z.enum(MARITAL_STATUSES)),
  phone: z.preprocess(digitsOnly, z.string().regex(/^05\d{8}$/).optional()),
  email: optional(z.email().max(200)),
  employeeNumber: optional(z.string().max(30)),
  jobTitle: optional(z.string().max(120)),
  occupation: optional(z.string().max(120)),
  role: optional(z.enum(ROLES)),
  departmentId: optional(z.uuid()),
  managerId: optional(z.uuid()),
  hireDate: optionalDate,
  contractType: optional(z.enum(CONTRACT_TYPES)),
  contractStart: optionalDate,
  contractEnd: optionalDate,
  probationDays: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(180).optional()),
  basicSalary: money,
  housingAllowance: money,
  transportAllowance: money,
  communicationAllowance: money,
  otherAllowances: money,
  bankName: optional(z.string().max(80)),
  iban: z.preprocess(
    (v) => (typeof v === "string" ? normalizeIban(v) || undefined : v),
    z.string().refine(isValidSaudiIban).optional(),
  ),
  gosiNumber: z.preprocess(digitsOnly, z.string().regex(/^\d{1,15}$/).optional()),
};

type FileShape = { birthDate?: string; contractType?: string; contractStart?: string; contractEnd?: string };

// Cross-field rules, reported on the field the user has to fix.
function checkFile(d: FileShape, ctx: z.RefinementCtx) {
  if (d.birthDate && d.birthDate > new Date().toISOString().slice(0, 10)) {
    ctx.addIssue({ code: "custom", path: ["birthDate"], message: "future" });
  }
  if (d.contractType === "fixed" && !d.contractEnd) {
    ctx.addIssue({ code: "custom", path: ["contractEnd"], message: "required" });
  }
  if (d.contractStart && d.contractEnd && d.contractEnd < d.contractStart) {
    ctx.addIssue({ code: "custom", path: ["contractEnd"], message: "beforeStart" });
  }
}

export const createEmployeeSchema = z
  .object({
    idType: z.enum(["citizen", "resident"]).default("citizen"),
    nationalId: z.string().transform(normalizeNationalId).refine(isValidNationalId),
    ...fileFields,
  })
  .superRefine((d, ctx) => {
    checkFile(d, ctx);
    if (d.idType === "citizen" && !d.nationalId.startsWith("1")) {
      ctx.addIssue({ code: "custom", path: ["nationalId"], message: "citizenIdStart" });
    }
    if (d.idType === "resident" && !d.nationalId.startsWith("2")) {
      ctx.addIssue({ code: "custom", path: ["nationalId"], message: "residentIdStart" });
    }
  });

export const updateEmployeeSchema = z.object(fileFields).superRefine(checkFile);

export type EmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeField = keyof z.infer<typeof createEmployeeSchema>;
export const updateEmployeeFields = Object.keys(fileFields) as EmployeeField[];
export const createEmployeeFields = ["idType", "nationalId", ...updateEmployeeFields] as EmployeeField[];

/** The jsonb the employee RPCs take: the file and the pay, in database column names. */
export function toRpcPayload(d: EmployeeInput, locale?: string) {
  const file = {
    full_name_ar: d.fullNameAr,
    full_name_en: d.fullNameEn ?? "",
    nationality: d.nationality ?? "",
    gender: d.gender ?? "",
    birth_date: d.birthDate ?? "",
    marital_status: d.maritalStatus ?? "",
    phone: d.phone ?? "",
    email: d.email ?? "",
    employee_number: d.employeeNumber ?? "",
    job_title: d.jobTitle ?? "",
    occupation: d.occupation ?? "",
    department_id: d.departmentId ?? "",
    manager_id: d.managerId ?? "",
    hire_date: d.hireDate ?? "",
    contract_type: d.contractType ?? "",
    contract_start: d.contractStart ?? "",
    contract_end: d.contractEnd ?? "",
    probation_days: d.probationDays?.toString() ?? "",
    ...(locale ? { locale } : {}),
  };
  const pay = {
    basic_salary: d.basicSalary.toFixed(2),
    housing_allowance: d.housingAllowance.toFixed(2),
    transport_allowance: d.transportAllowance.toFixed(2),
    communication_allowance: d.communicationAllowance.toFixed(2),
    other_allowances: d.otherAllowances.toFixed(2),
    bank_name: d.bankName ?? "",
    iban: d.iban ?? "",
    gosi_number: d.gosiNumber ?? "",
  };
  return { file, pay };
}
