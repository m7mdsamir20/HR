-- Phase 2a: branches, shifts, check in/out with the geofence flag, suggested deductions, manual
-- corrections, the daily job, and who sees what.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(57);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
-- The suggested deduction for an employee, day and kind: its fraction of a day's pay (null if none).
create function pg_temp.frac(p_emp text, p_date date, p_kind text) returns numeric language sql security definer as $$
  select day_fraction from attendance_deductions where employee_id = p_emp::uuid and work_date = p_date and kind = p_kind;
$$;
grant execute on function pg_temp.frac(text, date, text) to authenticated;

-- How many rule rows an update touched, under the caller's own privileges (RLS applies).
create function pg_temp.set_tier2(p numeric) returns integer language plpgsql as $$
declare n integer;
begin
  update attendance_rules set late_tier2_fraction = p;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function pg_temp.set_tier2(numeric) to authenticated;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a1', '1000000701'); -- owner
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a2', '1000000702'); -- hr
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a3', '1000000703'); -- manager
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a4', '2000000704'); -- employee on the manager's team
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a5', '2000000705'); -- employee, no manager
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000b1', '1000000711'); -- other company owner

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 20, current_date + 30),
  ('0000000b-0000-0000-0000-000000000000', 'شركة ب', 20, current_date + 30);
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', '1000000701', 'citizen', 'مالك', 'owner', null),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', '1000000702', 'citizen', 'موارد', 'hr', null),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', '1000000703', 'citizen', 'مشرف', 'manager', null),
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4', '2000000704', 'resident', 'موظف 1', 'employee', '000000a3-0000-0000-0000-000000000000'),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5', '2000000705', 'resident', 'موظف 2', 'employee', null),
  ('000000a6-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', null, '2000000706', 'resident', 'موظف 3', 'employee', null),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', '1000000711', 'citizen', 'مالك ب', 'owner', null);
update employees set created_at = now() - interval '30 days';

-- Branch (Riyadh, 150 m), an all-day shift for the live check-in tests (always open, wide grace so
-- the test doesn't depend on the hour it runs), and an office shift 08:00-16:00 for the exact tiers.
insert into branches (id, company_id, name_ar, latitude, longitude, radius_m) values
  ('bb000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'الفرع الرئيسي', 24.713600, 46.675300, 150),
  ('bb000002-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', 'فرع ب', 21.543300, 39.172800, 150);
insert into shifts (id, company_id, name_ar, start_time, end_time, grace_minutes, work_days) values
  ('55000001-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'طوال اليوم', '00:00', '23:59', 120, array[0,1,2,3,4,5,6]),
  ('55000002-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 'مكتبي', '08:00', '16:00', 15, array[0,1,2,3,4,5,6]);

select is((select count(*) from attendance_rules), 2::bigint, 'every company gets its attendance rules');
select is(round(private.distance_m(24.0, 46.0, 25.0, 46.0)::numeric / 1000, 1), 111.2, 'the distance between two points a degree of latitude apart is about 111 km');

-- ---------------------------------------------------------------------------
-- Who edits branches, shifts, rules
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$insert into branches (company_id, name_ar, latitude, longitude) values ('0000000a-0000-0000-0000-000000000000', 'فرع', 24, 46)$$,
  '42501', null, 'an employee cannot add a branch');
select is((select count(*) from branches), 1::bigint, 'an employee sees their own company''s branch, not another company''s');
select is((select count(*) from attendance_rules), 0::bigint, 'attendance rules are not shown to employees');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$insert into branches (company_id, name_ar, latitude, longitude) values ('0000000a-0000-0000-0000-000000000000', 'فرع ثاني', 24.7, 46.7)$$, 'HR adds a branch');
select throws_ok($$insert into shifts (company_id, name_ar, start_time, end_time) values ('0000000a-0000-0000-0000-000000000000', 'معكوسة', '16:00', '08:00')$$,
  '23514', null, 'a shift must end after it starts');
select throws_ok($$insert into branches (company_id, name_ar, latitude, longitude) values ('0000000b-0000-0000-0000-000000000000', 'تسلل', 24, 46)$$,
  '42501', null, 'HR cannot add a branch to another company');
select is(pg_temp.set_tier2(0.3), 0,
  'HR cannot change the deduction rules: they decide how much pay is suggested');
select is((select count(*) from attendance_rules), 1::bigint, 'but HR can read them');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.set_tier2(0.3), 1, 'the owner changes the deduction rules');
reset role;
select is((select late_tier2_fraction from attendance_rules where company_id = '0000000a-0000-0000-0000-000000000000'), 0.3, 'and the change was saved');
update attendance_rules set late_tier2_fraction = 0.25;

-- ---------------------------------------------------------------------------
-- Assigning branch and shift
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$select public.attendance_assign(array['000000a4-0000-0000-0000-000000000000']::uuid[], 'bb000001-0000-0000-0000-000000000000', '55000001-0000-0000-0000-000000000000')$$,
  '42501', null, 'an employee cannot assign shifts');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select is(public.attendance_assign(array['000000a4-0000-0000-0000-000000000000', '000000a5-0000-0000-0000-000000000000']::uuid[],
  'bb000001-0000-0000-0000-000000000000', '55000001-0000-0000-0000-000000000000'), 2, 'HR assigns a branch and shift to two employees');
select is(public.attendance_assign(array['000000a6-0000-0000-0000-000000000000']::uuid[],
  'bb000001-0000-0000-0000-000000000000', '55000002-0000-0000-0000-000000000000'), 1, 'HR assigns the office shift to a third');
select throws_ok($$select public.attendance_assign(array['000000a1-0000-0000-0000-000000000000']::uuid[], 'bb000001-0000-0000-0000-000000000000', '55000001-0000-0000-0000-000000000000')$$,
  '42501', null, 'HR cannot assign the owner');
select throws_ok($$select public.attendance_assign(array['000000a4-0000-0000-0000-000000000000']::uuid[], 'bb000002-0000-0000-0000-000000000000', '55000001-0000-0000-0000-000000000000')$$,
  '23503', null, 'a branch from another company is refused');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.attendance_assign(array['000000a3-0000-0000-0000-000000000000']::uuid[], 'bb000001-0000-0000-0000-000000000000', '55000001-0000-0000-0000-000000000000'), 1,
  'the owner assigns any employee');
reset role;

-- ---------------------------------------------------------------------------
-- Check in and out (live clock, wide-open shift)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is((public.attendance_check_in(24.7136, 46.6753, 12) ->> 'outside')::boolean, false, 'checking in at the branch is inside the fence');
select is((select check_in_distance_m from attendance_records where employee_id = '000000a4-0000-0000-0000-000000000000'), 0, 'the distance from the branch is recorded');
select throws_ok($$select public.attendance_check_in(24.7136, 46.6753, 12)$$, 'P0001', 'already_checked_in', 'a second check-in the same day is refused');
select is((public.attendance_check_out(24.7136, 46.6753, 12) ->> 'outside')::boolean, false, 'checking out works');
select throws_ok($$select public.attendance_check_out(24.7136, 46.6753, 12)$$, 'P0001', 'already_checked_out', 'a second check-out is refused');
select throws_ok($$select public.attendance_check_in(24.7, null, null)$$, 'P0001', null, 'half a position is rejected');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select is((public.attendance_check_in(24.7236, 46.6753, 8) ->> 'outside')::boolean, true, 'checking in 1.1 km away is allowed but flagged');
select cmp_ok((select check_in_distance_m from attendance_records where employee_id = '000000a5-0000-0000-0000-000000000000'), '>', 1000, 'with the distance recorded');
select is((public.attendance_check_out(null, null, null) ->> 'outside')::boolean, true, 'with no position at all the check-out still works, and is flagged');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.attendance_check_in(24.7136, 46.6753, 5)$$, 'P0001', 'no_shift', 'someone with no shift assigned cannot check in');
reset role;

-- Who sees the records
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*) from attendance_records), 1::bigint, 'a manager sees their team''s attendance only');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*) from attendance_records), 1::bigint, 'an employee sees only their own record');
select throws_ok($$update attendance_records set late_minutes = 0$$, '42501', null, 'an employee cannot edit attendance directly');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from attendance_records), 0::bigint, 'another company''s owner sees none of it');
select throws_ok($$select public.attendance_correct('000000a4-0000-0000-0000-000000000000', current_date, '08:00', '16:00', 'محاولة')$$,
  '42501', null, 'nor can they correct it');
reset role;

-- ---------------------------------------------------------------------------
-- Exact tiers through manual corrections (office shift 08:00-16:00, grace 15, past days)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 2, '08:00', '16:00', null)$$,
  'P0001', null, 'a correction needs a note');
select throws_ok($$select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date + 1, '08:00', '16:00', 'مستقبل')$$,
  'P0001', null, 'and cannot be for a future day');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 2, '08:10', '16:00', 'حضور مسجل ورقياً');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 2, 'late'), null::numeric, 'arriving inside the grace period is not late');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 3, '08:20', '16:00', 'تأخير بسيط');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 3, 'late'), 0::numeric, '5 minutes past the grace: a warning (no deduction)');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 4, '08:40', '16:00', 'تأخير');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 4, 'late'), 0.25, '25 minutes past the grace: a quarter day');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 5, '09:00', '16:00', 'تأخير');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 5, 'late'), 0.5, '45 minutes past the grace: half a day');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 6, '10:00', '16:00', 'تأخير');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 6, 'late'), 1::numeric, 'over an hour past the grace: a full day');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 7, '08:00', '15:30', 'خروج مبكر');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 7, 'early_departure'), 0.063, 'leaving 30 minutes early costs that share of the 8-hour day');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 8, '08:00', '15:57', 'خروج');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 8, 'early_departure'), null::numeric, 'leaving within the early grace costs nothing');
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 9, null, null, 'غائب');
select is(pg_temp.frac('000000a6-0000-0000-0000-000000000000', current_date - 9, 'absence'), 1::numeric, 'an absence is a full day');

-- Decisions
select throws_ok($$select public.attendance_deduction_decide((select id from attendance_deductions where kind = 'absence'), 'waive', null)$$,
  'P0001', 'note_required', 'waiving a deduction needs a reason');
select lives_ok($$select public.attendance_deduction_decide((select id from attendance_deductions where kind = 'absence'), 'approve')$$, 'HR approves a deduction');
select throws_ok($$select public.attendance_deduction_decide((select id from attendance_deductions where kind = 'absence'), 'waive', 'سبب')$$,
  'P0001', 'already_decided', 'a decided deduction cannot be decided again');
-- Fixing the day afterwards doesn't rewrite what was decided
select public.attendance_correct('000000a6-0000-0000-0000-000000000000', current_date - 9, '08:00', '16:00', 'تصحيح بعد المراجعة');
select is((select status from attendance_deductions where kind = 'absence'), 'approved', 'an approved deduction survives a later correction of the day');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*) from attendance_deductions), 0::bigint, 'a manager does not see deductions');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select count(*) from attendance_deductions where employee_id <> '000000a4-0000-0000-0000-000000000000'), 0::bigint, 'an employee sees deductions of nobody but themself');
reset role;
select is((select count(*) from audit_logs where action = 'attendance.correct'), 9::bigint, 'every correction is audited');

-- ---------------------------------------------------------------------------
-- Ramadan, holidays and the daily job
-- ---------------------------------------------------------------------------
insert into company_calendar (company_id, kind, name_ar, start_date, end_date) values
  ('0000000a-0000-0000-0000-000000000000', 'ramadan', 'رمضان', current_date - 40, current_date - 30),
  ('0000000a-0000-0000-0000-000000000000', 'holiday', 'عطلة', current_date - 20, current_date - 20);
select is((select scheduled_minutes from private.shift_bounds('55000002-0000-0000-0000-000000000000', current_date - 35)), 360, 'during Ramadan the working day is six hours');
select is((select scheduled_minutes from private.shift_bounds('55000002-0000-0000-0000-000000000000', current_date - 10)), 480, 'outside Ramadan it is the full shift');
select is(private.is_work_day('55000002-0000-0000-0000-000000000000', current_date - 20), false, 'a holiday is not a working day');

update employees set hire_date = current_date where id = '000000a5-0000-0000-0000-000000000000';
select is(private.run_attendance_day(current_date - 10), 3, 'the job marks absent those scheduled to work with no record (not the one hired later)');
select is(private.run_attendance_day(current_date - 10), 0, 'running it again changes nothing');
select is(pg_temp.frac('000000a4-0000-0000-0000-000000000000', current_date - 10, 'absence'), 1::numeric, 'an absent day carries a full-day suggestion');
select is(private.run_attendance_day(current_date - 20), 0, 'on a holiday nobody is marked absent');

select * from finish();
rollback;

