-- The daily job marks absences from the employee's *current* shift, so someone assigned a shift
-- today would be marked absent for yesterday. Remember when the current shift was assigned and
-- count absences only from that day on.
alter table public.employees add column shift_since date;

create or replace function public.attendance_assign(p_employee_ids uuid[], p_branch_id uuid, p_shift_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
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
    update public.employees set
      branch_id = p_branch_id,
      shift_id = p_shift_id,
      shift_since = case when p_shift_id is distinct from shift_id then v_today else shift_since end
    where id = v_id;
    v_count := v_count + 1;
  end loop;

  perform private.audit(v_company, 'attendance.assign', 'employee', null,
    jsonb_build_object('count', v_count, 'branch_id', p_branch_id, 'shift_id', p_shift_id));
  return v_count;
end;
$$;

create or replace function private.run_attendance_day(p_date date) returns integer
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
      and (emp.shift_since is null or emp.shift_since <= p_date)
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

-- 00:30 Riyadh closes the previous day, and re-checks the day before it in case a run was missed
-- (the job is idempotent and never touches a decided deduction).
select cron.unschedule('attendance-daily');
select cron.schedule('attendance-daily', '30 21 * * *',
  $$select private.run_attendance_day(d)
    from (select (now() at time zone 'Asia/Riyadh')::date - n as d from generate_series(1, 2) as n) days$$);
