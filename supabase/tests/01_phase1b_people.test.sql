-- Phase 1b: employee management rules, departments, documents and storage access.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(52);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- Company A: owner, HR, manager, two employees. Company B: owner, employee.
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a001', '1000000101');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a002', '1000000102');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a003', '1000000103');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a004', '2000000104');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a005', '2000000105');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000b001', '1000000201');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000b002', '2000000202');
-- Auth users for employees created during the test
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000e1', '2000000901');
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000e2', '1000000902');
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000e3', '1000000903');

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 20, current_date + 30),
  ('0000000b-0000-0000-0000-000000000000', 'شركة ب', 20, current_date + 30);

insert into departments (id, company_id, name_ar) values
  ('00000d0a-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'التشغيل'),
  ('00000d0b-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', 'المبيعات');

insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a001', '1000000101', 'citizen', 'مالك أ', 'owner'),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a002', '1000000102', 'citizen', 'موارد أ', 'hr'),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a003', '1000000103', 'citizen', 'مشرف أ', 'manager'),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000b001', '1000000201', 'citizen', 'مالك ب', 'owner'),
  ('000000b2-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000b002', '2000000202', 'resident', 'موظف ب', 'employee');
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id) values
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a004', '2000000104', 'resident', 'موظف أ1', 'employee', '000000a3-0000-0000-0000-000000000000'),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a005', '2000000105', 'resident', 'موظف أ2', 'employee', null);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
select throws_ok($$update employees set role = 'hr' where id = '000000a1-0000-0000-0000-000000000000'$$,
  'P0001', 'last_owner', 'the only active owner cannot be demoted, even directly');
select throws_ok($$update employees set manager_id = '000000a5-0000-0000-0000-000000000000' where id = '000000a4-0000-0000-0000-000000000000'$$,
  'P0001', 'invalid_manager', 'a plain employee cannot be someone''s manager');
select throws_ok($$update employees set department_id = '00000d0b-0000-0000-0000-000000000000' where id = '000000a4-0000-0000-0000-000000000000'$$,
  '23503', null, 'a department from another company cannot be assigned');

-- ---------------------------------------------------------------------------
-- HR: manages managers and employees only, never owners, other HR or themself
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select isnt(
  public.employee_create('00000000-0000-0000-0000-0000000000e1', '2000000901', 'موظف جديد', null, null, null,
    'employee', '00000d0a-0000-0000-0000-000000000000', '000000a3-0000-0000-0000-000000000000', 'ar'),
  null, 'HR can create an employee');
select throws_ok(
  $$select public.employee_create('00000000-0000-0000-0000-0000000000e2', '1000000902', 'مالك مزيف', null, null, null, 'owner', null, null, 'ar')$$,
  '42501', null, 'HR cannot create an owner');
select throws_ok(
  $$select public.employee_create('00000000-0000-0000-0000-0000000000e2', '1000000902', 'موارد', null, null, null, 'hr', null, null, 'ar')$$,
  '42501', null, 'HR cannot create another HR');
select throws_ok(
  $$select public.employee_create('00000000-0000-0000-0000-0000000000e2', '1000000999', 'خطأ', null, null, null, 'employee', null, null, 'ar')$$,
  'P0001', 'user_mismatch', 'the Auth user must match the national ID');
select throws_ok(
  $$select public.employee_create('00000000-0000-0000-0000-00000000a005', '2000000105', 'ربط حساب قائم', null, null, null, 'employee', null, null, 'ar')$$,
  'P0001', 'user_mismatch', 'an Auth account already linked to an employee cannot be attached again');
select throws_ok(
  $$select public.employee_update('000000a1-0000-0000-0000-000000000000', 'مالك', null, null, null, 'owner', null, null)$$,
  '42501', null, 'HR cannot edit the owner');
select throws_ok(
  $$select public.employee_update('000000a2-0000-0000-0000-000000000000', 'موارد', null, null, null, 'owner', null, null)$$,
  '42501', null, 'HR cannot edit themself (no self-promotion)');
select throws_ok(
  $$select public.employee_update('000000a4-0000-0000-0000-000000000000', 'موظف', null, null, null, 'hr', null, null)$$,
  '42501', null, 'HR cannot promote someone to HR');
select lives_ok(
  $$select public.employee_update('000000a4-0000-0000-0000-000000000000', 'موظف أ1 معدل', null, '0551112222', 'فني', 'employee', '00000d0a-0000-0000-0000-000000000000', '000000a3-0000-0000-0000-000000000000')$$,
  'HR can edit an employee');
select throws_ok(
  $$select public.employee_set_status('000000b2-0000-0000-0000-000000000000', 'disabled')$$,
  '42501', null, 'HR cannot disable an employee of another company');
select throws_ok(
  $$select public.employee_set_status('000000a4-0000-0000-0000-000000000000', 'deleted')$$,
  '42501', null, 'deletion never goes through set_status');
reset role;

-- Disabling ends the user's sessions
insert into auth.sessions (id, user_id) values ('5e550000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a005');
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select is(public.employee_set_status('000000a5-0000-0000-0000-000000000000', 'disabled'),
  '00000000-0000-0000-0000-00000000a005'::uuid, 'disabling returns the Auth user to ban');
reset role;
select is((select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-00000000a005'), 0::bigint,
  'disabling ends the employee''s sessions');
select pg_temp.act_as('00000000-0000-0000-0000-00000000a005');
select is((select count(*) from employees), 0::bigint, 'the disabled employee sees nothing');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select lives_ok($$select public.employee_set_status('000000a5-0000-0000-0000-000000000000', 'active')$$,
  'HR can re-enable an employee');
select isnt(public.employee_password_reset_begin('000000a4-0000-0000-0000-000000000000'), null,
  'HR can start a password reset for an employee');
reset role;
select is((select count(*) from audit_logs where action = 'employee.password_reset'
  and actor_id = '00000000-0000-0000-0000-00000000a002'), 1::bigint, 'the password reset is audited with its actor');

-- ---------------------------------------------------------------------------
-- Manager and employee cannot manage anyone
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
select throws_ok(
  $$select public.employee_create('00000000-0000-0000-0000-0000000000e2', '1000000902', 'x', null, null, null, 'employee', null, null, 'ar')$$,
  '42501', null, 'a manager cannot create employees');
select throws_ok($$select public.employee_set_status('000000a4-0000-0000-0000-000000000000', 'disabled')$$,
  '42501', null, 'a manager cannot disable their own team member');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select throws_ok($$select public.employee_password_reset_begin('000000a5-0000-0000-0000-000000000000')$$,
  '42501', null, 'an employee cannot reset a colleague''s password');
reset role;

-- ---------------------------------------------------------------------------
-- Owner: manages everyone except themself; one active owner always remains
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
select throws_ok($$select public.employee_delete_begin('000000a1-0000-0000-0000-000000000000')$$,
  '42501', null, 'the owner cannot delete themself');
select isnt(
  public.employee_create('00000000-0000-0000-0000-0000000000e3', '1000000903', 'مالك ثان', null, null, null, 'owner', null, null, 'en'),
  null, 'the owner can create a second owner');
select lives_ok(
  $$select public.employee_update('000000a2-0000-0000-0000-000000000000', 'موارد أ', null, null, null, 'manager', null, null)$$,
  'the owner can change HR''s role');
select throws_ok(
  $$select public.employee_update('000000b2-0000-0000-0000-000000000000', 'x', null, null, null, 'employee', null, null)$$,
  '42501', null, 'the owner cannot edit another company''s employee');
reset role;

-- Delete flow: begin returns the Auth user; finish frees the national ID and keeps the row
select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
select is(public.employee_delete_begin('000000a3-0000-0000-0000-000000000000'),
  '00000000-0000-0000-0000-00000000a003'::uuid, 'delete_begin returns the Auth user to remove');
select throws_ok($$select public.employee_delete_finish('000000a3-0000-0000-0000-000000000000')$$,
  'P0001', 'auth_user_exists', 'delete_finish refuses while the Auth account still exists');
reset role;
-- What the Server Action does in between: remove the Auth user (the FK nulls employees.user_id)
delete from auth.users where id = '00000000-0000-0000-0000-00000000a003';
select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
select lives_ok($$select public.employee_delete_finish('000000a3-0000-0000-0000-000000000000')$$, 'delete_finish marks the row deleted');
reset role;
select is((select status::text || ':' || coalesce(user_id::text, 'null') from employees where id = '000000a3-0000-0000-0000-000000000000'),
  'deleted:null', 'the deleted row stays for history without an Auth user');
select is((select manager_id from employees where id = '000000a4-0000-0000-0000-000000000000'), null,
  'the deleted manager''s reports are left without a manager');
select lives_ok(
  $$insert into employees (company_id, national_id, id_type, full_name_ar) values ('0000000b-0000-0000-0000-000000000000', '1000000103', 'citizen', 'نفس الرقم')$$,
  'a deleted employee''s national ID can be added again elsewhere');

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select results_eq('select id from departments', $$values ('00000d0a-0000-0000-0000-000000000000'::uuid)$$,
  'members read only their company''s departments');
select throws_ok($$insert into departments (company_id, name_ar) values ('0000000a-0000-0000-0000-000000000000', 'قسم')$$,
  '42501', null, 'an employee cannot add departments');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000b001');
select throws_ok($$insert into departments (company_id, name_ar) values ('0000000a-0000-0000-0000-000000000000', 'دخيل')$$,
  '42501', null, 'an owner cannot add a department to another company');
reset role;

-- ---------------------------------------------------------------------------
-- Documents and storage paths
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
insert into employee_documents (id, company_id, employee_id, doc_type, number, expiry_date, file_path, file_name, mime_type, size_bytes)
values ('0000d0c0-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000',
  'iqama', '2000000104', current_date + 20,
  '0000000a-0000-0000-0000-000000000000/documents/000000a4-0000-0000-0000-000000000000/11111111-1111-1111-1111-111111111111.pdf',
  'iqama.pdf', 'application/pdf', 1000);
select throws_ok(
  $$insert into employee_documents (company_id, employee_id, doc_type, file_path) values ('0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', 'passport',
    '0000000b-0000-0000-0000-000000000000/documents/000000b2-0000-0000-0000-000000000000/11111111-1111-1111-1111-111111111111.pdf')$$,
  '23514', null, 'a document cannot point at another company''s file');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select is((select count(*) from employee_documents), 1::bigint, 'an employee reads their own documents');
select is_empty($$delete from employee_documents returning id$$, 'an employee cannot delete documents');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000a005');
select is((select count(*) from employee_documents), 0::bigint, 'a colleague cannot read someone else''s documents');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000b001');
select is((select count(*) from employee_documents), 0::bigint, 'another company cannot read the documents');
select is(private.storage_can_read('0000000a-0000-0000-0000-000000000000/logo/x.png'), false,
  'another company cannot read the logo');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select is(private.storage_can_read('0000000a-0000-0000-0000-000000000000/documents/000000a4-0000-0000-0000-000000000000/f.pdf'), true,
  'an employee can read their own files');
select is(private.storage_can_read('0000000a-0000-0000-0000-000000000000/documents/000000a5-0000-0000-0000-000000000000/f.pdf'), false,
  'an employee cannot read a colleague''s files');
select is(private.storage_can_write('0000000a-0000-0000-0000-000000000000/documents/000000a4-0000-0000-0000-000000000000/f.pdf'), false,
  'an employee cannot upload documents, even their own');
select is(private.storage_can_read('0000000a-0000-0000-0000-000000000000/documents/not-a-uuid/f.pdf'), false,
  'a malformed path is refused without an error');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
-- a002 is now a manager (changed above), so they no longer manage documents
select is(private.storage_can_write('0000000a-0000-0000-0000-000000000000/documents/000000a4-0000-0000-0000-000000000000/f.pdf'), false,
  'after losing the HR role, uploads are refused');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
select is(private.storage_can_write('0000000a-0000-0000-0000-000000000000/logo/x.png'), true, 'the owner can upload the logo');
select throws_ok($$select public.company_set_logo('0000000b-0000-0000-0000-000000000000/logo/11111111-1111-1111-1111-111111111111.png')$$,
  'P0001', 'invalid_path', 'the logo must be inside the owner''s own company folder');
reset role;

-- ---------------------------------------------------------------------------
-- Profile and rate limits
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select public.profile_set_locale('en');
select throws_ok($$select public.company_update_profile('اسم جديد', null, null)$$, '42501', null,
  'only the owner edits the company profile');
select public.consume_rate_limit('password_change') from generate_series(1, 5);
select throws_ok($$select public.consume_rate_limit('password_change')$$, 'P0001', 'rate_limited',
  'a sixth password change in 15 minutes is refused');
reset role;
select is((select locale from employees where id = '000000a4-0000-0000-0000-000000000000'), 'en', 'an employee sets their own language');

select * from finish();
rollback;
