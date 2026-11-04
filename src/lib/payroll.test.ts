import { describe, expect, it } from "vitest";
import { generateWpsSif, payrollError } from "./payroll";

describe("generateWpsSif", () => {
  it("formats header and employee rows per Saudi WPS SIF standard", () => {
    const header = {
      employerId: "7001234567",
      bankRoutingCode: "RJHI",
      fileCreationDate: "2026-11-04",
      paymentDate: "2026-11-27",
      recordsCount: 2,
      totalSalaries: 16500.0,
    };

    const employees = [
      {
        nationalId: "1012345678",
        name: "Ahmad Al-Harbi",
        iban: "SA0380000000608010167519",
        basicSalary: 10000,
        housingAllowance: 2500,
        otherEarnings: 500,
        deductions: 975,
        netSalary: 12025,
      },
      {
        nationalId: "2012345679",
        name: "Mohamed Tariq",
        iban: "SA4420000001234567890123",
        basicSalary: 4000,
        housingAllowance: 1000,
        otherEarnings: 0,
        deductions: 525,
        netSalary: 4475,
      },
    ];

    const sif = generateWpsSif(header, employees);
    const lines = sif.split("\r\n").filter(Boolean);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("SCR,7001234567,RJHI,20261104,20261127,2,16500.00,SAR");
    expect(lines[1]).toBe("EDR,1012345678,Ahmad Al-Harbi,SA0380000000608010167519,80,10000.00,2500.00,500.00,975.00,12025.00,SALARY");
    expect(lines[2]).toBe("EDR,2012345679,Mohamed Tariq,SA4420000001234567890123,20,4000.00,1000.00,0.00,525.00,4475.00,SALARY");
  });
});

describe("payrollError", () => {
  it("translates known postgres errors to friendly tokens", () => {
    expect(payrollError({ message: "invalid_period" }, "test")).toBe("invalidPeriod");
    expect(payrollError({ message: "run_already_exists" }, "test")).toBe("runAlreadyExists");
    expect(payrollError({ message: "run_locked" }, "test")).toBe("runLocked");
    expect(payrollError({ message: "owner_only" }, "test")).toBe("ownerOnly");
    expect(payrollError({ message: "not_draft" }, "test")).toBe("notDraft");
    expect(payrollError({ message: "cannot_delete_locked_run" }, "test")).toBe("cannotDeleteLockedRun");
  });
});
