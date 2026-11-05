-- Attendance manual entry and role enhancement
-- 1. Support admin in can_manage_attendance and can_see_attendance
-- 2. Fallback to company shift in attendance_correct if employee has no shift_id
-- 3. Relax today's manual attendance timestamp validation for management

create or replace function private.can_manage_attendance(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.auth_role()
    when 'owner' then exists (select 1 from public.employees e
                              where e.id = p_employee_id and e.company_id = private.auth_company_id() and e.status <> 'deleted')
    when 'admin' then exists (select 1 from public.employees e
                              where e.id = p_employee_id and e.company_id = private.auth_company_id() and e.status <> 'deleted')
    when 'hr' then private.can_manage_employee(p_employee_id)
    else false end;
$$;

create or replace function private.can_see_attendance(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.company_id = private.auth_company_id()
      and (private.auth_role() in ('owner', 'admin', 'hr')
           or e.id = private.auth_employee_id()
           or (private.auth_role() = 'manager' and e.manager_id = private.auth_employee_id()))
  );
$$;

create or replace function public.attendance_correct(
  p_employee_id uuid, p_date date, p_check_in time, p_check_out time, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_emp public.employees;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_shift_id uuid;
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

  select * into v_emp from public.employees where id = p_employee_id and company_id = v_company;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  v_shift_id := v_emp.shift_id;
  if v_shift_id is null then
    select id into v_shift_id from public.shifts where company_id = v_company order by created_at asc limit 1;
    if v_shift_id is null then
      insert into public.shifts (company_id, name_ar, name_en, start_time, end_time, grace_minutes, ramadan_hours, work_days)
      values (v_company, 'الدوام الصباحي', 'Morning Shift', '08:00'::time, '16:00'::time, 15, 6.0, array[0,1,2,3,4])
      returning id into v_shift_id;
    end if;
    update public.employees set shift_id = v_shift_id where id = p_employee_id;
  end if;

  v_in := case when p_check_in is not null then (p_date + p_check_in) at time zone 'Asia/Riyadh' end;
  v_out := case when p_check_out is not null then (p_date + p_check_out) at time zone 'Asia/Riyadh' end;

  insert into public.attendance_records (company_id, employee_id, work_date, shift_id, branch_id, status, source,
    check_in_at, check_out_at, correction_note, corrected_by)
  values (v_company, p_employee_id, p_date, v_shift_id, v_emp.branch_id,
    case when v_in is null then 'absent' else 'present' end, 'manual', v_in, v_out, btrim(p_note), auth.uid())
  on conflict (company_id, employee_id, work_date) do update set
    status = excluded.status, source = 'manual', shift_id = excluded.shift_id,
    check_in_at = excluded.check_in_at, check_out_at = excluded.check_out_at,
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

create or replace function public.attendance_deduction_decide(p_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  d public.attendance_deductions;
begin
  if v_company is null or private.auth_role() not in ('owner', 'admin', 'hr') then
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
    decision_note = case when p_decision = 'waive' then btrim(p_note) else null end,
    decided_by = auth.uid(),
    decided_at = now()
  where id = d.id;

  perform private.audit(v_company, 'attendance.deduction_' || p_decision, 'deduction', d.id::text,
    jsonb_build_object('employee_id', d.employee_id, 'kind', d.kind, 'work_date', d.work_date));
end;
$$;

grant execute on function public.attendance_correct(uuid, date, time, time, text) to authenticated;
grant execute on function public.attendance_deduction_decide(uuid, text, text) to authenticated;
