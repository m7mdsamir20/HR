-- Phase 4: Analytics and Dashboard KPIs tests
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;

create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000020a1', '1000002001'); -- owner
select pg_temp.mk_user('00000000-0000-0000-0000-0000000020a2', '1000002002'); -- hr
select pg_temp.mk_user('00000000-0000-0000-0000-0000000020a3', '1000002003'); -- manager
select pg_temp.mk_user('00000000-0000-0000-0000-0000000020a4', '1000002004'); -- employee 1 (citizen)
select pg_temp.mk_user('00000000-0000-0000-0000-0000000020a5', '2000002005'); -- employee 2 (resident)
select pg_temp.mk_user('00000000-0000-0000-0000-0000000020b1', '1000002011'); -- owner company B

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000c-0000-0000-0000-000000000000', 'شركة المؤشرات أ', 20, current_date + 400),
  ('0000000d-0000-0000-0000-000000000000', 'شركة المؤشرات ب', 20, current_date + 400);

insert into departments (id, company_id, name_ar) values
  ('000000d1-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', 'التقنية'),
  ('000000d2-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', 'العمليات');

insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id, department_id, hire_date) values
  ('000000c1-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000020a1', '1000002001', 'citizen', 'المالك', 'owner', null, '000000d1-0000-0000-0000-000000000000', current_date - 1000),
  ('000000c2-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000020a2', '1000002002', 'citizen', 'الموارد', 'hr', null, '000000d1-0000-0000-0000-000000000000', current_date - 500),
  ('000000c3-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000020a3', '1000002003', 'citizen', 'المشرف', 'manager', null, '000000d2-0000-0000-0000-000000000000', current_date - 500),
  ('000000c4-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000020a4', '1000002004', 'citizen', 'الموظف 1', 'employee', '000000c3-0000-0000-0000-000000000000', '000000d2-0000-0000-0000-000000000000', current_date - 300),
  ('000000c5-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000020a5', '2000002005', 'resident', 'الموظف 2', 'employee', '000000c3-0000-0000-0000-000000000000', '000000d2-0000-0000-0000-000000000000', current_date - 200),
  ('000000d3-0000-0000-0000-000000000000', '0000000d-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000020b1', '1000002011', 'citizen', 'المالك ب', 'owner', null, null, current_date - 500);

-- Tasks
insert into tasks (id, company_id, creator_id, assignee_id, title, status, priority, due_date) values
  ('77000001-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '000000c3-0000-0000-0000-000000000000', '000000c4-0000-0000-0000-000000000000', 'مهمة منجزة', 'approved', 'high', current_date - 5),
  ('77000002-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '000000c3-0000-0000-0000-000000000000', '000000c5-0000-0000-0000-000000000000', 'مهمة قيد التنفيذ', 'in_progress', 'medium', current_date + 5);

insert into task_reports (company_id, task_id, submitted_by, summary, hours_spent, status, rating, reviewed_by, reviewed_at) values
  ('0000000c-0000-0000-0000-000000000000', '77000001-0000-0000-0000-000000000000', '000000c4-0000-0000-0000-000000000000', 'تم الإنجاز بدقة', 4.5, 'approved', 5, '00000000-0000-0000-0000-0000000020a3', now());

-- Attendance today for emp 1
insert into attendance_records (company_id, employee_id, work_date, status, check_in_at) values
  ('0000000c-0000-0000-0000-000000000000', '000000c4-0000-0000-0000-000000000000', current_date, 'present', now() - interval '4 hours');

-- Advance
insert into advance_requests (id, company_id, employee_id, amount, installments_count, monthly_installment, reason, status, decided_by, decided_at) values
  ('88000002-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000000', '000000c4-0000-0000-0000-000000000000', 2000.00, 2, 1000.00, 'سلفة', 'approved', '00000000-0000-0000-0000-0000000020a2', now());

-- Payroll run
insert into payroll_runs (company_id, year, month, status, total_gross, total_net, total_gosi_employer, total_deductions, employee_count) values
  ('0000000c-0000-0000-0000-000000000000', 2026, 10, 'draft', 14000.00, 12500.00, 1200.00, 1500.00, 2);

-- ---------------------------------------------------------------------------
-- 1. Owner sees full company analytics
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000020a1');

select is(
  (public.get_analytics_summary()->'role')::text,
  '"owner"',
  'Owner role recognized'
);

select is(
  (public.get_analytics_summary()->'workforce'->>'total_employees')::int,
  5,
  'Owner sees 5 active employees in Company A'
);

select is(
  (public.get_analytics_summary()->'workforce'->>'saudi_count')::int,
  4,
  'Owner sees 4 Saudi citizen employees'
);

select is(
  (public.get_analytics_summary()->'workforce'->>'saudization_rate')::numeric,
  80.0,
  'Saudization rate is 80.0%'
);

select is(
  (public.get_analytics_summary()->'tasks'->>'total')::int,
  2,
  'Owner sees 2 total tasks'
);

select is(
  (public.get_analytics_summary()->'tasks'->>'approved')::int,
  1,
  'Owner sees 1 approved task'
);

select is(
  (public.get_analytics_summary()->'tasks'->>'avg_rating')::numeric,
  5.0,
  'Task average rating is 5.0'
);

select is(
  (public.get_analytics_summary()->'financial'->'latest_run'->>'month')::int,
  10,
  'Owner sees financial latest run month = 10'
);

select is(
  (public.get_analytics_summary()->'financial'->>'active_advances_count')::int,
  1,
  'Owner sees 1 active advance'
);

-- ---------------------------------------------------------------------------
-- 2. Manager sees team analytics and ZERO financial data
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000020a3');

select is(
  (public.get_analytics_summary()->'role')::text,
  '"manager"',
  'Manager role recognized'
);

select is(
  (public.get_analytics_summary()->'workforce'->>'total_employees')::int,
  2,
  'Manager sees team size = 2'
);

select ok(
  public.get_analytics_summary()->'financial' is null,
  'Financial metrics are NULL for manager'
);

select is(
  (public.get_analytics_summary()->'attendance'->>'today_present')::int,
  1,
  'Manager sees 1 present team member today'
);

-- ---------------------------------------------------------------------------
-- 3. Employee sees only self metrics and ZERO workforce/financial data
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000020a4');

select is(
  (public.get_analytics_summary()->'role')::text,
  '"employee"',
  'Employee role recognized'
);

select ok(
  public.get_analytics_summary()->'workforce' is null,
  'Workforce metrics are NULL for employee'
);

select ok(
  public.get_analytics_summary()->'financial' is null,
  'Financial metrics are NULL for employee'
);

select * from finish();
rollback;

