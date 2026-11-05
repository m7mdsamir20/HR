-- Migration: Add 'admin' role, 'terminated' employee status, Iqama start/end dates,
-- employee termination RPCs and policies, and ensure owner and admin parity.

-- 1. Enum updates
alter type public.employee_role add value if not exists 'admin';
alter type public.employee_status add value if not exists 'terminated';

-- 2. New columns on public.employees
alter table public.employees
  add column if not exists iqama_start date,
  add column if not exists iqama_end date,
  add column if not exists termination_type text check (termination_type in ('resignation', 'contract_end', 'termination', 'absence', 'other')),
  add column if not exists termination_date date,
  add column if not exists termination_reason text,
  add column if not exists terminated_at timestamptz;

-- 3. Update private.can_manage_role:
-- Owner manages all roles (including admin). Admin manages hr, manager, employee (and other admins if any).
create or replace function private.can_manage_role(p_role public.employee_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.auth_role()::text
    when 'owner' then true
    when 'admin' then p_role::text in ('admin', 'hr', 'manager', 'employee')
    when 'hr' then p_role::text in ('manager', 'employee')
    else false
  end;
$$;

-- 4. Update private.write_employee_file to persist iqama dates
create or replace function private.write_employee_file(p_employee_id uuid, p_role public.employee_role, p jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.employees e set
    full_name_ar = private.txt(p, 'full_name_ar'),
    full_name_en = private.txt(p, 'full_name_en'),
    phone = private.txt(p, 'phone'),
    email = lower(private.txt(p, 'email')),
    employee_number = coalesce(nullif(btrim(private.txt(p, 'employee_number')), ''), e.employee_number),
    job_title = private.txt(p, 'job_title'),
    occupation = private.txt(p, 'occupation'),
    role = p_role,
    department_id = private.txt(p, 'department_id')::uuid,
    manager_id = private.txt(p, 'manager_id')::uuid,
    nationality = case when e.id_type = 'citizen' then 'SA' else private.txt(p, 'nationality') end,
    gender = private.txt(p, 'gender'),
    birth_date = private.txt(p, 'birth_date')::date,
    marital_status = private.txt(p, 'marital_status'),
    hire_date = private.txt(p, 'hire_date')::date,
    contract_type = private.txt(p, 'contract_type'),
    contract_start = private.txt(p, 'contract_start')::date,
    contract_end = private.txt(p, 'contract_end')::date,
    probation_days = private.txt(p, 'probation_days')::integer,
    iqama_start = private.txt(p, 'iqama_start')::date,
    iqama_end = private.txt(p, 'iqama_end')::date
  where e.id = p_employee_id;
end;
$$;

-- 5. Safe employee status changes (works whether employee has a user account or not)
create or replace function public.employee_set_status(p_employee_id uuid, p_status public.employee_status)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_curr_status public.employee_status;
  v_role public.employee_role;
begin
  if not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select user_id, status, role into v_user, v_curr_status, v_role
  from public.employees
  where id = p_employee_id;

  if v_role = 'owner' and p_status <> 'active' and not exists (
    select 1 from public.employees
    where company_id = private.auth_company_id() and role = 'owner' and status = 'active' and id <> p_employee_id
  ) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  update public.employees set
    status = p_status,
    disabled_at = case when p_status = 'disabled' then now() else null end,
    deleted_at = case when p_status = 'deleted' then now() else null end
  where id = p_employee_id;

  if v_user is not null and p_status in ('disabled', 'deleted', 'terminated') then
    perform private.revoke_sessions(v_user);
  end if;

  return v_user;
end;
$$;

-- 6. RPC for Terminating / Separating an employee (resignation, contract end, termination, absence)
create or replace function public.employee_terminate(
  p_employee_id uuid,
  p_type text,
  p_date date,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_role public.employee_role;
begin
  if not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select user_id, role into v_user, v_role
  from public.employees
  where id = p_employee_id;

  if v_role = 'owner' then
    raise exception 'cannot_terminate_owner' using errcode = 'P0001';
  end if;

  if p_type not in ('resignation', 'contract_end', 'termination', 'absence', 'other') then
    raise exception 'invalid_termination_type' using errcode = 'P0001';
  end if;

  update public.employees set
    status = 'terminated',
    termination_type = p_type,
    termination_date = coalesce(p_date, (now() at time zone 'Asia/Riyadh')::date),
    termination_reason = trim(p_reason),
    terminated_at = now(),
    disabled_at = now()
  where id = p_employee_id;

  if v_user is not null then
    perform private.revoke_sessions(v_user);
  end if;

  return v_user;
end;
$$;

grant execute on function public.employee_terminate(uuid, text, date, text) to authenticated;

-- 7. RPC for Reactivating a terminated or disabled employee
create or replace function public.employee_reactivate(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select user_id into v_user
  from public.employees
  where id = p_employee_id;

  update public.employees set
    status = 'active',
    disabled_at = null,
    termination_type = null,
    termination_date = null,
    termination_reason = null,
    terminated_at = null
  where id = p_employee_id;

  return v_user;
end;
$$;

grant execute on function public.employee_reactivate(uuid) to authenticated;

-- 8. Fix employee_delete_begin and finish for employees without user_id
create or replace function public.employee_delete_begin(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.employees;
begin
  if not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.employees where id = p_employee_id;
  if v_row.role = 'owner' and v_row.status = 'active' and not exists (
    select 1 from public.employees
    where company_id = v_row.company_id and role = 'owner' and status = 'active' and id <> v_row.id
  ) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  return v_row.user_id;
end;
$$;

create or replace function public.employee_delete_finish(p_employee_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.employees
    set status = 'deleted', user_id = null, deleted_at = now(), manager_id = null
    where id = p_employee_id;
end;
$$;

-- 9. Give 'admin' parity with 'owner' in company profile updates, logo, and approvals
create or replace function public.company_update_profile(
  p_name_ar text,
  p_name_en text,
  p_commercial_reg text,
  p_tax_number text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.auth_role()::text not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.companies set
    name_ar = p_name_ar,
    name_en = nullif(p_name_en, ''),
    commercial_reg = nullif(p_commercial_reg, ''),
    tax_number = nullif(p_tax_number, ''),
    phone = nullif(p_phone, ''),
    email = lower(nullif(p_email, '')),
    address = nullif(p_address, '')
  where id = private.auth_company_id();
end;
$$;

create or replace function public.company_set_logo(p_logo_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_old text;
begin
  if private.auth_role()::text not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_logo_path is not null and p_logo_path !~ ('^' || v_company::text || '/logo/[0-9a-f-]{36}\.(png|jpg|webp)$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;
  select logo_path into v_old from public.companies where id = v_company;
  update public.companies set logo_path = p_logo_path where id = v_company;
  return v_old;
end;
$$;

-- 10. Update payroll functions to include 'admin'
create or replace function public.create_payroll_run(
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

  -- Generate slips for active employees (excluding owner) with compensation records
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
    where e.company_id = v_company and e.status = 'active' and e.role <> 'owner'
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

    if v_active_adv.id is not null then
      v_adv_ded := least(v_active_adv.monthly_installment, v_active_adv.remaining_amount);
    end if;

    -- Calculations
    v_gross := v_emp.basic_salary + v_emp.housing_allowance + v_emp.transport_allowance +
               v_emp.communication_allowance + v_emp.other_allowances;
    v_tot_ded := v_gosi.employee_share + v_att_ded + v_leave_ded + v_adv_ded;
    v_net := greatest(0, v_gross - v_tot_ded);

    insert into public.payroll_slips (
      payroll_run_id, company_id, employee_id,
      basic_salary, housing_allowance, transport_allowance,
      communication_allowance, other_allowances, gross_salary,
      gosi_employee, gosi_company,
      attendance_deductions, leave_deductions, advance_deductions,
      other_deductions, total_deductions, net_salary,
      bank_name, iban
    ) values (
      v_run_id, v_company, v_emp.employee_id,
      v_emp.basic_salary, v_emp.housing_allowance, v_emp.transport_allowance,
      v_emp.communication_allowance, v_emp.other_allowances, v_gross,
      v_gosi.employee_share, v_gosi.company_share,
      v_att_ded, v_leave_ded, v_adv_ded,
      0, v_tot_ded, v_net,
      v_emp.bank_name, v_emp.iban
    );
  end loop;

  return v_run_id;
end;
$$;

create or replace function public.approve_payroll_run(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_role public.employee_role := private.auth_role();
  v_run record;
  v_slip record;
  v_active_adv record;
  v_ded numeric(12, 2);
begin
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_run from public.payroll_runs
  where id = p_run_id and company_id = v_company;

  if v_run.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_run.status <> 'draft' then
    raise exception 'not_draft' using errcode = 'P0001';
  end if;

  for v_slip in
    select * from public.payroll_slips
    where payroll_run_id = p_run_id and advance_deductions > 0
  loop
    select * into v_active_adv
    from public.advance_requests
    where company_id = v_company and employee_id = v_slip.employee_id
      and status = 'approved' and remaining_amount > 0
    order by created_at asc
    limit 1;

    if v_active_adv.id is not null then
      v_ded := least(v_slip.advance_deductions, v_active_adv.remaining_amount);
      update public.advance_requests
      set remaining_amount = remaining_amount - v_ded,
          updated_at = now()
      where id = v_active_adv.id;
    end if;
  end loop;

  update public.payroll_runs
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id = p_run_id;
end;
$$;

create or replace function public.cancel_payroll_run(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_role public.employee_role := private.auth_role();
  v_run record;
begin
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_run from public.payroll_runs
  where id = p_run_id and company_id = v_company;

  if v_run.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_run.status <> 'draft' then
    raise exception 'not_draft' using errcode = 'P0001';
  end if;

  update public.payroll_runs
  set status = 'cancelled',
      updated_at = now()
  where id = p_run_id;
end;
$$;
