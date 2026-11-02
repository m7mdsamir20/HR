import { describe, expect, it } from "vitest";
import { daysBetween, formatDate, todayInRiyadh } from "./format";

describe("formatDate", () => {
  it("uses Latin digits and the Gregorian calendar in Arabic", () => {
    expect(formatDate("ar", "2026-09-30")).toBe("30 سبتمبر 2026");
  });

  it("never shifts a date-only value by time zone", () => {
    expect(formatDate("en", "2026-01-01")).toBe("1 January 2026");
  });
});

describe("todayInRiyadh", () => {
  it("rolls over at midnight Riyadh time (UTC+3)", () => {
    expect(todayInRiyadh(new Date("2026-11-01T20:59:00Z"))).toBe("2026-11-01");
    expect(todayInRiyadh(new Date("2026-11-01T21:00:00Z"))).toBe("2026-11-02");
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-11-02", "2026-12-02")).toBe(30);
    expect(daysBetween("2026-11-02", "2026-11-01")).toBe(-1);
  });
});
