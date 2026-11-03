import { describe, expect, it } from "vitest";
import { documentStatus, formatHijri } from "./documents";

describe("documentStatus", () => {
  it("warns 60 days ahead and flags expiry", () => {
    expect(documentStatus("2026-11-01", "2026-11-03")).toBe("expired");
    expect(documentStatus("2026-12-30", "2026-11-03")).toBe("expiring");
    expect(documentStatus("2027-06-01", "2026-11-03")).toBe("valid");
    expect(documentStatus(null, "2026-11-03")).toBe("noExpiry");
  });
});

describe("formatHijri", () => {
  it("shows the Umm al-Qura date with Latin digits", () => {
    const hijri = formatHijri("ar", "2026-11-03");
    expect(hijri).toMatch(/1448/);
    expect(hijri).not.toMatch(/[٠-٩]/);
  });
});
