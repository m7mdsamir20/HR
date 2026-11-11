import { describe, expect, it } from "vitest";
import { daysBetween, formatDate, formatDateTime, formatTime, formatTimeString, todayInRiyadh } from "./format";

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

describe("formatDateTime", () => {
  it("shows the month name and Riyadh time in 12-hour format", () => {
    expect(formatDateTime("en", "2026-11-02T12:44:00Z")).toContain("03:44 pm");
    expect(formatDateTime("ar", "2026-11-02T12:44:00Z")).toContain("3:44 م");
  });
});

describe("formatTime", () => {
  it("formats timestamps in 12-hour format", () => {
    expect(formatTime("ar", "2026-11-02T05:00:00Z")).toBe("8:00 ص");
    expect(formatTime("ar", "2026-11-02T14:00:00Z")).toBe("5:00 م");
    expect(formatTime("en", "2026-11-02T14:00:00Z")).toBe("5:00 pm");
  });
});

describe("formatTimeString", () => {
  it("formats time-only strings in 12-hour format", () => {
    expect(formatTimeString("ar", "08:00:00")).toBe("8:00 ص");
    expect(formatTimeString("ar", "17:00:00")).toBe("5:00 م");
    expect(formatTimeString("en", "17:00:00")).toBe("5:00 pm");
  });
});
