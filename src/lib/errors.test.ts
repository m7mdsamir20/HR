import { describe, expect, it, vi } from "vitest";
import { toActionError } from "./errors";

describe("toActionError", () => {
  it("maps raised exceptions by message", () => {
    expect(toActionError({ code: "P0001", message: "last_owner" }, "t")).toBe("lastOwner");
    expect(toActionError({ code: "P0001", message: "employee_limit_reached" }, "t")).toBe("employeeLimit");
    expect(toActionError({ code: "P0001", message: "rate_limited" }, "t")).toBe("rateLimited");
  });

  it("maps Postgres codes", () => {
    expect(toActionError({ code: "42501", message: "permission denied for table x" }, "t")).toBe("forbidden");
    expect(toActionError({ code: "23505", message: "duplicate key" }, "t")).toBe("nationalIdTaken");
  });

  it("hides anything else behind 'unexpected' and logs only the code", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toActionError({ code: "XX000", message: "secret internals" }, "ctx")).toBe("unexpected");
    expect(spy).toHaveBeenCalledWith("ctx: XX000");
    spy.mockRestore();
  });
});
