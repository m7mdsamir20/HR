import { describe, expect, it } from "vitest";
import { attendanceTone, saudizationTone, taskCompletionTone } from "./analytics";

describe("saudizationTone", () => {
  it("returns appropriate tones based on percentage thresholds", () => {
    expect(saudizationTone(null)).toBe("neutral");
    expect(saudizationTone(50)).toBe("stamp");
    expect(saudizationTone(25)).toBe("indigo");
    expect(saudizationTone(12)).toBe("saffron");
    expect(saudizationTone(5)).toBe("brick");
  });
});

describe("taskCompletionTone", () => {
  it("returns stamp for high completion and brick for very low", () => {
    expect(taskCompletionTone(95)).toBe("stamp");
    expect(taskCompletionTone(60)).toBe("indigo");
    expect(taskCompletionTone(30)).toBe("saffron");
    expect(taskCompletionTone(10)).toBe("brick");
  });
});

describe("attendanceTone", () => {
  it("returns stamp for >= 90% attendance", () => {
    expect(attendanceTone(95)).toBe("stamp");
    expect(attendanceTone(80)).toBe("indigo");
    expect(attendanceTone(65)).toBe("saffron");
    expect(attendanceTone(50)).toBe("brick");
  });
});
