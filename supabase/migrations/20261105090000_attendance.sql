-- Phase 2a: branches (geofence), shifts, calendar, deduction rules, attendance and suggested deductions.
-- README §2. Everything is computed in Asia/Riyadh time. Deductions are suggestions: they are
-- computed and stored here, HR approves or waives them, and payroll (phase 3) applies the money.
--
-- Write model: branches, shifts, calendar and rules are edited directly under RLS (owner / HR), like
-- departments. Attendance records and deductions are written only by the RPCs and the daily job.

-- ---------------------------------------------------------------------------
-- Branches (the geofence) and shifts
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name_ar text not null check (char_length(name_ar) between 2 and 80),
  name_en text check (char_length(name_en) between 2 and 80),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  radius_m integer not null default 150 check (radius_m between 20 and 5000),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name_ar)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name_ar text not null check (char_length(name_ar) between 2 and 80),
  name_en text check (char_length(name_en) between 2 and 80),
  start_time time not null,
  end_time time not null,
  grace_minutes smallint not null default 15 check (grace_minutes between 0 and 120),
  -- 0 = Sunday ... 6 = Saturday (extract(dow)). Default: Sunday to Thursday.
  work_days smallint[] not null default array[0, 1, 2, 3, 4]::smallint[]
    check (cardinality(work_days) between 1 and 7 and work_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  -- Working hours per day during Ramadan (README §2-أ); the shift then ends this long after it starts.
  ramadan_hours numeric(3, 1) not null default 6 check (ramadan_hours between 1 and 12),
  created_at timestamptz not null default now(),
  -- No overnight shifts in this phase: a shift starts and ends on the same day.
  check (end_time > start_time),
  unique (company_id, id),
  unique (company_id, name_ar)
);

alter table public.employees add column branch_id uuid, add column shift_id uuid;
alter table public.employees
  add constraint employees_branch_fk foreign key (company_id, branch_id) references public.branches (company_id, id),
  add constraint employees_shift_fk foreign key (company_id, shift_id) references public.shifts (company_id, id);
create index employees_shift on public.employees (shift_id);
create index employees_branch on public.employees (branch_id);

-- Holidays and the Ramadan period, as date ranges the company enters each year.
create table public.company_calendar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  kind text not null check (kind in ('holiday', 'ramadan')),
  name_ar text not null check (char_length(name_ar) between 2 and 80),
  name_en text check (char_length(name_en) between 2 and 80),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 45)
);
create index company_calendar_dates on public.company_calendar (company_id, start_date, end_date);

-- One row per company. Lateness is measured after the shift's grace period; the tiers are the
-- README's (up to 15 minutes: warning, to 30: a quarter day, to 60: half a day, beyond: a full day).
create table public.attendance_rules (
  company_id uuid primary key references public.companies (id),
  late_tier1_minutes smallint not null default 15 check (late_tier1_minutes between 1 and 240),
  late_tier2_minutes smallint not null default 30 check (late_tier2_minutes between 1 and 240),
  late_tier3_minutes smallint not null default 60 check (late_tier3_minutes between 1 and 480),
  late_tier1_fraction numeric(4, 3) not null default 0 check (late_tier1_fraction between 0 and 1),
  late_tier2_fraction numeric(4, 3) not null default 0.25 check (late_tier2_fraction between 0 and 1),
  late_tier3_fraction numeric(4, 3) not null default 0.5 check (late_tier3_fraction between 0 and 1),
  late_tier4_fraction numeric(4, 3) not null default 1 check (late_tier4_fraction between 0 and 1),
  early_grace_minutes smallint not null default 5 check (early_grace_minutes between 0 and 120),
  absence_fraction numeric(4, 3) not null default 1 check (absence_fraction between 0 and 3),
  updated_at timestamptz not null default now(),
  check (late_tier1_minutes < late_tier2_minutes and late_tier2_minutes < late_tier3_minutes)
);

create trigger attendance_rules_touch before update on public.attendance_rules
  for each row execute function private.touch_updated_at();

create function private.create_default_attendance_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.attendance_rules (company_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger companies_attendance_rules after insert on public.companies
  for each row execute function private.create_default_attendance_rules();
insert into public.attendance_rules (company_id) select id from public.companies on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Attendance and deductions
-- ---------------------------------------------------------------------------
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null,
  work_date date not null,
  -- The shift and branch the day was worked under (later reassignments don't rewrite history).
  shift_id uuid not null,
  branch_id uuid,
  status text not null default 'present' check (status in ('present', 'absent')),
  source text not null default 'device' check (source in ('device', 'manual')),
  check_in_at timestamptz,
  check_in_lat double precision check (check_in_lat between -90 and 90),
  check_in_lng double precision check (check_in_lng between -180 and 180),
  check_in_accuracy_m real check (check_in_accuracy_m between 0 and 100000),
  check_in_distance_m integer,
  check_in_outside boolean not null default false,
  check_out_at timestamptz,
  check_out_lat double precision check (check_out_lat between -90 and 90),
  check_out_lng double precision check (check_out_lng between -180 and 180),
  check_out_accuracy_m real check (check_out_accuracy_m between 0 and 100000),
  check_out_distance_m integer,
  check_out_outside boolean not null default false,
  late_minutes integer not null default 0,
  early_minutes integer not null default 0,
  worked_minutes integer,
  correction_note text check (char_length(correction_note) between 3 and 500),
  corrected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, work_date),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  foreign key (company_id, shift_id) references public.shifts (company_id, id),
  foreign key (company_id, branch_id) references public.branches (company_id, id),
  check ((status = 'absent') = (check_in_at is null)),
  check (check_out_at is null or (check_in_at is not null and check_out_at > check_in_at))
);
create index attendance_records_day on public.attendance_records (company_id, work_date);

create table public.attendance_deductions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null,
  work_date date not null,
  kind text not null check (kind in ('late', 'early_departure', 'absence')),
  minutes integer not null default 0 check (minutes >= 0),
  -- Share of one day's pay. 0 on a late arrival means a warning only.
  day_fraction numeric(4, 3) not null check (day_fraction between 0 and 3),
  status text not null default 'pending' check (status in ('pending', 'approved', 'waived')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  note text check (char_length(note) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, work_date, kind),
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  check ((status = 'pending') = (decided_at is null))
);
create index attendance_deductions_status on public.attendance_deductions (company_id, status, work_date);

-- ---------------------------------------------------------------------------
-- Calculation helpers
-- ---------------------------------------------------------------------------
create function private.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2));
$$;

-- Is this a working day for the shift (weekly off days and holidays excluded)?
create function private.is_work_day(p_shift uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shifts s
                 where s.id = p_shift and extract(dow from p_date)::smallint = any (s.work_days))
     and not exists (select 1 from public.company_calendar c
                     join public.shifts s on s.company_id = c.company_id
                     where s.id = p_shift and c.kind = 'holiday' and p_date between c.start_date and c.end_date);
$$;

-- The shift's start, end and grace for one date; Ramadan shortens the day to ramadan_hours.
create function private.shift_bounds(p_shift uuid, p_date date,
  out starts timestamptz, out ends timestamptz, out grace_minutes integer, out scheduled_minutes integer)
language sql stable security definer set search_path = '' as $$
  select
    (p_date + s.start_time) at time zone 'Asia/Riyadh',
    case when exists (select 1 from public.company_calendar c where c.company_id = s.company_id
                      and c.kind = 'ramadan' and p_date between c.start_date and c.end_date)
         then (p_date + s.start_time) at time zone 'Asia/Riyadh' + make_interval(mins => (s.ramadan_hours * 60)::integer)
         else (p_date + s.end_time) at time zone 'Asia/Riyadh' end,
    s.grace_minutes::integer,
    (extract(epoch from (
      case when exists (select 1 from public.company_calendar c where c.company_id = s.company_id
                        and c.kind = 'ramadan' and p_date between c.start_date and c.end_date)
           then make_interval(mins => (s.ramadan_hours * 60)::integer)
           else s.end_time - s.start_time end)) / 60)::integer
  from public.shifts s where s.id = p_shift;
$$;

-- Replaced in phase 2b by the real leave lookup; until then nobody is on approved leave.
create function private.has_approved_leave(p_employee uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$ select false; $$;

-- Brings one day's record and its suggested deductions in line with the recorded times.
-- Deductions someone already decided on are never touched.
create function private.recompute_attendance(p_record_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.attendance_records;
  w record;
  rules public.attendance_rules;
  v_late integer := 0;
  v_early integer := 0;
  v_late_fraction numeric;
begin
  select * into r from public.attendance_records where id = p_record_id;
  if not found then
    return;
  end if;
  select * into rules from public.attendance_rules where company_id = r.company_id;
  select * into w from private.shift_bounds(r.shift_id, r.work_date);

  if r.check_in_at is null then
    update public.attendance_records set late_minutes = 0, early_minutes = 0, worked_minutes = null where id = r.id;
    delete from public.attendance_deductions
      where company_id = r.company_id and employee_id = r.employee_id and work_date = r.work_date
        and kind in ('late', 'early_departure') and status = 'pending';
    insert into public.attendance_deductions (company_id, employee_id, work_date, kind, minutes, day_fraction)
    values (r.company_id, r.employee_id, r.work_date, 'absence', w.scheduled_minutes, rules.absence_fraction)
    on conflict (company_id, employee_id, work_date, kind) do update
      set minutes = excluded.minutes, day_fraction = excluded.day_fraction
      where public.attendance_deductions.status = 'pending';
    return;
  end if;

  v_late := greatest(0, ceil(extract(epoch from (r.check_in_at - (w.starts + make_interval(mins => w.grace_minutes)))) / 60)::integer);
  if r.check_out_at is not null then
    v_early := greatest(0, floor(extract(epoch from (w.ends - r.check_out_at)) / 60)::integer);
    if v_early <= rules.early_grace_minutes then
      v_early := 0;
    end if;
  end if;

  update public.attendance_records set
    late_minutes = v_late,
    early_minutes = v_early,
    worked_minutes = case when r.check_out_at is not null
                          then floor(extract(epoch from (r.check_out_at - r.check_in_at)) / 60)::integer end
  where id = r.id;

  delete from public.attendance_deductions
    where company_id = r.company_id and employee_id = r.employee_id and work_date = r.work_date
      and kind = 'absence' and status = 'pending';

  if v_late > 0 then
    v_late_fraction := case
      when v_late <= rules.late_tier1_minutes then rules.late_tier1_fraction
      when v_late <= rules.late_tier2_minutes then rules.late_tier2_fraction
      when v_late <= rules.late_tier3_minutes then rules.late_tier3_fraction
      else rules.late_tier4_fraction end;
    insert into public.attendance_deductions (company_id, employee_id, work_date, kind, minutes, day_fraction)
    values (r.company_id, r.employee_id, r.work_date, 'late', v_late, v_late_fraction)
    on conflict (company_id, employee_id, work_date, kind) do update
      set minutes = excluded.minutes, day_fraction = excluded.day_fraction
      where public.attendance_deductions.status = 'pending';
  else
    delete from public.attendance_deductions
      where company_id = r.company_id and employee_id = r.employee_id and work_date = r.work_date
        and kind = 'late' and status = 'pending';
  end if;

  if v_early > 0 then
    insert into public.attendance_deductions (company_id, employee_id, work_date, kind, minutes, day_fraction)
    values (r.company_id, r.employee_id, r.work_date, 'early_departure', v_early,
            round(least(1, v_early::numeric / greatest(w.scheduled_minutes, 1)), 3))
    on conflict (company_id, employee_id, work_date, kind) do update
      set minutes = excluded.minutes, day_fraction = excluded.day_fraction
      where public.attendance_deductions.status = 'pending';
  else
    delete from public.attendance_deductions
      where company_id = r.company_id and employee_id = r.employee_id and work_date = r.work_date
        and kind = 'early_departure' and status = 'pending';
  end if;
end;
$$;

-- Owner: any employee of the company (themself included, so an owner can clock in). HR: whoever
-- they manage under the usual role rule.
create function private.can_manage_attendance(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.auth_role()
    when 'owner' then exists (select 1 from public.employees e
                              where e.id = p_employee_id and e.company_id = private.auth_company_id() and e.status <> 'deleted')
    when 'hr' then private.can_manage_employee(p_employee_id)
    else false end;
$$;

-- Who may read an employee's attendance: owner and HR for everyone, a manager for their direct
-- team, and each employee for themself.
create function private.can_see_attendance(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = private.auth_company_id()
      and (private.auth_role() in ('owner', 'hr')
           or e.id = private.auth_employee_id()
           or (private.auth_role() = 'manager' and e.manager_id = private.auth_employee_id()))
  );
$$;

grant execute on function private.can_manage_attendance(uuid), private.can_see_attendance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: reads under policies; branches / shifts / calendar / rules are edited by owner and HR
-- ---------------------------------------------------------------------------
revoke all on public.branches, public.shifts, public.company_calendar, public.attendance_rules,
  public.attendance_records, public.attendance_deductions from anon;
revoke insert, update, delete, truncate on public.attendance_records, public.attendance_deductions from authenticated;
revoke insert, delete, truncate on public.attendance_rules from authenticated;

alter table public.branches enable row level security;
alter table public.shifts enable row level security;
alter table public.company_calendar enable row level security;
alter table public.attendance_rules enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_deductions enable row level security;

create policy branches_select on public.branches for select to authenticated
  using (company_id = (select private.auth_company_id()));
create policy branches_write on public.branches for all to authenticated
  using (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'))
  with check (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'));

create policy shifts_select on public.shifts for select to authenticated
  using (company_id = (select private.auth_company_id()));
create policy shifts_write on public.shifts for all to authenticated
  using (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'))
  with check (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'));

create policy calendar_select on public.company_calendar for select to authenticated
  using (company_id = (select private.auth_company_id()));
create policy calendar_write on public.company_calendar for all to authenticated
  using (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'))
  with check (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'));

create policy rules_select on public.attendance_rules for select to authenticated
  using (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'));
create policy rules_update on public.attendance_rules for update to authenticated
  using (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'))
  with check (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'));

create policy attendance_select on public.attendance_records for select to authenticated
  using (company_id = (select private.auth_company_id()) and private.can_see_attendance(employee_id));

-- Deductions affect pay: owner / HR, and the employee they concern. Managers don't see them.
create policy deductions_select on public.attendance_deductions for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and ((select private.auth_role()) in ('owner', 'hr') or employee_id = (select private.auth_employee_id()))
  );

create trigger branches_audit after insert or update or delete on public.branches
  for each row execute function private.audit_row_change('branch');
create trigger shifts_audit after insert or update or delete on public.shifts
  for each row execute function private.audit_row_change('shift');
create trigger calendar_audit after insert or update or delete on public.company_calendar
  for each row execute function private.audit_row_change('calendar');
create trigger attendance_rules_audit after update on public.attendance_rules
  for each row execute function private.audit_row_change('attendance_rules');

-- ---------------------------------------------------------------------------
-- Check in / out
-- ---------------------------------------------------------------------------
-- Time always comes from the server clock. Coordinates come from the browser and can be faked, so
-- they are recorded (with accuracy and distance) and a position outside the branch circle, or no
-- position at all, is flagged for HR instead of blocking the employee.
create function public.attendance_check_in(
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.auth_employee_id();
  v_emp public.employees;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_branch public.branches;
  w record;
  v_dist integer;
  v_outside boolean := true;
  v_existing public.attendance_records;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_emp from public.employees where id = v_me;
  if v_emp.shift_id is null or v_emp.branch_id is null then
    raise exception 'no_shift' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('attendance', v_me::text, 40, interval '10 minutes');

  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_accuracy < 0 or p_accuracy > 100000 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;
  if not private.is_work_day(v_emp.shift_id, v_today) then
    raise exception 'not_work_day' using errcode = 'P0001';
  end if;
  select * into w from private.shift_bounds(v_emp.shift_id, v_today);
  if now() >= w.ends then
    raise exception 'shift_over' using errcode = 'P0001';
  end if;

  select * into v_branch from public.branches where id = v_emp.branch_id;
  if p_lat is not null then
    v_dist := round(private.distance_m(v_branch.latitude::double precision, v_branch.longitude::double precision, p_lat, p_lng));
    v_outside := v_dist > v_branch.radius_m;
  end if;

  select * into v_existing from public.attendance_records
    where company_id = v_emp.company_id and employee_id = v_me and work_date = v_today for update;
  if found and v_existing.check_in_at is not null then
    raise exception 'already_checked_in' using errcode = 'P0001';
  end if;

  if found then
    update public.attendance_records set
      status = 'present', source = 'device', check_in_at = now(),
      check_in_lat = p_lat, check_in_lng = p_lng, check_in_accuracy_m = p_accuracy,
      check_in_distance_m = v_dist, check_in_outside = v_outside
    where id = v_existing.id returning id into v_id;
  else
    insert into public.attendance_records (company_id, employee_id, work_date, shift_id, branch_id,
      check_in_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m, check_in_outside)
    values (v_emp.company_id, v_me, v_today, v_emp.shift_id, v_emp.branch_id,
      now(), p_lat, p_lng, p_accuracy, v_dist, v_outside)
    returning id into v_id;
  end if;

  perform private.recompute_attendance(v_id);
  return jsonb_build_object('record_id', v_id, 'outside', v_outside);
end;
$$;

create function public.attendance_check_out(
  p_lat double precision default null, p_lng double precision default null, p_accuracy double precision default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.auth_employee_id();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  r public.attendance_records;
  v_branch public.branches;
  v_dist integer;
  v_outside boolean := true;
begin
  if v_me is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.take_rate_limit('attendance', v_me::text, 40, interval '10 minutes');

  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_accuracy < 0 or p_accuracy > 100000 then
    raise exception 'invalid_location' using errcode = 'P0001';
  end if;

  select * into r from public.attendance_records
    where employee_id = v_me and work_date = v_today and company_id = private.auth_company_id() for update;
  if not found or r.check_in_at is null then
    raise exception 'not_checked_in' using errcode = 'P0001';
  end if;
  if r.check_out_at is not null then
    raise exception 'already_checked_out' using errcode = 'P0001';
  end if;

  if p_lat is not null and r.branch_id is not null then
    select * into v_branch from public.branches where id = r.branch_id;
    v_dist := round(private.distance_m(v_branch.latitude::double precision, v_branch.longitude::double precision, p_lat, p_lng));
    v_outside := v_dist > v_branch.radius_m;
  end if;

  update public.attendance_records set
    check_out_at = greatest(now(), r.check_in_at + interval '1 second'),
    check_out_lat = p_lat, check_out_lng = p_lng, check_out_accuracy_m = p_accuracy,
    check_out_distance_m = v_dist, check_out_outside = v_outside
  where id = r.id;

  perform private.recompute_attendance(r.id);
  return jsonb_build_object('record_id', r.id, 'outside', v_outside);
end;
$$;

-- ---------------------------------------------------------------------------
-- Management RPCs (owner / HR)
-- ---------------------------------------------------------------------------
create function public.attendance_assign(p_employee_ids uuid[], p_branch_id uuid, p_shift_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_id uuid;
  v_count integer := 0;
begin
  if v_company is null or private.auth_role() not in ('owner', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_employee_ids), 0) not between 1 and 500 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('attendance_assign', v_company::text, 60, interval '10 minutes');

  foreach v_id in array p_employee_ids loop
    if not private.can_manage_attendance(v_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    update public.employees set branch_id = p_branch_id, shift_id = p_shift_id where id = v_id;
    v_count := v_count + 1;
  end loop;

  perform private.audit(v_company, 'attendance.assign', 'employee', null,
    jsonb_build_object('count', v_count, 'branch_id', p_branch_id, 'shift_id', p_shift_id));
  return v_count;
end;
$$;

-- Manual entry or fix for one day (a forgotten check-in, a visit outside the branch...). The note
-- is mandatory and the change is audited. Both times empty records the day as an absence.
create function public.attendance_correct(
  p_employee_id uuid, p_date date, p_check_in time, p_check_out time, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_emp public.employees;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_in timestamptz;
  v_out timestamptz;
  v_id uuid;
begin
  if v_company is null or not private.can_manage_attendance(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_date > v_today or p_date < v_today - 92 or char_length(btrim(coalesce(p_note, ''))) < 3
     or (p_check_in is null and p_check_out is not null) or (p_check_out is not null and p_check_out <= p_check_in) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('attendance_correct', v_company::text, 120, interval '10 minutes');

  select * into v_emp from public.employees where id = p_employee_id;
  if v_emp.shift_id is null then
    raise exception 'no_shift' using errcode = 'P0001';
  end if;

  v_in := case when p_check_in is not null then (p_date + p_check_in) at time zone 'Asia/Riyadh' end;
  v_out := case when p_check_out is not null then (p_date + p_check_out) at time zone 'Asia/Riyadh' end;
  if (v_in is not null and v_in > now()) or (v_out is not null and v_out > now()) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  insert into public.attendance_records (company_id, employee_id, work_date, shift_id, branch_id, status, source,
    check_in_at, check_out_at, correction_note, corrected_by)
  values (v_company, p_employee_id, p_date, v_emp.shift_id, v_emp.branch_id,
    case when v_in is null then 'absent' else 'present' end, 'manual', v_in, v_out, btrim(p_note), auth.uid())
  on conflict (company_id, employee_id, work_date) do update set
    status = excluded.status, source = 'manual', check_in_at = excluded.check_in_at, check_out_at = excluded.check_out_at,
    check_in_lat = null, check_in_lng = null, check_in_accuracy_m = null, check_in_distance_m = null, check_in_outside = false,
    check_out_lat = null, check_out_lng = null, check_out_accuracy_m = null, check_out_distance_m = null, check_out_outside = false,
    correction_note = excluded.correction_note, corrected_by = excluded.corrected_by
  returning id into v_id;

  perform private.recompute_attendance(v_id);
  perform private.audit(v_company, 'attendance.correct', 'attendance', v_id::text,
    jsonb_build_object('employee_id', p_employee_id, 'work_date', p_date));
  return v_id;
end;
$$;

create function public.attendance_deduction_decide(p_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  d public.attendance_deductions;
begin
  if v_company is null or private.auth_role() not in ('owner', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'waive') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  select * into d from public.attendance_deductions where id = p_id and company_id = v_company for update;
  if not found or not private.can_manage_attendance(d.employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if d.status <> 'pending' then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  if p_decision = 'waive' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('deduction_decide', v_company::text, 300, interval '10 minutes');

  update public.attendance_deductions set
    status = case p_decision when 'approve' then 'approved' else 'waived' end,
    decided_by = auth.uid(), decided_at = now(), note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;

  perform private.audit(v_company, 'deduction.' || p_decision, 'attendance_deduction', p_id::text,
    jsonb_build_object('kind', d.kind, 'work_date', d.work_date));
end;
$$;

revoke execute on function
  public.attendance_check_in(double precision, double precision, double precision),
  public.attendance_check_out(double precision, double precision, double precision),
  public.attendance_assign(uuid[], uuid, uuid),
  public.attendance_correct(uuid, date, time, time, text),
  public.attendance_deduction_decide(uuid, text, text)
from public, anon;
grant execute on function
  public.attendance_check_in(double precision, double precision, double precision),
  public.attendance_check_out(double precision, double precision, double precision),
  public.attendance_assign(uuid[], uuid, uuid),
  public.attendance_correct(uuid, date, time, time, text),
  public.attendance_deduction_decide(uuid, text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Daily job: closes a finished day. Anyone scheduled to work without a record is marked absent
-- (unless on approved leave), then every record of the day is recomputed. Idempotent.
-- ---------------------------------------------------------------------------
create function private.run_attendance_day(p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e record;
  r record;
  v_absent integer := 0;
  v_rows integer;
begin
  for e in
    select emp.id, emp.company_id, emp.shift_id, emp.branch_id
    from public.employees emp
    join public.companies c on c.id = emp.company_id and c.status = 'active' and c.subscription_ends_at >= p_date
    where emp.status = 'active' and emp.shift_id is not null
      and (emp.created_at at time zone 'Asia/Riyadh')::date <= p_date
      and (emp.hire_date is null or emp.hire_date <= p_date)
  loop
    if not private.is_work_day(e.shift_id, p_date) or private.has_approved_leave(e.id, p_date) then
      continue;
    end if;
    insert into public.attendance_records (company_id, employee_id, work_date, shift_id, branch_id, status)
    values (e.company_id, e.id, p_date, e.shift_id, e.branch_id, 'absent')
    on conflict (company_id, employee_id, work_date) do nothing;
    get diagnostics v_rows = row_count;
    v_absent := v_absent + v_rows;
  end loop;

  for r in select id from public.attendance_records where work_date = p_date loop
    perform private.recompute_attendance(r.id);
  end loop;
  return v_absent;
end;
$$;

-- 00:30 Riyadh (21:30 UTC) closes the previous day.
select cron.schedule('attendance-daily', '30 21 * * *',
  $$select private.run_attendance_day((now() at time zone 'Asia/Riyadh')::date - 1)$$);
