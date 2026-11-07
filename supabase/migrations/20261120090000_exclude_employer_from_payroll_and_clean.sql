-- Migration: Strictly exclude employer/owner/admin from payroll, compensation, and self-service.
-- Clean up any residual compensation or slips for owner/admin accounts.

-- 1. Clean existing records for owner/admin
delete from public.payroll_slips
where employee_id in (select id from public.employees where role in ('owner', 'admin'));

delete from public.employee_compensation
where employee_id in (select id from public.employees where role in ('owner', 'admin'));

-- 2. Recompute all payroll runs to reflect actual staff only
do $$
declare
  r record;
begin
  for r in select id from public.payroll_runs loop
    perform private.recompute_payroll_run(r.id);
  end loop;
end;
$$;

-- 3. Update public.payroll_run_create to never process owner/admin
create or replace function public.payroll_run_create(
  p_year integer,
  p_month integer,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_role public.employee_role := private.auth_role();
  v_run_id uuid;
  v_emp record;
  v_gosi record;
  v_att_ded numeric(12, 2);
  v_leave_ded numeric(12, 2);
  v_adv_ded numeric(12, 2);
  v_gross numeric(12, 2);
  v_tot_ded numeric(12, 2);
  v_net numeric(12, 2);
  v_start_date date;
  v_end_date date;
  v_active_adv record;
begin
  if v_role not in ('owner', 'admin', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_year is null or p_year < 2020 or p_year > 2100 or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.payroll_runs
    where company_id = v_company and year = p_year and month = p_month
      and status <> 'cancelled'
  ) then
    raise exception 'run_already_exists' using errcode = 'P0001';
  end if;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  insert into public.payroll_runs (
    company_id, year, month, status, notes, created_by
  ) values (
    v_company, p_year, p_month, 'draft', trim(p_notes), auth.uid()
  ) returning id into v_run_id;

  -- Generate slips strictly for staff employees (excluding owner and admin)
  for v_emp in
    select
      e.id as employee_id,
      coalesce(c.basic_salary, 0) as basic_salary,
      coalesce(c.housing_allowance, 0) as housing_allowance,
      coalesce(c.transport_allowance, 0) as transport_allowance,
      coalesce(c.communication_allowance, 0) as communication_allowance,
      coalesce(c.other_allowances, 0) as other_allowances,
      c.bank_name,
      c.iban
    from public.employees e
    join public.employee_compensation c on c.employee_id = e.id
    where e.company_id = v_company
      and e.status = 'active'
      and e.role not in ('owner', 'admin')
  loop
    -- 1. GOSI
    select * into v_gosi from private.calculate_gosi(v_emp.employee_id);

    -- 2. Attendance deductions (approved within this month)
    select coalesce(sum(
      round(d.day_fraction * (v_emp.basic_salary / 30.0), 2)
    ), 0)
    into v_att_ded
    from public.attendance_deductions d
    where d.company_id = v_company and d.employee_id = v_emp.employee_id
      and d.status = 'approved'
      and d.work_date between v_start_date and v_end_date;

    -- 3. Leave deductions (unpaid days & three-quarter days)
    select coalesce(sum(
      round(coalesce(l.days_unpaid, 0) * (v_emp.basic_salary / 30.0) +
            coalesce(l.days_three_quarter, 0) * 0.25 * (v_emp.basic_salary / 30.0), 2)
    ), 0)
    into v_leave_ded
    from public.leave_requests l
    where l.company_id = v_company and l.employee_id = v_emp.employee_id
      and l.status = 'approved'
      and l.start_date <= v_end_date and l.end_date >= v_start_date;

    -- 4. Advance installment
    v_adv_ded := 0;
    select * into v_active_adv
    from public.advance_requests
    where company_id = v_company and employee_id = v_emp.employee_id
      and status = 'approved' and remaining_amount > 0
    order by created_at asc
    limit 1;

    if found then
      v_adv_ded := least(v_active_adv.monthly_installment, v_active_adv.remaining_amount);
    end if;

    -- Totals
    v_gross := v_emp.basic_salary + v_emp.housing_allowance + v_emp.transport_allowance +
               v_emp.communication_allowance + v_emp.other_allowances;

    v_tot_ded := coalesce(v_gosi.employee_share, 0) + v_att_ded + v_leave_ded + v_adv_ded;
    v_net := greatest(0, v_gross - v_tot_ded);

    insert into public.payroll_slips (
      company_id, payroll_run_id, employee_id,
      basic_salary, housing_allowance, transport_allowance, communication_allowance, other_allowances,
      gross_salary,
      gosi_employee, gosi_employer,
      attendance_deduction, leave_deduction, advance_deduction, other_deductions,
      total_deductions, net_salary,
      bank_name, iban
    ) values (
      v_company, v_run_id, v_emp.employee_id,
      v_emp.basic_salary, v_emp.housing_allowance, v_emp.transport_allowance, v_emp.communication_allowance, v_emp.other_allowances,
      v_gross,
      coalesce(v_gosi.employee_share, 0), coalesce(v_gosi.employer_share, 0),
      v_att_ded, v_leave_ded, v_adv_ded, 0,
      v_tot_ded, v_net,
      v_emp.bank_name, v_emp.iban
    );
  end loop;

  perform private.recompute_payroll_run(v_run_id);
  return v_run_id;
end;
$$;

-- 4. Safety trigger: prevent compensation records for owner/admin
create or replace function private.check_employee_compensation_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.employee_role;
begin
  select role into v_role from public.employees where id = new.employee_id;
  if v_role in ('owner', 'admin') then
    raise exception 'System administrators and owners do not receive employee salaries or compensation.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_employee_compensation_role on public.employee_compensation;
create trigger trg_check_employee_compensation_role
before insert or update on public.employee_compensation
for each row execute function private.check_employee_compensation_role();

-- 5. Safety trigger: prevent payroll slips for owner/admin
create or replace function private.check_payroll_slip_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.employee_role;
begin
  select role into v_role from public.employees where id = new.employee_id;
  if v_role in ('owner', 'admin') then
    raise exception 'System administrators and owners cannot have payroll slips.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_payroll_slip_role on public.payroll_slips;
create trigger trg_check_payroll_slip_role
before insert or update on public.payroll_slips
for each row execute function private.check_payroll_slip_role();
