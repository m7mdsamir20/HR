-- PDF exports: authorized like reading the data, rate limited and audited.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a1', '1000000701');
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a2', '1000000702');
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a3', '2000000703');
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000b1', '1000000711');

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 20, current_date + 30),
  ('0000000b-0000-0000-0000-000000000000', 'شركة ب', 20, current_date + 30);
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', '1000000701', 'citizen', 'مالك', 'owner'),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', '1000000702', 'citizen', 'موارد', 'hr'),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', '2000000703', 'resident', 'موظف', 'employee'),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', '1000000711', 'citizen', 'مالك ب', 'owner');
insert into tasks (id, company_id, created_by, assignee_id, title, due_date)
values ('00000ea5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '000000a1-0000-0000-0000-000000000000', '000000a3-0000-0000-0000-000000000000', 'مهمة', current_date);

-- Employee card: owner and HR within reach only
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$select public.record_export('employee_card', '000000a3-0000-0000-0000-000000000000')$$, 'HR exports an employee card');
select throws_ok($$select public.record_export('employee_card', '000000a1-0000-0000-0000-000000000000')$$, '42501', null, 'HR can''t export the owner''s card');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.record_export('employee_card', '000000a3-0000-0000-0000-000000000000')$$, '42501', null, 'an employee can''t export a card, not even their own');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.record_export('employee_card', '000000a3-0000-0000-0000-000000000000')$$, '42501', null, 'another company can''t export our employee card');
select throws_ok($$select public.record_export('task_report', '00000ea5-0000-0000-0000-000000000000')$$, '42501', null, 'another company can''t export our task report');
reset role;

-- Task report: anyone who can see the task; HR (outside the task flow) can't
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok($$select public.record_export('task_report', '00000ea5-0000-0000-0000-000000000000')$$, 'the assignee exports the task report');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.record_export('task_report', '00000ea5-0000-0000-0000-000000000000')$$, '42501', null, 'HR can''t export a task report');
select throws_ok($$select public.record_export('payslip', '000000a3-0000-0000-0000-000000000000')$$, 'P0001', 'unknown_export', 'unknown export kinds are refused');
reset role;

-- Audited with the actor, then rate limited
select is((select count(*) from audit_logs where action = 'export.employee_card' and actor_id = '00000000-0000-0000-0000-0000000000a2'), 1::bigint,
  'exports are audited with who made them');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.record_export('task_report', '00000ea5-0000-0000-0000-000000000000') from generate_series(1, 20);
select throws_ok($$select public.record_export('task_report', '00000ea5-0000-0000-0000-000000000000')$$, 'P0001', 'rate_limited',
  'the 21st export in ten minutes is refused');
reset role;

select * from finish();
rollback;
