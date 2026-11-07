-- Migration: Add unpaid leave support and manual leave request RPC

-- 1. Update check constraint on leave_requests to include 'unpaid'
alter table public.leave_requests drop constraint if exists leave_requests_type_check;
alter table public.leave_requests add constraint leave_requests_type_check
  check (type in ('annual', 'sick', 'marriage', 'death', 'newborn', 'hajj', 'maternity', 'unpaid'));

-- 2. Update apply_approved_leave to properly set days_unpaid for unpaid leaves
create or replace function private.apply_approved_leave(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
  v_before integer := 0;
  v_after integer;
  v_full integer := 0;
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
  elsif r.type = 'unpaid' then
    v_full := 0;
    v_three := 0;
    v_unpaid := r.days;
  else
    v_full := r.days;
  end if;
  update public.leave_requests set days_full = v_full, days_three_quarter = v_three, days_unpaid = v_unpaid where id = r.id;

  -- Days already marked absent that this leave now excuses: remove the record and its pending suggestion.
  delete from public.attendance_deductions
    where employee_id = r.employee_id and work_date between r.start_date and r.end_date and kind = 'absence' and status = 'pending';
  delete from public.attendance_records
    where employee_id = r.employee_id and work_date between r.start_date and r.end_date and status = 'absent'
      and not exists (select 1 from public.attendance_deductions d
                      where d.employee_id = attendance_records.employee_id and d.work_date = attendance_records.work_date and d.kind = 'absence');
end;
$$;

-- 3. Update leave_request_create to accept unpaid leave type
create or replace function public.leave_request_create(p jsonb) returns uuid
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
    when 'unpaid' then
      if v_days > 365 then raise exception 'special_limit' using errcode = 'P0001'; end if;
    else
      raise exception 'invalid_dates' using errcode = 'P0001';
  end case;

  v_status := case
    when v_role in ('owner', 'admin') then 'approved'
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

-- 4. Manual leave creation by management on behalf of an employee
create or replace function public.leave_manual_create(
  p_employee_id uuid,
  p_type text,
  p_start_date date,
  p_end_date date,
  p_reason text default null,
  p_auto_approve boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_role text := private.auth_role()::text;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  e public.employees;
  v_days integer;
  v_balance jsonb;
  v_status text;
  v_id uuid;
begin
  if v_company is null or v_role not in ('owner', 'admin', 'hr', 'manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into e from public.employees where id = p_employee_id and company_id = v_company and status = 'active';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_role = 'manager' and not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_type is null or p_type not in ('annual', 'sick', 'marriage', 'death', 'newborn', 'hajj', 'maternity', 'unpaid') then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_start_date < v_today - 365 or p_start_date > v_today + 365 then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.leave_requests
             where employee_id = p_employee_id and status in ('pending_manager', 'pending_hr', 'approved')
               and p_start_date <= end_date and p_end_date >= start_date) then
    raise exception 'overlap' using errcode = 'P0001';
  end if;

  v_days := private.leave_day_count(p_employee_id, p_type, p_start_date, p_end_date);
  if v_days < 1 then
    raise exception 'no_working_days' using errcode = 'P0001';
  end if;

  v_balance := private.leave_balance_of(p_employee_id);

  case p_type
    when 'annual' then
      if v_days > (v_balance ->> 'annual_remaining')::numeric then
        raise exception 'insufficient_balance' using errcode = 'P0001';
      end if;
    when 'sick' then
      if extract(year from p_start_date) <> extract(year from p_end_date) then
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
      if v_today - private.leave_start(p_employee_id) < 730 then raise exception 'hajj_service' using errcode = 'P0001'; end if;
      if v_days not between 10 and 15 then raise exception 'special_limit' using errcode = 'P0001'; end if;
    when 'unpaid' then
      if v_days > 365 then raise exception 'special_limit' using errcode = 'P0001'; end if;
  end case;

  v_status := case when p_auto_approve then 'approved' else 'pending_hr' end;

  insert into public.leave_requests (
    company_id, employee_id, type, start_date, end_date, days, reason, status,
    decided_by, decided_at
  )
  values (
    v_company, p_employee_id, p_type, p_start_date, p_end_date, v_days, p_reason, v_status,
    case when v_status = 'approved' then auth.uid() end,
    case when v_status = 'approved' then now() end
  )
  returning id into v_id;

  if v_status = 'approved' then
    perform private.apply_approved_leave(v_id);
  else
    perform private.notify_leave_approvers(v_id);
  end if;

  perform private.audit(v_company, 'leave.manual_create', 'leave_request', v_id::text,
    jsonb_build_object('employee_id', p_employee_id, 'type', p_type, 'days', v_days, 'auto_approved', p_auto_approve));

  return v_id;
end;
$$;

grant execute on function public.leave_manual_create(uuid, text, date, date, text, boolean) to authenticated;
