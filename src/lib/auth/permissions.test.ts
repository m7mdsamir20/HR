import { describe, expect, it } from "vitest";
import { assignableRoles, canManageEmployee, managesPeople } from "./permissions";

const owner = { role: "owner" as const, employee_id: "o" };
const admin = { role: "admin" as const, employee_id: "a" };
const hr = { role: "hr" as const, employee_id: "h" };
const manager = { role: "manager" as const, employee_id: "m" };

describe("assignableRoles", () => {
  it("lets HR give only manager and employee roles", () => {
    expect(assignableRoles("hr")).toEqual(["manager", "employee"]);
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).toContain("admin");
    expect(assignableRoles("manager")).toEqual([]);
  });
});

describe("canManageEmployee", () => {
  const emp = { id: "e", role: "employee" as const, status: "active" as const };
  it("follows the role reach", () => {
    expect(canManageEmployee(hr, emp)).toBe(true);
    expect(canManageEmployee(hr, { id: "x", role: "owner", status: "active" })).toBe(false);
    expect(canManageEmployee(hr, { id: "y", role: "hr", status: "active" })).toBe(false);
    expect(canManageEmployee(admin, emp)).toBe(true);
    expect(canManageEmployee(manager, emp)).toBe(false);
  });

  it("never covers yourself or deleted accounts", () => {
    expect(canManageEmployee(owner, { id: "o", role: "owner", status: "active" })).toBe(false);
    expect(canManageEmployee(owner, { ...emp, status: "deleted" })).toBe(false);
  });

  it("knows who manages people", () => {
    expect(managesPeople("owner") && managesPeople("admin") && managesPeople("hr")).toBe(true);
    expect(managesPeople("manager") || managesPeople("employee")).toBe(false);
  });
});
