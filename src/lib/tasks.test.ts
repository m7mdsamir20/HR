import { describe, expect, it } from "vitest";
import { dueGroup, isOverdue } from "./tasks";

const today = "2026-11-03";

describe("isOverdue", () => {
  it("counts only open work past its due date", () => {
    expect(isOverdue("in_progress", "2026-11-02", today)).toBe(true);
    expect(isOverdue("assigned", "2026-11-03", today)).toBe(false);
    expect(isOverdue("submitted", "2026-11-01", today)).toBe(false);
    expect(isOverdue("approved", "2026-11-01", today)).toBe(false);
  });
});

describe("dueGroup", () => {
  it("groups by day, with finished work last", () => {
    expect(dueGroup("assigned", "2026-11-01", today)).toBe("overdue");
    expect(dueGroup("in_progress", "2026-11-03", today)).toBe("today");
    expect(dueGroup("assigned", "2026-11-04", today)).toBe("tomorrow");
    expect(dueGroup("changes_requested", "2026-11-20", today)).toBe("later");
    expect(dueGroup("approved", "2026-11-01", today)).toBe("done");
  });
});
