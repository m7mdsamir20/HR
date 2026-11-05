// UI-side mirror of the database rules (private.can_manage_role / can_manage_employee). These only
// decide what to show; the RPCs and RLS enforce the same rules again (CLAUDE.md §5.3).
import type { Role } from "./roles";

/** Roles an actor may give or edit: the owner or admin any, HR only managers and employees. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["owner", "admin", "hr", "manager", "employee"];
  if (actor === "admin") return ["admin", "hr", "manager", "employee"];
  if (actor === "hr") return ["manager", "employee"];
  return [];
}

/** Owner, Admin and HR manage people; managers only see their team. */
export function managesPeople(actor: Role): boolean {
  return actor === "owner" || actor === "admin" || actor === "hr";
}

export function canManageEmployee(
  actor: { role: Role; employee_id: string },
  target: { id: string; role: Role; status: "active" | "disabled" | "terminated" | "deleted" },
): boolean {
  return target.id !== actor.employee_id && target.status !== "deleted" && assignableRoles(actor.role).includes(target.role);
}
