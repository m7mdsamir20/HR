import { describe, expect, it } from "vitest";
import { isPdfPath, PDF_CSP } from "./csp";

const id = "47431093-68ad-4021-a259-6deb78249487";

describe("isPdfPath", () => {
  it("matches only the PDF routes", () => {
    expect(isPdfPath(`/leave/${id}/pdf`)).toBe(true);
    expect(isPdfPath(`/leave/${id}`)).toBe(false);
    expect(isPdfPath("/attendance/sheet/pdf")).toBe(true);
    expect(isPdfPath("/en/attendance/sheet/pdf")).toBe(true);
    expect(isPdfPath("/attendance/sheet/pdf/extra")).toBe(false);
    expect(isPdfPath("/attendance/sheet")).toBe(false);
    expect(isPdfPath(`/tasks/${id}/pdf`)).toBe(true);
    expect(isPdfPath(`/en/employees/${id}/pdf`)).toBe(true);
    expect(isPdfPath(`/payroll/slips/${id}/pdf`)).toBe(true);
    expect(isPdfPath(`/en/payroll/slips/${id}/pdf`)).toBe(true);
    expect(isPdfPath(`/tasks/${id}`)).toBe(false);
    expect(isPdfPath(`/tasks/${id}/pdf/extra`)).toBe(false);
    expect(isPdfPath(`/admin/companies/${id}/pdf`)).toBe(false);
    expect(isPdfPath("/tasks/not-an-id/pdf")).toBe(false);
  });
});

describe("PDF_CSP", () => {
  it("keeps framing and forms closed and leaves object-src to the viewer", () => {
    expect(PDF_CSP).toContain("frame-ancestors 'none'");
    expect(PDF_CSP).not.toContain("default-src");
    expect(PDF_CSP).not.toContain("object-src");
  });
});
