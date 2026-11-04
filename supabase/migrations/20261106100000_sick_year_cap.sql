-- Security review of 2b: the sick-leave cap (120 days a calendar year) was checked against the
-- current year's balance, so a request starting in another year (next January, or a late report
-- for last December) was measured against the wrong year. The cap now counts the days of the
-- request's own year, when the request is made and again at final approval.
create function private.sick_days_in_year(p_employee uuid, p_year integer, p_exclude uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(days), 0)::integer from public.leave_requests
  where employee_id = p_employee and type = 'sick' and status in ('pending_manager', 'pending_hr', 'approved')
    and extract(year from start_date) = p_year and id is distinct from p_exclude;
$$;

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
      -- The cap is per calendar year, and the year that counts is the one the leave falls in.
      if v_days + private.sick_days_in_year(v_me, extract(year from v_start)::integer, null) > 120 then
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

create or replace function public.leave_request_decide(p_id uuid, p_decision text, p_note text default null) returns void
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
    if r.type = 'sick' and private.sick_days_in_year(r.employee_id, extract(year from r.start_date)::integer, r.id) + r.days > 120 then
      raise exception 'sick_limit' using errcode = 'P0001';
    end if;
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
