// Shared by server and client code (account.ts is server-only).
export const ROLES = ["owner", "admin", "hr", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];
