-- Phase 3b: Payroll runs, slips calculation, adjustments, approval, and RLS isolation.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;

create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000010a1', '1000001001'); -- owner
select pg_temp.mk_user('00000000-0000-0000-0000-0000000010a2', '1000001002'); -- hr
select pg_temp.mk_user('00000000-0000-0000-0000-0000000010a3', '1000001003'); -- manager
select pg_temp.mk_user('00000000-0000-0000-0000-0000000010a4', '1000001004'); -- employee 1 (citizen)
select pg_temp.mk_user('00000000-0000-0000-0000-0000000010a5', '2000001005'); -- employee 2 (resident)
select pg_temp.mk_user('00000000-0000-0000-0000-0000000010b1', '1000001011'); -- owner company B

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة المسيرات أ', 20, current_date + 400),
  ('0000000b-0000-0000-0000-000000000000', 'شركة المسيرات ب', 20, current_date + 400);

insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id, hire_date) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010a1', '1000001001', 'citizen', 'المالك', 'owner', null, current_date - 1000),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010a2', '1000001002', 'citizen', 'الموارد', 'hr', null, current_date - 500),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010a3', '1000001003', 'citizen', 'المشرف', 'manager', null, current_date - 500),
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010a4', '1000001004', 'citizen', 'الموظف 1', 'employee', '000000a3-0000-0000-0000-000000000000', current_date - 300),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010a5', '2000001005', 'resident', 'الموظف 2', 'employee', '000000a3-0000-0000-0000-000000000000', current_date - 200),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010b1', '1000001011', 'citizen', 'المالك ب', 'owner', null, current_date - 500);

-- Compensations:
-- Emp 1 (citizen): Basic 9000, Housing 1000 => Contributory 10,000 => GOSI EE = 975.
insert into employee_compensation (company_id, employee_id, basic_salary, housing_allowance, transport_allowance) values
  ('0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', 9000.00, 1000.00, 500.00),
  -- Emp 2 (resident): Basic 5000, Housing 1000 => GOSI EE = 0.
  ('0000000a-0000-0000-0000-000000000000', '000000a5-0000-0000-0000-000000000000', 5000.00, 1000.00, 500.00);

-- Active advance for Emp 1: 3000 total, 1000 monthly
insert into advance_requests (id, company_id, employee_id, amount, installments_count, monthly_installment, reason, status, decided_by, decided_at)
values (
  '88000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000',
  3000.00, 3, 1000.00, 'سلفة لتجهيز المنزل', 'approved', '00000000-0000-0000-0000-0000000010a2', now()
);

-- Approved attendance deduction for Emp 1 in Nov 2026: 0.5 day (9000 / 30 * 0.5 = 150 SAR)
insert into attendance_deductions (company_id, employee_id, work_date, kind, day_fraction, status, decided_by, decided_at)
values (
  '0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000',
  '2026-11-05', 'late', 0.5, 'approved', '00000000-0000-0000-0000-0000000010a2', now()
);

-- ---------------------------------------------------------------------------
-- 1. Create payroll run
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000010a2'); -- HR

create temp table pg_temp.run_id as
select payroll_run_create(2026, 11, 'مسير رواتب نوفمبر 2026') as id;

select is(
  (select count(*) from payroll_runs where id = (select id from pg_temp.run_id) and status = 'draft'),
  1::bigint,
  'Payroll run created in draft status'
);

select is(
  (select count(*) from payroll_slips where payroll_run_id = (select id from pg_temp.run_id)),
  2::bigint,
  'Slips generated for both active employees with compensation'
);

-- Check employee 1 slip:
-- Gross: 9000 + 1000 + 500 = 10,500
-- Deductions: GOSI (975) + Attendance (150) + Advance (1000) = 2,125
-- Net: 10,500 - 2,125 = 8,375
select is(
  (select gross_salary from payroll_slips where payroll_run_id = (select id from pg_temp.run_id) and employee_id = '000000a4-0000-0000-0000-000000000000'),
  10500.00,
  'Emp 1 gross salary is 10,500 SAR'
);

select is(
  (select gosi_employee from payroll_slips where payroll_run_id = (select id from pg_temp.run_id) and employee_id = '000000a4-0000-0000-0000-000000000000'),
  975.00,
  'Emp 1 GOSI deduction is 975 SAR'
);

select is(
  (select attendance_deduction from payroll_slips where payroll_run_id = (select id from pg_temp.run_id) and employee_id = '000000a4-0000-0000-0000-000000000000'),
  150.00,
  'Emp 1 attendance deduction is 150 SAR (half-day pay)'
);

select is(
  (select advance_deduction from payroll_slips where payroll_run_id = (select id from pg_temp.run_id) and employee_id = '000000a4-0000-0000-0000-000000000000'),
  1000.00,
  'Emp 1 advance monthly installment is 1,000 SAR'
);

select is(
  (select net_salary from payroll_slips where payroll_run_id = (select id from pg_temp.run_id) and employee_id = '000000a4-0000-0000-0000-000000000000'),
  8375.00,
  'Emp 1 net salary accurately computed at 8,375 SAR'
);

-- Check employee 2 (resident) slip:
-- Gross: 5000 + 1000 + 500 = 6,500
-- Deductions: GOSI (0) + Attendance (0) + Advance (0) = 0
-- Net: 6,500
select is(
  (select net_salary from payroll_slips where payroll_run_id = (select id from pg_temp.run_id) and employee_id = '000000a5-0000-0000-0000-000000000000'),
  6500.00,
  'Emp 2 (resident) net salary is 6,500 SAR with 0 GOSI deduction'
);

-- ---------------------------------------------------------------------------
-- 2. Adjustments
-- ---------------------------------------------------------------------------
create temp table pg_temp.slip_id as
select id from payroll_slips
where payroll_run_id = (select id from pg_temp.run_id) and employee_id = '000000a4-0000-0000-0000-000000000000';

-- Add 500 SAR bonus (other_allowances)
select lives_ok(
  format('select payroll_slip_adjust(%L, 500.00, 0.00, %L)', (select id from pg_temp.slip_id), 'مكافأة تميز في المشروع'),
  'HR adjusts slip with 500 SAR bonus'
);

select is(
  (select net_salary from payroll_slips where id = (select id from pg_temp.slip_id)),
  8875.00,
  'Emp 1 net salary updated to 8,875 SAR after bonus'
);

-- ---------------------------------------------------------------------------
-- 3. RLS Isolation
-- ---------------------------------------------------------------------------
-- Emp 1 can only see their own slip
select pg_temp.act_as('00000000-0000-0000-0000-0000000010a4');
select is(
  (select count(*) from payroll_slips),
  1::bigint,
  'Employee sees only their own payslip'
);

-- Emp 1 cannot see payroll runs
select is(
  (select count(*) from payroll_runs),
  0::bigint,
  'Employee cannot see master payroll runs'
);

-- Manager cannot see any slips or runs
select pg_temp.act_as('00000000-0000-0000-0000-0000000010a3');
select is(
  (select count(*) from payroll_slips),
  0::bigint,
  'Manager cannot see payroll slips'
);
select is(
  (select count(*) from payroll_runs),
  0::bigint,
  'Manager cannot see master payroll runs'
);

-- Company B owner sees 0
select pg_temp.act_as('00000000-0000-0000-0000-0000000010b1');
select is(
  (select count(*) from payroll_slips),
  0::bigint,
  'Company B cannot see Company A payroll slips'
);

-- ---------------------------------------------------------------------------
-- 4. Approval & Advance deduction commitment
-- ---------------------------------------------------------------------------
-- HR cannot approve (only owner can approve master run)
select pg_temp.act_as('00000000-0000-0000-0000-0000000010a2');
select throws_ok(
  format('select payroll_run_approve(%L)', (select id from pg_temp.run_id)),
  '42501',
  'owner_only',
  'Only company owner can approve and lock payroll run'
);

-- Owner approves
select pg_temp.act_as('00000000-0000-0000-0000-0000000010a1');
select lives_ok(
  format('select payroll_run_approve(%L)', (select id from pg_temp.run_id)),
  'Owner approves payroll run'
);

select is(
  (select status from payroll_runs where id = (select id from pg_temp.run_id)),
  'approved',
  'Payroll run is now approved and locked'
);

-- Check advance deduction committed
select is(
  (select remaining_amount from advance_requests where id = '88000001-0000-0000-0000-000000000000'),
  2000.00,
  'Emp 1 advance remaining reduced to 2,000 SAR after payroll approval'
);

select is(
  (select count(*) from advance_installments where advance_id = '88000001-0000-0000-0000-000000000000' and method = 'payroll_deduction'),
  1::bigint,
  'Payroll deduction installment recorded in advance_installments'
);

-- Check notification generated
select is(
  (select count(*) from notifications where recipient_id = '000000a4-0000-0000-0000-000000000000' and type = 'payroll_ready'),
  1::bigint,
  'Employee received payroll_ready notification'
);

-- Cannot delete approved run
select throws_ok(
  format('select payroll_run_delete(%L)', (select id from pg_temp.run_id)),
  'P0001',
  'cannot_delete_locked_run',
  'Cannot delete an approved/locked payroll run'
);

rollback;
