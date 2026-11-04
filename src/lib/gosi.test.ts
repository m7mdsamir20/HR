import { describe, expect, it } from "vitest";
import { calculateGosi, GOSI_RATES } from "./gosi";

describe("GOSI calculation", () => {
  it("computes Saudi citizen contributions accurately", () => {
    // Basic 10,000 + Housing 2,500 = 12,500
    const result = calculateGosi("citizen", 10000, 2500);
    expect(result.contributoryWage).toBe(12500);
    // 9.75% of 12,500 = 1,218.75
    expect(result.employeeShare).toBe(1218.75);
    // 11.75% of 12,500 = 1,468.75
    expect(result.employerShare).toBe(1468.75);
    expect(result.annuitiesEmployee).toBe(1125);
    expect(result.sanedEmployee).toBe(93.75);
  });

  it("computes non-Saudi resident contributions (0% employee, 2% employer hazards)", () => {
    const result = calculateGosi("resident", 6000, 1500);
    expect(result.contributoryWage).toBe(7500);
    expect(result.employeeShare).toBe(0);
    expect(result.employerShare).toBe(150); // 2% of 7500
    expect(result.hazardsEmployer).toBe(150);
  });

  it("strictly caps contributory wage at 45,000 SAR", () => {
    // Basic 40,000 + Housing 15,000 = 55,000 -> capped at 45,000
    const result = calculateGosi("citizen", 40000, 15000);
    expect(result.contributoryWage).toBe(45000);
    expect(result.employeeShare).toBe(Number((45000 * GOSI_RATES.SAUDI_EMPLOYEE_TOTAL).toFixed(2)));
    expect(result.employerShare).toBe(Number((45000 * GOSI_RATES.SAUDI_EMPLOYER_TOTAL).toFixed(2)));
  });

  it("handles 0 or negative salary gracefully", () => {
    const result = calculateGosi("citizen", 0, 0);
    expect(result.contributoryWage).toBe(0);
    expect(result.employeeShare).toBe(0);
    expect(result.employerShare).toBe(0);
  });
});

