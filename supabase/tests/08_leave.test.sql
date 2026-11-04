-- Phase 2b: leave balances, the legal limits per type, the approval chain, attendance excusing,
-- cancellation, adjustments and who sees what.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(75);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
-- The Sunday of the week n weeks from now (the working week is Sunday to Thursday).
create function pg_temp.sunday(n integer) returns date language sql as $$
  select (date_trunc('week', current_date + n * 7)::date - 1);
$$;
create function pg_temp.req(p_type text, p_start date, p_end date) returns jsonb language sql as $$
  select jsonb_build_object('type', p_type, 'start_date', p_start, 'end_date', p_end);
$$;
create function pg_temp.status_of(p_id uuid) returns text language sql security definer as $$
  select status from leave_requests where id = p_id;
$$;
grant execute on function pg_temp.sunday(integer), pg_temp.req(text, date, date), pg_temp.status_of(uuid) to authenticated;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a1', '1000000801'); -- owner
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a2', '1000000802'); -- hr
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a3', '1000000803'); -- manager
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a4', '2000000804'); -- employee (male) on the manager's team
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a5', '2000000805'); -- employee (female), no manager, six years in
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000b1', '1000000811'); -- other company owner

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 20, current_date + 400),
  ('0000000b-0000-0000-0000-000000000000', 'شركة ب', 20, current_date + 400);
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id, gender, hire_date) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', '1000000801', 'citizen', 'مالك', 'owner', null, 'male', current_date - 3000),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', '1000000802', 'citizen', 'موارد', 'hr', null, 'female', current_date - 1000),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', '1000000803', 'citizen', 'مشرف', 'manager', null, 'male', current_date - 1000),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', '1000000811', 'citizen', 'مالك ب', 'owner', null, 'male', current_date - 1000);
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id, gender, hire_date) values
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4', '2000000804', 'resident', 'موظف 1', 'employee', '000000a3-0000-0000-0000-000000000000', 'male', current_date - 730),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5', '2000000805', 'resident', 'موظفة 2', 'employee', null, 'female', current_date - 2200);
update employees set created_at = now() - interval '4000 days';

insert into shifts (id, company_id, name_ar, start_time, end_time, work_days) values
  ('55000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'مكتبي', '08:00', '16:00', array[0,1,2,3,4]);
update employees set shift_id = '55000001-0000-0000-0000-000000000000' where company_id = '0000000a-0000-0000-0000-000000000000';

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Balances
-- ---------------------------------------------------------------------------
select is((private.leave_balance_of('000000a4-0000-0000-0000-000000000000') ->> 'annual_earned')::numeric, 42::numeric, 'two years in: 21 days a year accrued so far');
select is((private.leave_balance_of('000000a4-0000-0000-0000-000000000000') ->> 'annual_entitlement')::integer, 21, 'under five years the yearly entitlement is 21 days');
select is((private.leave_balance_of('000000a5-0000-0000-0000-000000000000') ->> 'annual_entitlement')::integer, 30, 'after five years it is 30 days');

-- ---------------------------------------------------------------------------
-- Requests and the path they take
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
insert into ids select 'emp1', public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(2), pg_temp.sunday(2) + 6));
select is(pg_temp.status_of((select id from ids where name = 'emp1')), 'pending_manager', 'an employee with a manager goes to the manager first');
select is((select days from leave_requests where id = (select id from ids where name = 'emp1')), 5, 'a week from Sunday to Saturday charges five working days');
select throws_ok($$select public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(2) + 2, pg_temp.sunday(2) + 3))$$, 'P0001', 'overlap', 'overlapping an open request is refused');
select throws_ok($$select public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(3), pg_temp.sunday(3) + 100))$$, 'P0001', 'insufficient_balance', 'more annual days than the balance is refused');
select throws_ok($$select public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(3) + 5, pg_temp.sunday(3) + 6))$$, 'P0001', 'no_working_days', 'a leave made only of rest days charges nothing and is refused');
select throws_ok($$select public.leave_request_create(pg_temp.req('annual', current_date - 90, current_date - 88))$$, 'P0001', 'invalid_dates', 'leave cannot start more than 30 days in the past');
select throws_ok($$select public.leave_request_create(pg_temp.req('marriage', pg_temp.sunday(4), pg_temp.sunday(4) + 13))$$, 'P0001', 'special_limit', 'marriage leave is capped at five days');
select throws_ok($$select public.leave_request_create(pg_temp.req('maternity', pg_temp.sunday(4), pg_temp.sunday(4) + 40))$$, 'P0001', 'gender_required', 'maternity leave is for female employees');
select lives_ok($$insert into ids select 'hajj', public.leave_request_create(pg_temp.req('hajj', pg_temp.sunday(8), pg_temp.sunday(8) + 11))$$, 'Hajj leave of 12 days after two years of service');
select throws_ok($$select public.leave_request_create(pg_temp.req('hajj', pg_temp.sunday(12), pg_temp.sunday(12) + 11))$$, 'P0001', 'hajj_used', 'Hajj leave only once in service');
select throws_ok($$insert into leave_requests (company_id, employee_id, type, start_date, end_date, days, status) values ('0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', 'annual', current_date, current_date, 1, 'approved')$$,
  '42501', null, 'requests cannot be written directly');
reset role;

select is((select count(*) from notifications where type = 'leave_requested' and recipient_id = '000000a3-0000-0000-0000-000000000000'), 2::bigint, 'the manager is told of both requests from their team member');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
insert into ids select 'emp2', public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(2), pg_temp.sunday(2) + 6));
select is(pg_temp.status_of((select id from ids where name = 'emp2')), 'pending_hr', 'with no manager the request goes straight to HR');
select throws_ok($$select public.leave_request_create(pg_temp.req('maternity', pg_temp.sunday(5), pg_temp.sunday(5) + 89))$$, 'P0001', 'special_limit', 'maternity leave is capped at 12 weeks');
select throws_ok($$select public.leave_request_create(pg_temp.req('newborn', pg_temp.sunday(5), pg_temp.sunday(5) + 2))$$, 'P0001', 'gender_required', 'newborn leave is for the father');
select throws_ok($$select public.leave_request_create(pg_temp.req('hajj', pg_temp.sunday(8), pg_temp.sunday(8) + 8))$$, 'P0001', 'special_limit', 'Hajj leave is 10 to 15 days');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
insert into ids select 'hr1', public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(2), pg_temp.sunday(2) + 6));
select is(pg_temp.status_of((select id from ids where name = 'hr1')), 'pending_hr', 'an HR request waits for a decision too');
reset role;
select is((select count(*) from notifications where type = 'leave_requested' and leave_id = (select id from ids where name = 'hr1')), 1::bigint, 'and only the owner is told about it');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
insert into ids select 'mgr1', public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(2), pg_temp.sunday(2) + 6));
select is(pg_temp.status_of((select id from ids where name = 'mgr1')), 'pending_hr', 'a manager''s own request goes to HR');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into ids select 'own1', public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(2), pg_temp.sunday(2) + 6));
select is(pg_temp.status_of((select id from ids where name = 'own1')), 'approved', 'the owner''s own leave is recorded as approved');
reset role;

-- ---------------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'emp1'), 'approve')$$, '42501', null, 'nobody decides their own request');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'emp1'), 'approve')$$, '42501', null, 'HR cannot jump the manager''s step');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'hr1'), 'approve')$$, '42501', null, 'HR cannot approve their own leave');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'emp2'), 'reject')$$, 'P0001', 'note_required', 'a rejection needs a reason');
select lives_ok($$select public.leave_request_decide((select id from ids where name = 'emp2'), 'approve', 'موافق')$$, 'HR gives the final approval of an employee''s request');
select is(pg_temp.status_of((select id from ids where name = 'emp2')), 'approved', 'which approves it');
select lives_ok($$select public.leave_request_decide((select id from ids where name = 'mgr1'), 'approve')$$, 'HR approves a manager''s request');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'emp1'), 'approve')$$, '42501', null, 'an employee cannot decide a colleague''s request');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok($$select public.leave_request_decide((select id from ids where name = 'emp1'), 'approve')$$, 'the direct manager approves their team member''s request');
select is(pg_temp.status_of((select id from ids where name = 'emp1')), 'pending_hr', 'which moves it on to HR');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'emp1'), 'approve')$$, '42501', null, 'the manager has no say at the HR step');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$select public.leave_request_decide((select id from ids where name = 'emp1'), 'approve')$$, 'HR completes it');
reset role;
select is(pg_temp.status_of((select id from ids where name = 'emp1')), 'approved', 'and it is approved');
select is((select count(*) from notifications where type = 'leave_decided' and recipient_id = '000000a4-0000-0000-0000-000000000000'), 1::bigint, 'the employee is told the outcome');
select is((select days_full from leave_requests where id = (select id from ids where name = 'emp1')), 5, 'an annual leave is paid in full');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.leave_request_decide((select id from ids where name = 'hr1'), 'approve')$$, 'the owner approves an HR request');
select lives_ok($$select public.leave_request_decide((select id from ids where name = 'hajj'), 'reject', 'خارج موسم الحج')$$, 'and can reject at the manager step');
select is(pg_temp.status_of((select id from ids where name = 'hajj')), 'rejected', 'a rejected request stays rejected');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'hajj'), 'approve')$$, 'P0001', 'already_decided', 'and cannot be decided again');
reset role;

-- A rejected request frees its days and its Hajj slot
select is((private.leave_balance_of('000000a4-0000-0000-0000-000000000000') ->> 'hajj_taken')::boolean, false, 'a rejected Hajj request frees the one allowed Hajj leave');
select is((private.leave_balance_of('000000a4-0000-0000-0000-000000000000') ->> 'annual_remaining')::numeric, 37::numeric, 'the balance now holds 42 earned minus 5 approved days');

-- ---------------------------------------------------------------------------
-- Sick leave tiers (fixtures: 25 days approved earlier this year, then 10 days approved now)
-- ---------------------------------------------------------------------------
insert into leave_requests (company_id, employee_id, type, start_date, end_date, days, status, days_full, days_three_quarter, days_unpaid) values
  ('0000000a-0000-0000-0000-000000000000', '000000a5-0000-0000-0000-000000000000', 'sick', date_trunc('year', current_date)::date, date_trunc('year', current_date)::date + 24, 25, 'approved', 25, 0, 0);
insert into ids select 'sick', gen_random_uuid();
insert into leave_requests (id, company_id, employee_id, type, start_date, end_date, days, status)
  select id, '0000000a-0000-0000-0000-000000000000', '000000a5-0000-0000-0000-000000000000', 'sick', date_trunc('year', current_date)::date + 31, date_trunc('year', current_date)::date + 40, 10, 'pending_hr' from ids where name = 'sick';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.leave_request_decide((select id from ids where name = 'sick'), 'approve');
reset role;
select is((select days_full || '/' || days_three_quarter || '/' || days_unpaid from leave_requests where id = (select id from ids where name = 'sick')), '5/5/0',
  'the 26th to 35th sick days: five on full pay, five on three quarters');
select is((private.leave_balance_of('000000a5-0000-0000-0000-000000000000') ->> 'sick_remaining')::integer, 85, 'of the 120 sick days a year, 85 are left');

-- The 120-day cap is counted in the year the leave falls in
select is(private.sick_days_in_year('000000a5-0000-0000-0000-000000000000', extract(year from current_date)::integer, null), 35, 'sick days are counted per calendar year');
select is(private.sick_days_in_year('000000a5-0000-0000-0000-000000000000', extract(year from current_date)::integer + 1, null), 0, 'and next year starts from zero');
insert into ids select 'sick2', gen_random_uuid();
insert into leave_requests (id, company_id, employee_id, type, start_date, end_date, days, status)
  select id, '0000000a-0000-0000-0000-000000000000', '000000a5-0000-0000-0000-000000000000', 'sick', date_trunc('year', current_date)::date + 60, date_trunc('year', current_date)::date + 149, 90, 'pending_hr' from ids where name = 'sick2';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'sick2'), 'approve')$$, 'P0001', 'sick_limit', 'approval re-checks the yearly sick cap (35 + 90 is over 120)');
reset role;

-- ---------------------------------------------------------------------------
-- Attendance: approved leave is excused
-- ---------------------------------------------------------------------------
insert into attendance_records (company_id, employee_id, work_date, shift_id, status) values
  ('0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', current_date - 5, '55000001-0000-0000-0000-000000000000', 'absent');
insert into attendance_deductions (company_id, employee_id, work_date, kind, minutes, day_fraction) values
  ('0000000a-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', current_date - 5, 'absence', 480, 1);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
insert into ids select 'past', public.leave_request_create(pg_temp.req('annual', current_date - 6, current_date - 1));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select public.leave_request_decide((select id from ids where name = 'past'), 'approve');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select public.leave_request_decide((select id from ids where name = 'past'), 'approve');
reset role;
select is((select count(*) from attendance_records where employee_id = '000000a4-0000-0000-0000-000000000000' and status = 'absent'), 0::bigint, 'approving leave removes the absent days it covers');
select is((select count(*) from attendance_deductions where employee_id = '000000a4-0000-0000-0000-000000000000' and kind = 'absence'), 0::bigint, 'and their pending absence suggestions');
select is(private.has_approved_leave('000000a4-0000-0000-0000-000000000000', current_date - 3), true, 'a day inside approved leave counts as excused');
select is(private.has_approved_leave('000000a4-0000-0000-0000-000000000000', current_date + 1), false, 'a day outside it does not');

-- ---------------------------------------------------------------------------
-- Cancelling, adjustments, visibility, export
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
insert into ids select 'again', public.leave_request_create(pg_temp.req('annual', pg_temp.sunday(6), pg_temp.sunday(6) + 3));
select lives_ok($$select public.leave_request_cancel((select id from ids where name = 'again'))$$, 'an employee withdraws a request that is still waiting');
select throws_ok($$select public.leave_request_cancel((select id from ids where name = 'emp1'), 'غيرت رأيي')$$, '42501', null, 'but not one that was approved');
reset role;
select is(pg_temp.status_of((select id from ids where name = 'again')), 'cancelled', 'the withdrawn request is cancelled');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.leave_request_cancel((select id from ids where name = 'emp1'))$$, 'P0001', 'note_required', 'cancelling an approved leave needs a reason');
select lives_ok($$select public.leave_request_cancel((select id from ids where name = 'emp1'), 'ظرف عمل طارئ')$$, 'HR cancels an approved leave with a reason');
reset role;
select is((private.leave_balance_of('000000a4-0000-0000-0000-000000000000') ->> 'annual_remaining')::numeric, 37::numeric - 0::numeric + 5 - (select days from leave_requests where id = (select id from ids where name = 'past')),
  'the cancelled days return to the balance');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$select public.leave_adjust('000000a4-0000-0000-0000-000000000000', 10, 'رصيد افتتاحي')$$, 'HR adds an opening balance');
select throws_ok($$select public.leave_adjust('000000a2-0000-0000-0000-000000000000', 5, 'لنفسي')$$, '42501', null, 'HR cannot adjust their own balance');
select throws_ok($$select public.leave_adjust('000000a1-0000-0000-0000-000000000000', 5, 'للمالك')$$, '42501', null, 'nor the owner''s');
reset role;
select is((private.leave_balance_of('000000a4-0000-0000-0000-000000000000') ->> 'annual_adjustments')::numeric, 10::numeric, 'the adjustment shows in the balance');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$select public.leave_adjust('000000a4-0000-0000-0000-000000000000', 30, 'لنفسي')$$, '42501', null, 'an employee cannot adjust their balance');
select is((select count(*) from leave_adjustments), 1::bigint, 'but can see the adjustments made to theirs');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(distinct employee_id) from leave_requests), 2::bigint, 'a manager sees their own and their team''s requests');
select throws_ok($$select public.leave_balance('000000a5-0000-0000-0000-000000000000')$$, '42501', null, 'but not the balance of someone outside the team');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select is(public.leave_request_trail((select id from ids where name = 'emp2')) ->> 'decider_name_ar', 'موارد', 'the printed copy names who approved the leave');
select is(public.leave_request_trail((select id from ids where name = 'emp1')), null, 'and gives nothing for someone else''s request');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select is((select count(distinct employee_id) from leave_requests), 1::bigint, 'an employee sees only their own requests');
select throws_ok($$select public.record_export('leave_request', (select id from ids where name = 'emp1'))$$, '42501', null, 'and cannot export someone else''s leave');
select lives_ok($$select public.record_export('leave_request', (select id from ids where name = 'emp2'))$$, 'but can export their own approved leave');
select throws_ok($$select public.record_export('leave_request', (select id from ids where name = 'again'))$$, '42501', null, 'and a cancelled request cannot be exported at all');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from leave_requests), 0::bigint, 'another company sees no leave at all');
select throws_ok($$select public.leave_request_decide((select id from ids where name = 'hr1'), 'reject', 'محاولة')$$, '42501', null, 'and cannot decide on it');
reset role;

select * from finish();
rollback;
