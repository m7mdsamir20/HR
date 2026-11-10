-- Add employment_type (full_time, part_time, remote, flexible) to employees
alter table public.employees
  add column if not exists employment_type text check (employment_type in ('full_time', 'part_time', 'remote', 'flexible')) default 'full_time';

update public.employees
set employment_type = 'full_time'
where employment_type is null;

-- Update private.write_employee_file to persist employment_type
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
    contract_start = private.txt(p, 'contract_start')::date,
    contract_end = private.txt(p, 'contract_end')::date,
    probation_days = private.txt(p, 'probation_days')::integer,
    iqama_start = private.txt(p, 'iqama_start')::date,
    iqama_end = private.txt(p, 'iqama_end')::date
  where e.id = p_employee_id;
end;
$$;
