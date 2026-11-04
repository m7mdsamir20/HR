-- Phase 3a: Advances and GOSI calculations, RLS, permissions, and status transitions.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;

create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000009a1', '1000000901'); -- owner company A
select pg_temp.mk_user('00000000-0000-0000-0000-0000000009a2', '1000000902'); -- hr company A
select pg_temp.mk_user('00000000-0000-0000-0000-0000000009a3', '1000000903'); -- manager company A
select pg_temp.mk_user('00000000-0000-0000-0000-0000000009a4', '1000000904'); -- saudi employee company A
select pg_temp.mk_user('00000000-0000-0000-0000-0000000009a5', '2000000905'); -- expat employee company A
select pg_temp.mk_user('00000000-0000-0000-0000-0000000009b1', '1000000911'); -- owner company B

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة الرواتب أ', 20, current_date + 400),
  ('0000000b-0000-0000-0000-000000000000', 'شركة الرواتب ب', 20, current_date + 400);

insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id, hire_date) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000009a1', '1000000901', 'citizen', 'المالك أ', 'owner', null, current_date - 1000),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000009a2', '1000000902', 'citizen', 'مسؤول HR', 'hr', null, current_date - 500),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000009a3', '1000000903', 'citizen', 'المشرف', 'manager', null, current_date - 500),
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000009a4', '1000000904', 'citizen', 'الموظف السعودي', 'employee', '000000a3-0000-0000-0000-000000000000', current_date - 300),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000009a5', '2000000905', 'resident', 'الموظف المقيم', 'employee', '000000a3-0000-0000-0000-000000000000', current_date - 200),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000009b1', '1000000911', 'citizen', 'المالك ب', 'owner', null, current_date - 500);

-- Compensation setups:
-- Saudi: Basic 10,000, Housing 2,500 => Contributory = 12,500.
-- Employee share (9.75%) = 1218.75; Employer share (11.75%) = 1468.75.
insert into employee_compensation (company_id, employee_id, basic_salary, housing_allowance, transport_allowance) values
  ('0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', 10000.00, 2500.00, 1000.00),
  -- Expat: Basic 6,000, Housing 1,500 => Contributory = 7,500.
  -- Employee share = 0; Employer share (2% hazards) = 150.00.
  ('0000000a-0000-0000-0000-000000000000', '000000a5-0000-0000-0000-000000000000', 6000.00, 1500.00, 500.00);

-- ---------------------------------------------------------------------------
-- 1. GOSI Engine tests
-- ---------------------------------------------------------------------------
select is(
  (select employee_share from private.calculate_gosi('000000a4-0000-0000-0000-000000000000')),
  1218.75,
  'Saudi citizen employee share is 9.75% of (basic + housing)'
);

select is(
  (select employer_share from private.calculate_gosi('000000a4-0000-0000-0000-000000000000')),
  1468.75,
  'Saudi citizen employer share is 11.75% of (basic + housing)'
);

select is(
  (select employee_share from private.calculate_gosi('000000a5-0000-0000-0000-000000000000')),
  0.00,
  'Resident employee GOSI share is 0'
);

select is(
  (select employer_share from private.calculate_gosi('000000a5-0000-0000-0000-000000000000')),
  150.00,
  'Resident employer GOSI share is 2% hazards'
);

-- Test 45,000 cap
update employee_compensation
set basic_salary = 40000.00, housing_allowance = 10000.00 -- 50,000 total
where employee_id = '000000a4-0000-0000-0000-000000000000';

select is(
  (select contributory_wage from private.calculate_gosi('000000a4-0000-0000-0000-000000000000')),
  45000.00,
  'GOSI contributory wage is strictly capped at 45,000 SAR'
);

-- Reset back to 10k basic
update employee_compensation
set basic_salary = 10000.00, housing_allowance = 2500.00
where employee_id = '000000a4-0000-0000-0000-000000000000';

-- ---------------------------------------------------------------------------
-- 2. Advance Requests creation and validation
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a4'); -- acting as employee a4

-- Cannot request with installment exceeding 50% of basic salary (Basic is 10,000, 50% is 5,000)
-- 12,000 over 2 months = 6,000 / month > 5,000
select throws_ok(
  $$ select advance_request_create(12000.00, 2, 'سلفة طارئة لتجديد السيارة') $$,
  'P0001',
  'installment_exceeds_salary_limit',
  'Cannot request an advance where monthly installment exceeds 50% of basic salary'
);

-- Valid request: 6,000 over 3 months = 2,000 / month <= 5,000
create temp table pg_temp.adv_id as
select advance_request_create(6000.00, 3, 'سلفة لتغطية مصاريف عائلية') as id;

select is(
  (select count(*) from advance_requests where employee_id = '000000a4-0000-0000-0000-000000000000' and status = 'pending'),
  1::bigint,
  'Advance request successfully created in pending status'
);

-- Concurrency check: cannot create second advance while one is pending
select throws_ok(
  $$ select advance_request_create(3000.00, 3, 'سلفة ثانية غير مسموحة') $$,
  'P0001',
  'existing_active_advance',
  'Cannot submit another advance while an active/pending advance exists'
);

-- ---------------------------------------------------------------------------
-- 3. RLS Visibility checks
-- ---------------------------------------------------------------------------
-- Employee a4 sees their own request
select is(
  (select count(*) from advance_requests),
  1::bigint,
  'Employee sees their own advance request'
);

-- Switch to manager a3: manager should see 0 advance requests (protected confidential info)
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a3');
select is(
  (select count(*) from advance_requests),
  0::bigint,
  'Manager cannot see employee advance requests (confidential compensation)'
);

-- Switch to HR a2: HR sees all advances in company
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a2');
select is(
  (select count(*) from advance_requests),
  1::bigint,
  'HR sees all company advance requests'
);

-- Switch to company B owner: sees 0 (strict tenant isolation)
select pg_temp.act_as('00000000-0000-0000-0000-0000000009b1');
select is(
  (select count(*) from advance_requests),
  0::bigint,
  'Company B cannot see advances from Company A'
);

-- ---------------------------------------------------------------------------
-- 4. Decision workflow
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a2'); -- HR

-- Cannot reject without note
select throws_ok(
  format('select advance_request_decide(%L, %L, null)', (select id from pg_temp.adv_id), 'rejected'),
  'P0001',
  'note_required',
  'Rejection requires a note'
);

-- HR approves the advance
select lives_ok(
  format('select advance_request_decide(%L, %L, %L)', (select id from pg_temp.adv_id), 'approved', 'تمت الموافقة وفق سياسة الشركة'),
  'HR successfully approves the advance request'
);

select is(
  (select status from advance_requests where id = (select id from pg_temp.adv_id)),
  'approved',
  'Advance request status is now approved'
);

-- ---------------------------------------------------------------------------
-- 5. Repayment & Early Settlement
-- ---------------------------------------------------------------------------
-- Repay partial amount: 2000 SAR
select lives_ok(
  format('select advance_manual_repayment(%L, 2000.00, %L)', (select id from pg_temp.adv_id), 'سداد نقدي مبكر للقسط الأول'),
  'Manual repayment succeeds'
);

select is(
  (select remaining_amount from advance_requests where id = (select id from pg_temp.adv_id)),
  4000.00,
  'Remaining amount correctly reduced to 4,000 SAR'
);

select is(
  (select status from advance_requests where id = (select id from pg_temp.adv_id)),
  'approved',
  'Advance remains approved while remaining > 0'
);

-- Repay remaining 4000 SAR (full settlement)
select lives_ok(
  format('select advance_manual_repayment(%L, 4000.00, %L)', (select id from pg_temp.adv_id), 'سداد باقي السلفة بالكامل'),
  'Full settlement repayment succeeds'
);

select is(
  (select remaining_amount from advance_requests where id = (select id from pg_temp.adv_id)),
  0.00,
  'Remaining amount is now 0'
);

select is(
  (select status from advance_requests where id = (select id from pg_temp.adv_id)),
  'completed',
  'Advance automatically flips to completed when remaining reaches 0'
);

-- ---------------------------------------------------------------------------
-- 6. Cancel pending request
-- ---------------------------------------------------------------------------
-- Employee a4 creates a new request now that previous is completed
select pg_temp.act_as('00000000-0000-0000-0000-0000000009a4');
create temp table pg_temp.adv_id_2 as
select advance_request_create(2500.00, 2, 'سلفة جديدة قابلة للإلغاء') as id;

-- Employee cancels their pending request
select lives_ok(
  format('select advance_request_cancel(%L)', (select id from pg_temp.adv_id_2)),
  'Employee can cancel their own pending request'
);

select is(
  (select status from advance_requests where id = (select id from pg_temp.adv_id_2)),
  'cancelled',
  'Request is now cancelled'
);

rollback;
