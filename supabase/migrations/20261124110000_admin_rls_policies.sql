-- Grant admin role same RLS access as owner and hr across all tables

-- 1. employees_select
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select using (
  private.is_platform_admin()
  or (
    company_id = private.auth_company_id()
    and (
      private.auth_role() in ('owner', 'admin', 'hr')
      or id = private.auth_employee_id()
      or (private.auth_role() = 'manager' and manager_id = private.auth_employee_id())
    )
  )
);

-- 2. departments_write
drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments for all using (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
) with check (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
);

-- 3. branches_write
drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches for all using (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
) with check (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
);

-- 4. shifts_write
drop policy if exists shifts_write on public.shifts;
create policy shifts_write on public.shifts for all using (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
) with check (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
);

-- 5. calendar_write
drop policy if exists calendar_write on public.company_calendar;
create policy calendar_write on public.company_calendar for all using (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
) with check (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
);

-- 6. advance_requests (advances_select)
drop policy if exists advances_select on public.advance_requests;
create policy advances_select on public.advance_requests for select using (
  company_id = private.auth_company_id()
  and (private.auth_role() in ('owner', 'admin', 'hr') or employee_id = private.auth_employee_id())
);

-- 7. advance_installments (advance_installments_select)
drop policy if exists advance_installments_select on public.advance_installments;
create policy advance_installments_select on public.advance_installments for select using (
  company_id = private.auth_company_id()
  and (private.auth_role() in ('owner', 'admin', 'hr') or employee_id = private.auth_employee_id())
);

-- 8. attendance_deductions (deductions_select)
drop policy if exists deductions_select on public.attendance_deductions;
create policy deductions_select on public.attendance_deductions for select using (
  company_id = private.auth_company_id()
  and (private.auth_role() in ('owner', 'admin', 'hr') or employee_id = private.auth_employee_id())
);

-- 9. attendance_rules (rules_select, rules_update)
drop policy if exists rules_select on public.attendance_rules;
create policy rules_select on public.attendance_rules for select using (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
);

drop policy if exists rules_update on public.attendance_rules;
create policy rules_update on public.attendance_rules for update using (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin')
) with check (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin')
);

-- 10. audit_logs (audit_logs_select)
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select using (
  private.is_platform_admin()
  or (company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin'))
);

-- 11. leave_adjustments (leave_adjustments_select)
drop policy if exists leave_adjustments_select on public.leave_adjustments;
create policy leave_adjustments_select on public.leave_adjustments for select using (
  company_id = private.auth_company_id()
  and (private.auth_role() in ('owner', 'admin', 'hr') or employee_id = private.auth_employee_id())
);

-- 12. payroll_runs (payroll_runs_select)
drop policy if exists payroll_runs_select on public.payroll_runs;
create policy payroll_runs_select on public.payroll_runs for select using (
  company_id = private.auth_company_id() and private.auth_role() in ('owner', 'admin', 'hr')
);

-- 13. payroll_slips (payroll_slips_select)
drop policy if exists payroll_slips_select on public.payroll_slips;
create policy payroll_slips_select on public.payroll_slips for select using (
  company_id = private.auth_company_id()
  and (private.auth_role() in ('owner', 'admin', 'hr') or employee_id = private.auth_employee_id())
);
