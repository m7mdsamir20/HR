-- Guards over the whole schema, so a future migration can't quietly open something up (CLAUDE.md §5).
-- Each check lists the offenders when it fails.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

-- 1. Row level security is on for every table we own
select is_empty($$
  select format('%I.%I', n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'every table in public and private has row level security enabled');

-- 2. The anonymous role can touch nothing
select is_empty($$
  select format('%I.%I', n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'S')
    and has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
$$, 'anon has no privileges on any table, view or sequence');

select is_empty($$
  select p.oid::regprocedure::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
$$, 'anon can execute no function');

select is((select has_schema_privilege('anon', 'private', 'usage')), false, 'anon has no access to the private schema at all');

-- 3. Signed-in users write only where a policy allows it (companies: update by the system admin only)
select is_empty($$
  select format('%I.%I', n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
    and has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate')
    and format('%I.%I', n.nspname, c.relname) not in ('public.companies', 'public.departments', 'public.employee_documents')
$$, 'authenticated can write directly only to companies (update), departments and employee_documents');

select is_empty($$
  select format('%I.%I', n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relkind in ('r', 'p')
    and has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate')
$$, 'private tables (login attempts, rate limits, alert log) are unreachable for signed-in users');

-- 4. Every SECURITY DEFINER function pins its search_path
select is_empty($$
  select p.oid::regprocedure::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
$$, 'every security definer function has a fixed search_path');

-- 5. No policy is open to the public or anon roles
select is_empty($$
  select schemaname || '.' || tablename || ': ' || policyname
  from pg_policies
  where schemaname in ('public', 'storage', 'private')
    and ('public' = any (roles) or 'anon' = any (roles))
$$, 'no row level security policy applies to anon or to everyone');

-- 6. The file bucket is private, size capped and limited to the allowed types
select is(
  (select public::text || ':' || file_size_limit::text || ':' || (allowed_mime_types @> array['application/pdf'])::text
     || ':' || (not allowed_mime_types && array['image/svg+xml', 'text/html'])::text
   from storage.buckets where id = 'company-files'),
  'false:10485760:true:true',
  'company-files is private, capped at 10 MB, allows PDF and refuses SVG and HTML');

-- 7. Every table that holds company data says whose it is
select is_empty($$
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in ('platform_admins', 'companies')
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped)
$$, 'every public table except companies and platform_admins carries company_id');

select * from finish();
rollback;
