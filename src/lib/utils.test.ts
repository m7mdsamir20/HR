import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a type-scale size next to a text color", () => {
    expect(cn("text-label", "text-ink")).toBe("text-label text-ink");
    expect(cn("text-card", "text-brick")).toBe("text-card text-brick");
  });

  it("still resolves conflicts inside the same group", () => {
    expect(cn("text-label", "text-page")).toBe("text-page");
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
