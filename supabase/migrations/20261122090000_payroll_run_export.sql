-- Allow HR, Owner, Admin to export/print the full monthly payroll run sheet (both draft & approved)
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
  elsif p_kind = 'payslip' then
    if not exists (select 1 from public.payroll_slips s
                   where s.id = p_target and s.company_id = v_company
                     and (s.employee_id = private.auth_employee_id() or private.auth_role() in ('owner', 'hr', 'admin'))) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'payroll_run' then
    if not exists (select 1 from public.payroll_runs r
                   where r.id = p_target and r.company_id = v_company
                     and private.auth_role() in ('owner', 'hr', 'admin')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'unknown_export' using errcode = 'P0001';
  end if;

  perform private.take_rate_limit('pdf', auth.uid()::text, 20, interval '10 minutes');
  perform private.audit(v_company, 'export.' || p_kind, p_kind, p_target::text);
end;
$$;
