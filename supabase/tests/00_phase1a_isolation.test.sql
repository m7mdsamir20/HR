-- Tenant isolation and role scope for phase 1a tables (CLAUDE.md §5 "اختبارات العزل إلزامية").
-- Run: pnpm exec supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(43);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
-- ---------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
$$;

create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000000ad', '1000000091'); -- system admin
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a001', '1000000101'); -- A owner
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a002', '1000000102'); -- A hr
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a003', '1000000103'); -- A manager
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a004', '2000000104'); -- A employee (reports to manager)
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a005', '2000000105'); -- A employee (no manager)
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a006', '2000000106'); -- A employee, disabled
select pg_temp.mk_user('00000000-0000-0000-0000-00000000b001', '1000000201'); -- B owner
select pg_temp.mk_user('00000000-0000-0000-0000-00000000b002', '2000000202'); -- B employee
select pg_temp.mk_user('00000000-0000-0000-0000-00000000c001', '1000000301'); -- C owner (suspended)
select pg_temp.mk_user('00000000-0000-0000-0000-00000000d001', '1000000401'); -- D owner (expired)
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000ee', '1000000501'); -- new owner via RPC

insert into platform_admins (user_id, national_id, full_name)
values ('00000000-0000-0000-0000-0000000000ad', '1000000091', 'System Admin');

insert into companies (id, name_ar, max_employees, subscription_ends_at, status) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 10, current_date + 30, 'active'),
  ('0000000b-0000-0000-0000-000000000000', 'شركة ب', 10, current_date + 30, 'active'),
  ('0000000c-0000-0000-0000-000000000000', 'شركة ج', 10, current_date + 30, 'suspended'),
  ('0000000d-0000-0000-0000-000000000000', 'شركة د', 10, current_date - 1, 'active'),
  ('0000000e-0000-0000-0000-000000000000', 'شركة صغيرة', 1, current_date + 30, 'active');

insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id, status) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a001', '1000000101', 'citizen', 'مالك أ', 'owner', null, 'active'),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a002', '1000000102', 'citizen', 'موارد أ', 'hr', null, 'active'),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a003', '1000000103', 'citizen', 'مشرف أ', 'manager', null, 'active');
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id, status) values
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a004', '2000000104', 'resident', 'موظف أ1', 'employee', '000000a3-0000-0000-0000-000000000000', 'active'),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a005', '2000000105', 'resident', 'موظف أ2', 'employee', null, 'active'),
  ('000000a6-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a006', '2000000106', 'resident', 'موظف معطل', 'employee', null, 'disabled'),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000b001', '1000000201', 'citizen', 'مالك ب', 'owner', null, 'active'),
  ('000000b2-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000b002', '2000000202', 'resident', 'موظف ب', 'employee', null, 'active'),
  ('000000c1-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000c001', '1000000301', 'citizen', 'مالك ج', 'owner', null, 'active'),
  ('000000d1-0000-0000-0000-000000000000', '0000000d-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000d001', '1000000401', 'citizen', 'مالك د', 'owner', null, 'active');

-- ---------------------------------------------------------------------------
-- Database constraints
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into employees (company_id, national_id, id_type, full_name_ar)
    values ('0000000b-0000-0000-0000-000000000000', '1000000101', 'citizen', 'تكرار')$$,
  '23505', null, 'a live national ID cannot be added to a second company');

select throws_ok(
  $$update employees set manager_id = '000000a3-0000-0000-0000-000000000000'
    where id = '000000b2-0000-0000-0000-000000000000'$$,
  '23503', null, 'a manager must belong to the same company');

select throws_ok(
  $$insert into employees (company_id, national_id, id_type, full_name_ar)
    values ('0000000a-0000-0000-0000-000000000000', '1000000999', 'resident', 'نوع خطأ')$$,
  '23514', null, 'id_type must match the first digit of the national ID');

insert into employees (company_id, national_id, id_type, full_name_ar)
values ('0000000e-0000-0000-0000-000000000000', '1000000601', 'citizen', 'أول موظف');
select throws_ok(
  $$insert into employees (company_id, national_id, id_type, full_name_ar)
    values ('0000000e-0000-0000-0000-000000000000', '1000000602', 'citizen', 'فوق الحد')$$,
  'P0001', 'employee_limit_reached', 'the seat limit is enforced in the database');

select lives_ok(
  $$insert into employees (company_id, national_id, id_type, full_name_ar, status)
    values ('0000000e-0000-0000-0000-000000000000', '1000000603', 'citizen', 'معطل لا يحسب', 'disabled')$$,
  'disabled employees do not take a seat');

-- ---------------------------------------------------------------------------
-- anon has no access at all
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from companies', '42501', null, 'anon cannot read companies');
select throws_ok('select count(*) from employees', '42501', null, 'anon cannot read employees');
select throws_ok($$select public.my_account()$$, '42501', null, 'anon cannot call my_account');
reset role;

-- ---------------------------------------------------------------------------
-- Plain employee: only themself and their own company
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select results_eq('select id from employees', $$values ('000000a4-0000-0000-0000-000000000000'::uuid)$$,
  'an employee sees only their own employee row');
select results_eq('select id from companies', $$values ('0000000a-0000-0000-0000-000000000000'::uuid)$$,
  'an employee sees only their own company');
select is_empty('select 1 from audit_logs', 'an employee cannot read the audit log');
select is((select count(*) from platform_admins), 0::bigint, 'an employee cannot see system admins');
select is(public.my_account() ->> 'role', 'employee', 'my_account returns the caller''s own role');
reset role;

-- ---------------------------------------------------------------------------
-- Manager: self + direct reports only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
select set_eq('select id from employees',
  $$values ('000000a3-0000-0000-0000-000000000000'::uuid), ('000000a4-0000-0000-0000-000000000000'::uuid)$$,
  'a manager sees themself and direct reports only');
reset role;

-- ---------------------------------------------------------------------------
-- HR and owner: whole company, never another company
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select is((select count(*) from employees), 6::bigint, 'HR sees every employee of their company');
select is((select count(*) from employees where company_id <> '0000000a-0000-0000-0000-000000000000'), 0::bigint,
  'HR sees no employee of another company');
select is_empty('select 1 from audit_logs', 'HR cannot read the audit log');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
select is((select count(*) from employees), 6::bigint, 'the owner sees every employee of their company');
select is_empty($$select 1 from employees where company_id = '0000000b-0000-0000-0000-000000000000'$$,
  'the owner cannot read company B employees by ID');
select is_empty($$select 1 from companies where id = '0000000b-0000-0000-0000-000000000000'$$,
  'the owner cannot read company B by ID');
select is((select count(*) from audit_logs where company_id <> '0000000a-0000-0000-0000-000000000000'), 0::bigint,
  'the owner sees only their company''s audit log');
select ok((select count(*) from audit_logs) > 0, 'the owner sees their company''s audit log');

-- Writes the owner must not be able to make
select is_empty($$update companies set max_employees = 999, status = 'active'
  where id = '0000000a-0000-0000-0000-000000000000' returning id$$,
  'the owner cannot change their own subscription or limits');
select throws_ok($$update employees set role = 'owner' where id = '000000a5-0000-0000-0000-000000000000'$$,
  '42501', null, 'employees are not directly writable in phase 1a');
select throws_ok($$insert into audit_logs (action, target_type) values ('forged', 'x')$$,
  '42501', null, 'the audit log cannot be forged');
select throws_ok($$delete from audit_logs$$, '42501', null, 'the audit log cannot be deleted');
select throws_ok(
  $$select public.admin_create_company('x', null, null, 5, current_date + 1,
    '00000000-0000-0000-0000-0000000000ee', '1000000501', 'مالك', null, null)$$,
  '42501', null, 'only a system admin can create companies');
select throws_ok($$select public.login_begin('a', 'b')$$, '42501', null,
  'login rate-limit functions are not callable by users');
select throws_ok('select count(*) from private.login_attempts', '42501', null,
  'login attempts are not readable by users');
reset role;

-- ---------------------------------------------------------------------------
-- Inactive memberships see nothing even with a valid JWT
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a006');
select is((select count(*) from employees), 0::bigint, 'a disabled employee sees nothing');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000c001');
select is((select count(*) from employees) + (select count(*) from companies), 0::bigint,
  'a suspended company sees nothing');
select is((public.my_account() -> 'company' ->> 'is_active')::boolean, false,
  'my_account still tells a suspended owner why');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000d001');
select is((select count(*) from employees) + (select count(*) from companies), 0::bigint,
  'an expired subscription sees nothing');
reset role;

-- ---------------------------------------------------------------------------
-- System admin
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000ad');
-- Counts only this test's companies, so it also passes on a seeded local database.
select is((select count(*) from companies where id::text like '0000000_-0000-0000-0000-000000000000'), 5::bigint,
  'the system admin sees every company');
select is(public.my_account() ->> 'kind', 'platform_admin', 'my_account identifies the system admin');

select isnt_empty($$update companies set status = 'suspended'
  where id = '0000000b-0000-0000-0000-000000000000' returning id$$,
  'the system admin can suspend a company');
select is(
  (select actor_id from audit_logs where target_id = '0000000b-0000-0000-0000-000000000000'
     and action = 'company.update' order by id desc limit 1),
  '00000000-0000-0000-0000-0000000000ad'::uuid,
  'the suspension is audited with the admin as actor');

select throws_ok(
  $$select public.admin_create_company('شركة جديدة', null, null, 5, current_date + 30,
    '00000000-0000-0000-0000-0000000000ee', '1000000999', 'مالك', null, null)$$,
  'P0001', 'owner_user_mismatch', 'the owner Auth user must match the national ID');
select isnt(
  public.admin_create_company('شركة جديدة', null, null, 5, current_date + 30,
    '00000000-0000-0000-0000-0000000000ee', '1000000501', 'مالك جديد', null, null),
  null, 'the system admin can create a company with its owner');
reset role;

-- ---------------------------------------------------------------------------
-- Login rate limit (runs as the service role does; users can't call it, tested above)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from (select public.login_begin('id-x', 'ip-x') as a from generate_series(1, 5)) s where a is not null),
  5::bigint, 'five attempts per national ID are allowed');
select is(public.login_begin('id-x', 'ip-other'), null, 'the sixth attempt for that ID is refused, from any IP');

select public.login_succeeded(public.login_begin('id-z', 'ip-z'));
select is(
  (select count(*) from (select public.login_begin('id-z', 'ip-z') as a from generate_series(1, 5)) s where a is not null),
  5::bigint, 'a successful login resets the per-ID count');

select is(
  (select count(*) from (select public.login_begin('id-' || g, 'ip-shared') as a from generate_series(1, 51) g) s where a is null),
  1::bigint, 'an IP is refused after 50 failures across different IDs');

select * from finish();
rollback;
