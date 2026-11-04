-- Phase 2b: leave management (README §4). Saudi Labor Law figures live here as constants:
--   annual   21 days a year, 30 after five years of service (art. 109), accrued day by day
--   sick     120 days a calendar year: 30 on full pay, 60 on three quarters, 30 unpaid (art. 117)
--   marriage 5 days, death 5, newborn 3 (father), Hajj 10-15 once after two years, maternity 12 weeks
-- Days are counted as working days of the employee's shift (weekly rest days and company holidays
-- inside a leave aren't charged), except sick, Hajj and maternity, which run on calendar days.
-- Approval: employee -> direct manager -> HR; the owner can decide at any stage; an HR request goes
-- to the owner; an owner's own request is recorded as approved. Approved leave is "excused" in
-- attendance. Every write goes through the RPCs below.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null,
  type text not null check (type in ('annual', 'sick', 'marriage', 'death', 'newborn', 'hajj', 'maternity')),
  start_date date not null,
  end_date date not null,
  days integer not null check (days > 0),
  reason text check (char_length(reason) between 3 and 500),
  -- The reference number of the Sehhaty sick report, when there is one (the file isn't stored).
  medical_ref text check (medical_ref ~ '^[A-Za-z0-9-]{4,40}$'),
  status text not null check (status in ('pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled')),
  -- How the days are paid, fixed when the request is approved (payroll reads these in phase 3).
  days_full integer check (days_full >= 0),
  days_three_quarter integer check (days_three_quarter >= 0),
  days_unpaid integer check (days_unpaid >= 0),
  manager_approved_by uuid references auth.users (id) on delete set null,
  manager_approved_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) between 3 and 500),
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 200),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);
create index leave_requests_employee on public.leave_requests (employee_id, start_date);
create index leave_requests_company_status on public.leave_requests (company_id, status);

-- Manual corrections to the annual balance: the opening balance of an employee who joined before
-- the platform, a carried-over amount, a correction. Positive adds days, negative removes them.
create table public.leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null,
  days numeric(6, 2) not null check (days between -365 and 365 and days <> 0),
  reason text not null check (char_length(reason) between 3 and 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);
create index leave_adjustments_employee on public.leave_adjustments (employee_id);

-- Notifications about leave
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned', 'task_submitted', 'task_approved', 'task_changes_requested', 'document_expiring', 'leave_requested', 'leave_decided'));
alter table public.notifications add column leave_id uuid references public.leave_requests (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- RLS: reads only; writes are RPCs
-- ---------------------------------------------------------------------------
revoke all on public.leave_requests, public.leave_adjustments from anon;
revoke insert, update, delete, truncate on public.leave_requests, public.leave_adjustments from authenticated;
alter table public.leave_requests enable row level security;
alter table public.leave_adjustments enable row level security;

create policy leave_select on public.leave_requests for select to authenticated
  using (company_id = (select private.auth_company_id()) and private.can_see_attendance(employee_id));
-- Adjustments change an employee's balance: owner / HR and the employee concerned.
create policy leave_adjustments_select on public.leave_adjustments for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and ((select private.auth_role()) in ('owner', 'hr') or employee_id = (select private.auth_employee_id()))
  );

-- ---------------------------------------------------------------------------
-- Calculations
-- ---------------------------------------------------------------------------
create function private.leave_start(p_employee uuid) returns date
language sql stable security definer set search_path = '' as $$
  select coalesce(hire_date, (created_at at time zone 'Asia/Riyadh')::date) from public.employees where id = p_employee;
$$;

-- Annual leave earned so far: 21/365 a day for the first five years, 30/365 after, in half days.
create function private.annual_earned(p_employee uuid, p_as_of date) returns numeric
language sql stable security definer set search_path = '' as $$
  with s as (select private.leave_start(p_employee) as d)
  select coalesce(floor((
      21.0 * greatest(0, least(p_as_of - s.d, (s.d + interval '5 years')::date - s.d)) / 365
    + 30.0 * greatest(0, p_as_of - (s.d + interval '5 years')::date) / 365
  ) * 2) / 2, 0)
  from s;
$$;

-- Days a request charges: working days of the shift, or calendar days for sick, Hajj and maternity.
create function private.leave_day_count(p_employee uuid, p_type text, p_start date, p_end date) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  v_shift uuid;
  v_days integer := 0;
  d date;
begin
  if p_type in ('sick', 'hajj', 'maternity') then
    return p_end - p_start + 1;
  end if;
  select shift_id into v_shift from public.employees where id = p_employee;
  if v_shift is null then
    raise exception 'no_shift' using errcode = 'P0001';
  end if;
  for d in select g::date from generate_series(p_start, p_end, interval '1 day') as g loop
    if private.is_work_day(v_shift, d) then
      v_days := v_days + 1;
    end if;
  end loop;
  return v_days;
end;
$$;

-- Balances for one employee. "pending" days are reserved so two requests can't spend the same days.
create function private.leave_balance_of(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_earned numeric := private.annual_earned(p_employee, v_today);
  v_adjust numeric;
  v_used numeric;
  v_pending numeric;
  v_sick_used integer;
  v_sick_pending integer;
  v_hajj boolean;
  v_start date := private.leave_start(p_employee);
begin
  select coalesce(sum(days), 0) into v_adjust from public.leave_adjustments where employee_id = p_employee;
  select coalesce(sum(days) filter (where status = 'approved'), 0), coalesce(sum(days) filter (where status in ('pending_manager', 'pending_hr')), 0)
    into v_used, v_pending
    from public.leave_requests where employee_id = p_employee and type = 'annual';
  select coalesce(sum(days) filter (where status = 'approved'), 0), coalesce(sum(days) filter (where status in ('pending_manager', 'pending_hr')), 0)
    into v_sick_used, v_sick_pending
    from public.leave_requests
    where employee_id = p_employee and type = 'sick' and extract(year from start_date) = extract(year from v_today);
  select exists (select 1 from public.leave_requests where employee_id = p_employee and type = 'hajj' and status in ('pending_manager', 'pending_hr', 'approved'))
    into v_hajj;

  return jsonb_build_object(
    'years_of_service', round((v_today - v_start)::numeric / 365, 1),
    'annual_entitlement', case when v_today >= (v_start + interval '5 years')::date then 30 else 21 end,
    'annual_earned', v_earned,
    'annual_adjustments', v_adjust,
    'annual_used', v_used,
    'annual_pending', v_pending,
    'annual_remaining', v_earned + v_adjust - v_used - v_pending,
    'sick_used', v_sick_used,
    'sick_pending', v_sick_pending,
    'sick_remaining', 120 - v_sick_used - v_sick_pending,
    'hajj_taken', v_hajj
  );
end;
$$;

-- Fixes how a sick request is paid (first 30 days full, next 60 three quarters, last 30 unpaid,
-- counted over the calendar year) and excuses the days in attendance. Run once, on final approval.
create function private.apply_approved_leave(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
  v_before integer := 0;
  v_after integer;
  v_full integer;
  v_three integer := 0;
  v_unpaid integer := 0;
begin
  select * into r from public.leave_requests where id = p_request_id;
  if r.type = 'sick' then
    select coalesce(sum(days), 0) into v_before
      from public.leave_requests
      where employee_id = r.employee_id and type = 'sick' and status = 'approved' and id <> r.id
        and extract(year from start_date) = extract(year from r.start_date);
    v_after := v_before + r.days;
    v_full := greatest(0, least(v_after, 30) - least(v_before, 30));
    v_three := greatest(0, least(v_after, 90) - greatest(v_before, 30));
    v_unpaid := greatest(0, v_after - greatest(v_before, 90));
  else
    v_full := r.days;
  end if;
  update public.leave_requests set days_full = v_full, days_three_quarter = v_three, days_unpaid = v_unpaid where id = r.id;

  -- Days already marked absent that this leave now excuses: remove the record and its pending suggestion.
  -- A decided deduction stays; HR sees it and waives it by hand.
  delete from public.attendance_deductions
    where employee_id = r.employee_id and work_date between r.start_date and r.end_date and kind = 'absence' and status = 'pending';
  delete from public.attendance_records
    where employee_id = r.employee_id and work_date between r.start_date and r.end_date and status = 'absent'
      and not exists (select 1 from public.attendance_deductions d
                      where d.employee_id = attendance_records.employee_id and d.work_date = attendance_records.work_date and d.kind = 'absence');
end;
$$;

-- The attendance job treats approved leave as excused.
create or replace function private.has_approved_leave(p_employee uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leave_requests
                 where employee_id = p_employee and status = 'approved' and p_date between start_date and end_date);
$$;

create function private.notify_leave(p_company uuid, p_recipient uuid, p_type text, p_leave uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (company_id, recipient_id, actor_id, type, leave_id)
  select p_company, p_recipient, private.auth_employee_id(), p_type, p_leave
  where p_recipient is not null and p_recipient is distinct from private.auth_employee_id();
$$;

-- Tells whoever must decide the request now.
create function private.notify_leave_approvers(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
  e public.employees;
  a record;
begin
  select * into r from public.leave_requests where id = p_request_id;
  select * into e from public.employees where id = r.employee_id;
  if r.status = 'pending_manager' then
    perform private.notify_leave(r.company_id, e.manager_id, 'leave_requested', r.id);
  elsif r.status = 'pending_hr' then
    for a in
      select id from public.employees
      where company_id = r.company_id and status = 'active' and id <> r.employee_id
        and (role = 'owner' or (role = 'hr' and e.role in ('manager', 'employee')))
    loop
      perform private.notify_leave(r.company_id, a.id, 'leave_requested', r.id);
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create function public.leave_balance(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.auth_company_id() is null or not private.can_see_attendance(p_employee) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.leave_balance_of(p_employee);
end;
$$;

create function public.leave_request_create(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.auth_employee_id();
  v_company uuid := private.auth_company_id();
  v_role public.employee_role := private.auth_role();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_type text := private.txt(p, 'type');
  v_start date := private.txt(p, 'start_date')::date;
  v_end date := private.txt(p, 'end_date')::date;
  e public.employees;
  v_days integer;
  v_balance jsonb;
  v_status text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.take_rate_limit('leave_request', v_me::text, 20, interval '10 minutes');
  -- Serialize this employee's requests so two at once can't spend the same balance.
  select * into e from public.employees where id = v_me for update;

  if v_type is null or v_start is null or v_end is null or v_end < v_start
     or v_start < v_today - 30 or v_start > v_today + 365 then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.leave_requests
             where employee_id = v_me and status in ('pending_manager', 'pending_hr', 'approved')
               and v_start <= end_date and v_end >= start_date) then
    raise exception 'overlap' using errcode = 'P0001';
  end if;

  v_days := private.leave_day_count(v_me, v_type, v_start, v_end);
  if v_days < 1 then
    raise exception 'no_working_days' using errcode = 'P0001';
  end if;
  v_balance := private.leave_balance_of(v_me);

  case v_type
    when 'annual' then
      if v_days > (v_balance ->> 'annual_remaining')::numeric then
        raise exception 'insufficient_balance' using errcode = 'P0001';
      end if;
    when 'sick' then
      if extract(year from v_start) <> extract(year from v_end) then
        raise exception 'cross_year' using errcode = 'P0001';
      end if;
      if v_days > (v_balance ->> 'sick_remaining')::integer then
        raise exception 'sick_limit' using errcode = 'P0001';
      end if;
    when 'marriage', 'death' then
      if v_days > 5 then raise exception 'special_limit' using errcode = 'P0001'; end if;
    when 'newborn' then
      if e.gender is distinct from 'male' then raise exception 'gender_required' using errcode = 'P0001'; end if;
      if v_days > 3 then raise exception 'special_limit' using errcode = 'P0001'; end if;
    when 'maternity' then
      if e.gender is distinct from 'female' then raise exception 'gender_required' using errcode = 'P0001'; end if;
      if v_days > 84 then raise exception 'special_limit' using errcode = 'P0001'; end if;
    when 'hajj' then
      if (v_balance ->> 'hajj_taken')::boolean then raise exception 'hajj_used' using errcode = 'P0001'; end if;
      if v_today - private.leave_start(v_me) < 730 then raise exception 'hajj_service' using errcode = 'P0001'; end if;
      if v_days not between 10 and 15 then raise exception 'special_limit' using errcode = 'P0001'; end if;
    else
      raise exception 'invalid_dates' using errcode = 'P0001';
  end case;

  v_status := case
    when v_role = 'owner' then 'approved'
    when v_role = 'employee' and e.manager_id is not null
         and exists (select 1 from public.employees m where m.id = e.manager_id and m.status = 'active' and m.role = 'manager')
      then 'pending_manager'
    else 'pending_hr' end;

  insert into public.leave_requests (company_id, employee_id, type, start_date, end_date, days, reason, medical_ref, status,
    decided_by, decided_at)
  values (v_company, v_me, v_type, v_start, v_end, v_days, private.txt(p, 'reason'),
    case when v_type = 'sick' then private.txt(p, 'medical_ref') end, v_status,
    case when v_status = 'approved' then auth.uid() end, case when v_status = 'approved' then now() end)
  returning id into v_id;

  if v_status = 'approved' then
    perform private.apply_approved_leave(v_id);
  else
    perform private.notify_leave_approvers(v_id);
  end if;
  perform private.audit(v_company, 'leave.request', 'leave_request', v_id::text, jsonb_build_object('type', v_type, 'days', v_days));
  return v_id;
end;
$$;

create function public.leave_request_decide(p_id uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.auth_employee_id();
  v_company uuid := private.auth_company_id();
  v_role public.employee_role := private.auth_role();
  r public.leave_requests;
  e public.employees;
  v_allowed boolean;
  v_balance jsonb;
begin
  if v_me is null or p_decision not in ('approve', 'reject') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.leave_requests where id = p_id and company_id = v_company for update;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into e from public.employees where id = r.employee_id for update;

  -- Nobody decides their own request; the right person decides at each stage, and the owner at any.
  v_allowed := r.employee_id <> v_me and case r.status
    when 'pending_manager' then v_role = 'owner' or (v_role = 'manager' and e.manager_id = v_me)
    when 'pending_hr' then v_role = 'owner' or (v_role = 'hr' and e.role in ('manager', 'employee'))
    else false end;
  if not v_allowed then
    if r.status in ('pending_manager', 'pending_hr') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  if p_decision = 'reject' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('leave_decide', v_me::text, 120, interval '10 minutes');

  if p_decision = 'reject' then
    update public.leave_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = btrim(p_note) where id = r.id;
    perform private.notify_leave(r.company_id, r.employee_id, 'leave_decided', r.id);
  elsif r.status = 'pending_manager' and v_role = 'manager' then
    update public.leave_requests set status = 'pending_hr', manager_approved_by = auth.uid(), manager_approved_at = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = r.id;
    perform private.notify_leave_approvers(r.id);
  else
    -- Final approval: the balance may have changed since the request was made.
    if r.type = 'annual' then
      v_balance := private.leave_balance_of(r.employee_id);
      -- "remaining" already holds this request's days as reserved, so it only goes negative if the
      -- balance shrank (an adjustment) after the request was made.
      if (v_balance ->> 'annual_remaining')::numeric < 0 then
        raise exception 'insufficient_balance' using errcode = 'P0001';
      end if;
    end if;
    update public.leave_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = r.id;
    perform private.apply_approved_leave(r.id);
    perform private.notify_leave(r.company_id, r.employee_id, 'leave_decided', r.id);
  end if;

  perform private.audit(v_company, 'leave.' || p_decision, 'leave_request', r.id::text, jsonb_build_object('stage', r.status));
end;
$$;

-- The employee withdraws a request still waiting; owner / HR can also cancel an approved one, with a reason.
create function public.leave_request_cancel(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.auth_employee_id();
  v_company uuid := private.auth_company_id();
  r public.leave_requests;
begin
  if v_me is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.leave_requests where id = p_id and company_id = v_company for update;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status not in ('pending_manager', 'pending_hr', 'approved') then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  if not ((r.employee_id = v_me and r.status <> 'approved') or private.can_manage_attendance(r.employee_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (r.status = 'approved' or r.employee_id <> v_me) and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('leave_cancel', v_me::text, 60, interval '10 minutes');

  update public.leave_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
    decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = r.id;
  if r.employee_id <> v_me then
    perform private.notify_leave(r.company_id, r.employee_id, 'leave_decided', r.id);
  end if;
  perform private.audit(v_company, 'leave.cancel', 'leave_request', r.id::text, jsonb_build_object('was', r.status));
end;
$$;

create function public.leave_adjust(p_employee uuid, p_days numeric, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
begin
  if v_company is null or not private.can_manage_attendance(p_employee) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days = 0 or p_days not between -365 and 365 or char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('leave_adjust', v_company::text, 120, interval '10 minutes');
  insert into public.leave_adjustments (company_id, employee_id, days, reason, created_by)
  values (v_company, p_employee, p_days, btrim(p_reason), auth.uid());
  perform private.audit(v_company, 'leave.adjust', 'employee', p_employee::text, jsonb_build_object('days', p_days));
end;
$$;

revoke execute on function
  public.leave_balance(uuid),
  public.leave_request_create(jsonb),
  public.leave_request_decide(uuid, text, text),
  public.leave_request_cancel(uuid, text),
  public.leave_adjust(uuid, numeric, text)
from public, anon;
grant execute on function
  public.leave_balance(uuid),
  public.leave_request_create(jsonb),
  public.leave_request_decide(uuid, text, text),
  public.leave_request_cancel(uuid, text),
  public.leave_adjust(uuid, numeric, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Export: an approved leave request, for whoever may see it
-- ---------------------------------------------------------------------------
create or replace function public.record_export(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
begin
  if v_company is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_kind = 'employee_card' then
    if not private.can_manage_employee(p_target) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'task_report' then
    if not private.can_see_task(p_target) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'attendance_sheet' then
    if p_target is distinct from v_company or private.auth_role() not in ('owner', 'hr') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'leave_request' then
    if not exists (select 1 from public.leave_requests r
                   where r.id = p_target and r.company_id = v_company and r.status = 'approved'
                     and private.can_see_attendance(r.employee_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'unknown_export' using errcode = 'P0001';
  end if;

  perform private.take_rate_limit('pdf', auth.uid()::text, 20, interval '10 minutes');
  perform private.audit(v_company, 'export.' || p_kind, p_kind, p_target::text);
end;
$$;
