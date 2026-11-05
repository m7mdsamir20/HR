-- Migration: Sequential auto-generated employee code per company (e.g. EMP-0001)

-- 1. Function to calculate next employee number for a company
create or replace function private.next_employee_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_num integer := 0;
  v_next_num integer;
begin
  -- Lock company row to avoid concurrent duplicate sequence numbers
  perform 1 from public.companies where id = p_company_id for update;

  select coalesce(max(
    case 
      when employee_number ~ '^EMP-[0-9]+$' 
      then substring(employee_number from 5)::integer 
      else 0 
    end
  ), 0)
  into v_max_num
  from public.employees
  where company_id = p_company_id;

  v_next_num := v_max_num + 1;
  return 'EMP-' || lpad(v_next_num::text, 4, '0');
end;
$$;

-- 2. Trigger function to automatically set employee_number before insert
create or replace function private.set_employee_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.employee_number is null or btrim(new.employee_number) = '' then
    new.employee_number := private.next_employee_number(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_employee_number on public.employees;
create trigger trg_set_employee_number
  before insert on public.employees
  for each row
  execute function private.set_employee_number();

-- 3. Update private.write_employee_file so it never clears or nullifies an existing employee_number
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
    probation_days = private.txt(p, 'probation_days')::integer
  where e.id = p_employee_id;
end;
$$;

-- 4. Backfill existing employees without an employee_number sequentially per company
do $$
declare
  r record;
  v_counter integer;
  v_curr_company uuid := null;
begin
  for r in (
    select id, company_id, employee_number, created_at
    from public.employees
    order by company_id, created_at asc, id asc
  ) loop
    if v_curr_company is distinct from r.company_id then
      v_curr_company := r.company_id;
      v_counter := 1;
    end if;

    if r.employee_number is null or btrim(r.employee_number) = '' then
      while exists (
        select 1 from public.employees
        where company_id = r.company_id
          and employee_number = 'EMP-' || lpad(v_counter::text, 4, '0')
      ) loop
        v_counter := v_counter + 1;
      end loop;

      update public.employees
      set employee_number = 'EMP-' || lpad(v_counter::text, 4, '0')
      where id = r.id;

      v_counter := v_counter + 1;
    end if;
  end loop;
end;
$$;
