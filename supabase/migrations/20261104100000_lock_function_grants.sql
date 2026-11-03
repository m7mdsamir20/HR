-- Found by the schema guard tests: functions in `private` were executable by everyone (PostgreSQL grants
-- EXECUTE to PUBLIC on every new function, and ALTER DEFAULT PRIVILEGES ... IN SCHEMA can only add to
-- that global default, not remove it). They were not reachable in practice (anon has no USAGE on the
-- schema, PostgREST doesn't expose it), but the grant shouldn't be there.

-- Existing functions: take the implicit public/anon execute away. Explicit grants to
-- authenticated / service_role (the helpers that policies call) stay.
revoke execute on all functions in schema private from public, anon;
revoke execute on all functions in schema public from public, anon;

-- Future functions created by migrations start closed; each one then grants what it needs, as the
-- RPCs already do. (A schema-level default can't do this; it has to be the global one.)
alter default privileges for role postgres revoke execute on functions from public, anon;

-- A CHECK constraint runs its function as whoever inserts. The service role (the dev seed, support
-- tooling) writes reports directly, so it needs this one; signed-in users only insert through RPCs.
grant execute on function private.all_https(text[]) to service_role;
