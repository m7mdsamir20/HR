import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron";

const secret = "x".repeat(40);

describe("isAuthorizedCron", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("refuses wrong, missing or malformed credentials", () => {
    expect(isAuthorizedCron(`Bearer ${"y".repeat(40)}`, secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
  });

  it("refuses everything when the secret is unset or too short", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });
});
