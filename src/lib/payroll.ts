import type { Tone } from "@/components/status-pill";
import { toActionError, type ActionError } from "@/lib/errors";

export const PAYROLL_STATUSES = ["draft", "approved", "paid", "cancelled"] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const payrollTone: Record<PayrollStatus, Tone> = {
  draft: "saffron",
  approved: "stamp",
  paid: "indigo",
  cancelled: "neutral",
};

export type PayrollError =
  | "invalid"
  | "forbidden"
  | "invalidPeriod"
  | "runAlreadyExists"
  | "runLocked"
  | "ownerOnly"
  | "notDraft"
  | "cannotDeleteLockedRun"
  | ActionError;

export function payrollError(error: { code?: string; message?: string } | null, context: string): PayrollError {
  switch (error?.message) {
    case "invalid_period":
      return "invalidPeriod";
    case "run_already_exists":
      return "runAlreadyExists";
    case "run_locked":
      return "runLocked";
    case "owner_only":
      return "ownerOnly";
    case "not_draft":
      return "notDraft";
    case "cannot_delete_locked_run":
      return "cannotDeleteLockedRun";
    default:
      return toActionError(error, context);
  }
}

export interface WpsEmployeeRecord {
  nationalId: string;
  name: string;
  bankName?: string | null;
  iban?: string | null;
  basicSalary: number;
  housingAllowance: number;
  otherEarnings: number;
  deductions: number;
  netSalary: number;
}

export interface WpsHeaderRecord {
  employerId: string; // CR or Establishment Number
  bankRoutingCode: string; // e.g. ALBI, RJHI, NCBK
  fileCreationDate: string; // YYYY-MM-DD
  paymentDate: string; // YYYY-MM-DD
  recordsCount: number;
  totalSalaries: number;
}

/**
 * Generates Saudi Wage Protection System (WPS) Standard Salary Information File (SIF).
 * CSV compliant with Saudi Central Bank (SAMA) and Mudad requirements.
 */
export function generateWpsSif(header: WpsHeaderRecord, employees: WpsEmployeeRecord[]): string {
  const lines: string[] = [];

  // Header Record (ECR / SCR format)
  // Format: ECR,EstablishmentID,BankRoutingCode,FileCreationDate,PaymentDate,TotalCount,TotalAmount,SAR
  const creationDate = header.fileCreationDate.replace(/-/g, "");
  const payDate = header.paymentDate.replace(/-/g, "");
  lines.push(
    [
      "SCR",
      header.employerId,
      header.bankRoutingCode || "SAMA",
      creationDate,
      payDate,
      header.recordsCount,
      header.totalSalaries.toFixed(2),
      "SAR",
    ].join(",")
  );

  // Employee Records (EDR format)
  // Format: EDR,NationalID,Name,IBAN,BankCode,Basic,Housing,Other,Deductions,Net,PaymentType
  for (const emp of employees) {
    const cleanIban = emp.iban ? emp.iban.trim().toUpperCase() : "";
    const cleanName = emp.name.replace(/,/g, " ");
    lines.push(
      [
        "EDR",
        emp.nationalId,
        cleanName,
        cleanIban,
        cleanIban.slice(4, 6) || "BANK",
        emp.basicSalary.toFixed(2),
        emp.housingAllowance.toFixed(2),
        emp.otherEarnings.toFixed(2),
        emp.deductions.toFixed(2),
        emp.netSalary.toFixed(2),
        "SALARY",
      ].join(",")
    );
  }

  return lines.join("\r\n") + "\r\n";
}

