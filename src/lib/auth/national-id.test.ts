import { describe, expect, it } from "vitest";
import { authEmailFor, idTypeOf, isValidNationalId, normalizeNationalId } from "./national-id";

describe("normalizeNationalId", () => {
  it("converts Arabic-Indic digits", () => {
    expect(normalizeNationalId("١٠٢٣٤٥٦٧٨٩")).toBe("1023456789");
  });

  it("converts Persian digits", () => {
    expect(normalizeNationalId("۲۰۱۲۳۴۵۶۷۸")).toBe("2012345678");
  });

  it("drops spaces, dashes and bidi marks", () => {
    expect(normalizeNationalId(" 10 23-45‎6789 ")).toBe("1023456789");
  });

  it("keeps other characters so validation rejects them", () => {
    expect(normalizeNationalId("10234a6789")).toBe("10234a6789");
  });
});

describe("isValidNationalId", () => {
  it.each(["1023456789", "2012345678", "7036509532"])("accepts %s", (id) => {
    expect(isValidNationalId(id)).toBe(true);
  });

  it.each(["3023456789", "102345678", "10234567890", "10234a6789", "", "1023456789\n"])(
    "rejects %j",
    (id) => {
      expect(isValidNationalId(id)).toBe(false);
    },
  );
});

describe("idTypeOf", () => {
  it("maps the first digit", () => {
    expect(idTypeOf("1023456789")).toBe("citizen");
    expect(idTypeOf("2012345678")).toBe("resident");
  });
});

describe("authEmailFor", () => {
  it("builds the internal .invalid address", () => {
    expect(authEmailFor("1023456789")).toBe("1023456789@users.invalid");
  });

  it("refuses anything that is not a valid ID", () => {
    expect(() => authEmailFor("x@evil.com")).toThrow();
  });
});
