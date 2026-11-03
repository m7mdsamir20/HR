-- Employee file fields and salary access: narrower than the employee row (CLAUDE.md §4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.mk_user('00000000-0000-0000-0000-00000000a001', '1000000701');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a002', '1000000702');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a003', '1000000703');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a004', '2000000704');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000a005', '2000000705');
select pg_temp.mk_user('00000000-0000-0000-0000-00000000b001', '1000000801');

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 20, current_date + 30),
  ('0000000b-0000-0000-0000-000000000000', 'شركة ب', 20, current_date + 30);

insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a001', '1000000701', 'citizen', 'مالك', 'owner'),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a002', '1000000702', 'citizen', 'موارد', 'hr'),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a003', '1000000703', 'citizen', 'مشرف', 'manager'),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000b001', '1000000801', 'citizen', 'مالك ب', 'owner');
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id) values
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a004', '2000000704', 'resident', 'موظف 1', 'employee', '000000a3-0000-0000-0000-000000000000'),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000a005', '2000000705', 'resident', 'موظف 2', 'employee', '000000a3-0000-0000-0000-000000000000');

insert into employee_compensation (employee_id, company_id, basic_salary) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 30000),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 12000),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 9000),
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 4000),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 4500);

-- ---------------------------------------------------------------------------
-- Who sees whose pay
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a004');
select results_eq('select employee_id from employee_compensation', $$values ('000000a4-0000-0000-0000-000000000000'::uuid)$$,
  'an employee sees only their own pay');
select ok((public.my_profile() -> 'pay' ->> 'basic_salary')::numeric = 4000, 'my_profile includes the employee''s own pay');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
select results_eq('select employee_id from employee_compensation', $$values ('000000a3-0000-0000-0000-000000000000'::uuid)$$,
  'a manager does not see their team''s pay, only their own');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select set_eq('select employee_id from employee_compensation',
  $$values ('000000a2-0000-0000-0000-000000000000'::uuid), ('000000a3-0000-0000-0000-000000000000'::uuid),
           ('000000a4-0000-0000-0000-000000000000'::uuid), ('000000a5-0000-0000-0000-000000000000'::uuid)$$,
  'HR sees managers'' and employees'' pay, and their own, but not the owner''s');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
select is((select count(*) from employee_compensation), 5::bigint, 'the owner sees the whole company''s pay');
select throws_ok($$insert into employee_compensation (employee_id, company_id) values ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000')$$,
  '42501', null, 'pay is never written directly, only through the employee RPCs');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b001');
select is((select count(*) from employee_compensation), 0::bigint, 'another company sees no pay at all');
reset role;

-- ---------------------------------------------------------------------------
-- Updating the file and pay through the RPC
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
select lives_ok($$select public.employee_update('000000a4-0000-0000-0000-000000000000', 'employee',
    jsonb_build_object('full_name_ar', 'موظف 1', 'nationality', 'IN', 'gender', 'male', 'marital_status', 'married',
      'contract_type', 'fixed', 'contract_start', '2026-01-01', 'contract_end', '2027-12-31', 'probation_days', '90',
      'manager_id', '000000a3-0000-0000-0000-000000000000'),
    jsonb_build_object('basic_salary', '5000', 'housing_allowance', '1250', 'transport_allowance', '500',
      'iban', 'sa03 8000 0000 6080 1016 7519', 'gosi_number', '123456789'))$$,
  'HR updates an employee''s file and pay in one call');
select throws_ok($$select public.employee_update('000000a1-0000-0000-0000-000000000000', 'owner',
    jsonb_build_object('full_name_ar', 'مالك'), jsonb_build_object('basic_salary', '1'))$$,
  '42501', null, 'HR cannot change the owner''s pay');
select throws_ok($$select public.employee_update('000000a5-0000-0000-0000-000000000000', 'employee',
    jsonb_build_object('full_name_ar', 'موظف 2'), jsonb_build_object('iban', 'SA12'))$$,
  '23514', null, 'a malformed IBAN is refused');
select throws_ok($$select public.employee_update('000000a5-0000-0000-0000-000000000000', 'employee',
    jsonb_build_object('full_name_ar', 'موظف 2', 'contract_type', 'fixed', 'contract_start', '2026-01-01'), '{}')$$,
  '23514', null, 'a fixed-term contract needs an end date');
select throws_ok($$select public.employee_update('000000a5-0000-0000-0000-000000000000', 'employee',
    jsonb_build_object('full_name_ar', 'موظف 2', 'nationality', 'SA'), '{}')$$,
  '23514', null, 'an Iqama holder cannot be recorded as Saudi');
reset role;

select is((select iban from employee_compensation where employee_id = '000000a4-0000-0000-0000-000000000000'),
  'SA0380000000608010167519', 'the IBAN is stored normalised (no spaces, upper case)');
select is((select basic_salary + housing_allowance + transport_allowance from employee_compensation
  where employee_id = '000000a4-0000-0000-0000-000000000000'), 6750.00::numeric, 'all pay parts are saved');
select is((select actor_id from audit_logs where action = 'compensation.update' order by id desc limit 1),
  '00000000-0000-0000-0000-00000000a002'::uuid, 'pay changes are audited with their actor');
select ok(
  (select meta::text not like '%5000%' and meta::text not like '%SA03%' and meta -> 'changed' ? 'basic_salary'
     from audit_logs where action = 'compensation.update' order by id desc limit 1),
  'the pay audit names the changed fields without their amounts or the IBAN');

-- Document edits: the audit names the changed fields, never the document number
insert into employee_documents (id, company_id, employee_id, doc_type, number)
values ('0000d0c0-0000-0000-0000-000000000009', '0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', 'passport', 'A1234567');
update employee_documents set number = 'B7654321' where id = '0000d0c0-0000-0000-0000-000000000009';
select ok(
  (select meta::text not like '%7654321%' and meta::text not like '%1234567%' and meta -> 'changed' ? 'number'
     from audit_logs where action = 'document.update' order by id desc limit 1),
  'document edits are audited without the document number');

-- Citizens are Saudi whatever the form sends
select pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
select public.employee_update('000000a3-0000-0000-0000-000000000000', 'manager',
  jsonb_build_object('full_name_ar', 'مشرف', 'nationality', 'EG'), '{}');
reset role;
select is((select nationality from employees where id = '000000a3-0000-0000-0000-000000000000'), 'SA',
  'a national ID holder is always recorded as Saudi');

select * from finish();
rollback;
