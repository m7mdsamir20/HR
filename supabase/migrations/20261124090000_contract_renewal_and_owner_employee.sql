-- Add contract_renewal (auto_renew: تجديد تلقائي بنفس المدة, ends_on_expiry: ينتهي بنهاية مدته)
alter table public.employees
  add column if not exists contract_renewal text check (contract_renewal in ('auto_renew', 'ends_on_expiry')) default 'auto_renew';

update public.employees
set contract_renewal = 'auto_renew'
where contract_renewal is null;

-- Update private.write_employee_file to persist contract_renewal
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
    employment_type = coalesce(private.txt(p, 'employment_type'), 'full_time'),
    contract_type = private.txt(p, 'contract_type'),
    contract_renewal = coalesce(private.txt(p, 'contract_renewal'), 'auto_renew'),
    contract_start = private.txt(p, 'contract_start')::date,
    contract_end = private.txt(p, 'contract_end')::date,
    probation_days = private.txt(p, 'probation_days')::integer,
    iqama_start = private.txt(p, 'iqama_start')::date,
    iqama_end = private.txt(p, 'iqama_end')::date
  where e.id = p_employee_id;
end;
$$;

-- Allow owners/admins to have compensation and payroll slips if they are appointed as working employees with salaries
drop trigger if exists trg_check_employee_compensation_role on public.employee_compensation;
drop trigger if exists trg_check_payroll_slip_role on public.payroll_slips;

-- Allow payroll_run_create to process owners/admins if they are actively compensated employees (e.g. general manager / director with salary)
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

  -- Generate slips for staff employees or compensated owner/admin
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
      and (e.role not in ('owner', 'admin') or c.basic_salary > 0)
  loop
    v_gross := v_emp.basic_salary + v_emp.housing_allowance + v_emp.transport_allowance + v_emp.communication_allowance + v_emp.other_allowances;

    -- Compute GOSI
    v_gosi := public.compute_gosi_deductions(v_emp.employee_id, v_emp.basic_salary, v_emp.housing_allowance);

    -- Attendance deductions
    select coalesce(sum(d.day_fraction), 0) * (v_emp.basic_salary / 30.0)
    into v_att_ded
    from public.attendance_deductions d
    where d.employee_id = v_emp.employee_id
      and d.status = 'approved'
      and d.work_date between v_start_date and v_end_date;

    -- Unpaid leave deductions
    select coalesce(sum(r.days_count), 0) * (v_gross / 30.0)
    into v_leave_ded
    from public.leave_requests r
    where r.employee_id = v_emp.employee_id
      and r.status = 'approved'
      and r.type = 'unpaid'
      and r.start_date <= v_end_date and r.end_date >= v_start_date;

    -- Advance monthly installment
    v_adv_ded := 0;
    for v_active_adv in
      select a.id, a.monthly_installment, a.remaining_amount
      from public.advances a
      where a.employee_id = v_emp.employee_id
        and a.status = 'approved'
        and a.remaining_amount > 0
        and a.repayment_start_date <= v_end_date
    loop
      v_adv_ded := v_adv_ded + least(v_active_adv.monthly_installment, v_active_adv.remaining_amount);
    end loop;

    v_tot_ded := coalesce(v_gosi.employee_share, 0) + coalesce(v_att_ded, 0) + coalesce(v_leave_ded, 0) + coalesce(v_adv_ded, 0);
    v_net := greatest(0, v_gross - v_tot_ded);

    insert into public.payroll_slips (
      company_id, payroll_run_id, employee_id,
      basic_salary, housing_allowance, transport_allowance, communication_allowance, other_allowances, gross_salary,
      gosi_employee, gosi_employer,
      attendance_deduction, leave_deduction, advance_deduction, other_deductions, total_deductions,
      net_salary, bank_name, iban
    ) values (
      v_company, v_run_id, v_emp.employee_id,
      v_emp.basic_salary, v_emp.housing_allowance, v_emp.transport_allowance, v_emp.communication_allowance, v_emp.other_allowances, v_gross,
      coalesce(v_gosi.employee_share, 0), coalesce(v_gosi.employer_share, 0),
      coalesce(v_att_ded, 0), coalesce(v_leave_ded, 0), coalesce(v_adv_ded, 0), 0, v_tot_ded,
      v_net, v_emp.bank_name, v_emp.iban
    );
  end loop;

  perform private.recompute_payroll_run(v_run_id);
  perform private.audit(v_company, 'payroll.run_created', 'payroll_run', v_run_id::text);

  return v_run_id;
end;
$$;

-- Include employment_type and contract_renewal in my_profile RPC
create or replace function public.my_profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'national_id', e.national_id,
    'employee_number', e.employee_number,
    'phone', e.phone,
    'email', e.email,
    'job_title', e.job_title,
    'occupation', e.occupation,
    'locale', e.locale,
    'nationality', e.nationality,
    'gender', e.gender,
    'birth_date', e.birth_date,
    'marital_status', e.marital_status,
    'hire_date', e.hire_date,
    'employment_type', e.employment_type,
    'contract_type', e.contract_type,
    'contract_renewal', e.contract_renewal,
    'contract_start', e.contract_start,
    'contract_end', e.contract_end,
    'probation_days', e.probation_days,
    'department_ar', d.name_ar,
    'department_en', d.name_en,
    'manager_ar', m.full_name_ar,
    'manager_en', m.full_name_en,
    'pay', case when c.employee_id is null then null else jsonb_build_object(
      'basic_salary', c.basic_salary,
      'housing_allowance', c.housing_allowance,
      'transport_allowance', c.transport_allowance,
      'communication_allowance', c.communication_allowance,
      'other_allowances', c.other_allowances,
      'bank_name', c.bank_name,
      'iban', c.iban,
      'gosi_number', c.gosi_number
    ) end
  )
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.employees m on m.id = e.manager_id and m.status = 'active'
  left join public.employee_compensation c on c.employee_id = e.id
  where e.user_id = auth.uid() and e.status <> 'deleted';
$$;
