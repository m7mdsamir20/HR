import { describe, expect, it } from "vitest";
import { formatAmount, isValidSaudiIban, normalizeAmount, normalizeIban } from "./money";

describe("normalizeAmount", () => {
  it("accepts Arabic digits and separators", () => {
    expect(normalizeAmount("١٢٬٥٠٠٫٧٥")).toBe("12500.75");
    expect(normalizeAmount(" 12,500.75 ")).toBe("12500.75");
    expect(normalizeAmount("")).toBe("");
  });
});

describe("Saudi IBAN", () => {
  it("normalises spacing and case", () => {
    expect(normalizeIban("sa03 8000 0000 6080 1016 7519")).toBe("SA0380000000608010167519");
  });

  it("checks the format and the mod-97 check digits", () => {
    expect(isValidSaudiIban("SA0380000000608010167519")).toBe(true);
    expect(isValidSaudiIban("SA0480000000608010167519")).toBe(false);
    expect(isValidSaudiIban("SA038000000060801016751")).toBe(false);
    expect(isValidSaudiIban("AE070331234567890123456")).toBe(false);
  });
});

describe("formatAmount", () => {
  it("uses Latin digits with two decimals", () => {
    expect(formatAmount(6750)).toBe("6,750.00");
    expect(formatAmount("1250.5")).toBe("1,250.50");
    expect(formatAmount(null)).toBe("0.00");
  });
});
