// One place that turns database errors into codes the UI translates (CLAUDE.md §5.8).
// Never pass Postgres messages to the browser: only these codes.

export const ACTION_ERRORS = [
  "forbidden",
  "employeeLimit",
  "lastOwner",
  "invalidManager",
  "rateLimited",
  "nationalIdTaken",
  "notFound",
  "unexpected",
] as const;
export type ActionError = (typeof ACTION_ERRORS)[number];

const byMessage: Record<string, ActionError> = {
  forbidden: "forbidden",
  employee_limit_reached: "employeeLimit",
  last_owner: "lastOwner",
  invalid_manager: "invalidManager",
  rate_limited: "rateLimited",
  not_found: "notFound",
};

/** Maps a PostgREST/Postgres error to an action error code. Unknown errors are logged by code only. */
export function toActionError(error: { code?: string; message?: string } | null | undefined, context: string): ActionError {
  if (!error) return "unexpected";
  const known = error.message ? byMessage[error.message] : undefined;
  if (known) return known;
  if (error.code === "42501") return "forbidden";
  if (error.code === "23505") return "nationalIdTaken";
  if (error.code === "23503") return "invalidManager";
  console.error(`${context}: ${error.code ?? "unknown"}`);
  return "unexpected";
}
