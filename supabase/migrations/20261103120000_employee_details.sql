-- Full employee file (README §1-أ) and salary structure (README §3-أ).
-- Salary lives in its own table with narrower access than the employee row (CLAUDE.md §4):
-- whoever manages the employee (owner / HR within reach) and the employee themself. Managers don't
-- see their team's pay.

-- ---------------------------------------------------------------------------
-- Employee file
-- ---------------------------------------------------------------------------
alter table public.employees
  add column employee_number text check (char_length(employee_number) <= 30),
  add column email text check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column nationality text check (nationality ~ '^[A-Z]{2}$'),
  add column gender text check (gender in ('male', 'female')),
  add column birth_date date check (birth_date between date '1930-01-01' and current_date),
  add column marital_status text check (marital_status in ('single', 'married', 'divorced', 'widowed')),
  add column occupation text check (char_length(occupation) <= 120),
  add column hire_date date,
  add column contract_type text check (contract_type in ('fixed', 'unlimited')),
  add column contract_start date,
  add column contract_end date,
  add column probation_days integer check (probation_days between 0 and 180),
  add constraint employees_contract_dates check (contract_end is null or contract_start is null or contract_end >= contract_start),
  add constraint employees_fixed_contract_end check (contract_type is distinct from 'fixed' or contract_end is not null),
  -- A Saudi national ID belongs to a Saudi; an Iqama never does.
  add constraint employees_nationality_matches check (nationality is null or (id_type = 'citizen') = (nationality = 'SA'));

create unique index employees_number_per_company on public.employees (company_id, employee_number)
  where employee_number is not null and status <> 'deleted';

-- ---------------------------------------------------------------------------
-- Salary structure
-- ---------------------------------------------------------------------------
create table public.employee_compensation (
  employee_id uuid primary key,
  company_id uuid not null,
  basic_salary numeric(12, 2) not null default 0 check (basic_salary between 0 and 9999999),
  housing_allowance numeric(12, 2) not null default 0 check (housing_allowance between 0 and 9999999),
  transport_allowance numeric(12, 2) not null default 0 check (transport_allowance between 0 and 9999999),
  communication_allowance numeric(12, 2) not null default 0 check (communication_allowance between 0 and 9999999),
  other_allowances numeric(12, 2) not null default 0 check (other_allowances between 0 and 9999999),
  bank_name text check (char_length(bank_name) <= 80),
  iban text check (iban ~ '^SA[0-9]{22}$'),
  gosi_number text check (gosi_number ~ '^[0-9]{1,15}$'),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);

create trigger employee_compensation_touch before update on public.employee_compensation
  for each row execute function private.touch_updated_at();
create trigger employee_compensation_audit after insert or update on public.employee_compensation
  for each row execute function private.audit_row_change('compensation');

-- The audit trigger keys rows by "id"; compensation is keyed by employee.
create or replace function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity text := tg_argv[0];
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_company uuid;
  v_meta jsonb;
begin
  v_company := case v_entity when 'company' then (v_row ->> 'id')::uuid else (v_row ->> 'company_id')::uuid end;

  if tg_op = 'UPDATE' then
    v_meta := jsonb_build_object('changes', private.jsonb_changes(to_jsonb(old), v_row));
    if v_meta -> 'changes' = '{}'::jsonb then
      return new;
    end if;
    -- Deny by default: record which fields changed, and keep from/to values only for an explicit
    -- allowlist. The audit log is readable by the system admin across companies, so pay, personal
    -- details and document numbers never land in it. Company subscription fields and department
    -- names are platform/business data; an employee's role and status trace permission changes.
    v_meta := jsonb_build_object(
      'changed', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(v_meta -> 'changes') as k),
      'changes', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                  from jsonb_each(v_meta -> 'changes') as c(k, v)
                  where (v_entity = 'employee' and k in ('role', 'status'))
                     or (v_entity = 'company' and k in ('status', 'max_employees', 'subscription_ends_at', 'name_ar', 'name_en'))
                     or (v_entity = 'department' and k in ('name_ar', 'name_en')))
    );
  else
    v_meta := case v_entity
      when 'company' then jsonb_build_object('name_ar', v_row -> 'name_ar')
      when 'employee' then jsonb_build_object('role', v_row -> 'role')
      when 'document' then jsonb_build_object('doc_type', v_row -> 'doc_type', 'employee_id', v_row -> 'employee_id')
      when 'department' then jsonb_build_object('name_ar', v_row -> 'name_ar')
      else '{}'::jsonb
    end;
  end if;

  insert into public.audit_logs (company_id, actor_id, action, target_type, target_id, meta)
  values (v_company, auth.uid(), v_entity || '.' || lower(tg_op), v_entity,
          coalesce(v_row ->> 'id', v_row ->> 'employee_id'), v_meta);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on public.employee_compensation from anon;
revoke insert, update, delete, truncate on public.employee_compensation from authenticated;
alter table public.employee_compensation enable row level security;

create policy compensation_select on public.employee_compensation for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and (employee_id = (select private.auth_employee_id()) or private.can_manage_employee(employee_id))
  );

-- ---------------------------------------------------------------------------
-- Create / update take the file and the pay as jsonb (one transaction for both).
-- ---------------------------------------------------------------------------
drop function public.employee_create(uuid, text, text, text, text, text, public.employee_role, uuid, uuid, text);
drop function public.employee_update(uuid, text, text, text, text, public.employee_role, uuid, uuid);

create function private.txt(p jsonb, k text) returns text
language sql immutable set search_path = '' as $$ select nullif(btrim(p ->> k), ''); $$;

-- Writes the employee file fields shared by create and update.
create function private.write_employee_file(p_employee_id uuid, p_role public.employee_role, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.employees e set
    full_name_ar = private.txt(p, 'full_name_ar'),
    full_name_en = private.txt(p, 'full_name_en'),
    phone = private.txt(p, 'phone'),
    email = lower(private.txt(p, 'email')),
    employee_number = private.txt(p, 'employee_number'),
    job_title = private.txt(p, 'job_title'),
    occupation = private.txt(p, 'occupation'),
    role = p_role,
    department_id = private.txt(p, 'department_id')::uuid,
    manager_id = private.txt(p, 'manager_id')::uuid,
    -- Citizens are Saudi by definition; the form can't say otherwise.
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

create function private.write_compensation(p_employee_id uuid, p_company uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.employee_compensation as c (
    employee_id, company_id, basic_salary, housing_allowance, transport_allowance,
    communication_allowance, other_allowances, bank_name, iban, gosi_number, updated_by
  ) values (
    p_employee_id, p_company,
    coalesce(private.txt(p, 'basic_salary')::numeric, 0),
    coalesce(private.txt(p, 'housing_allowance')::numeric, 0),
    coalesce(private.txt(p, 'transport_allowance')::numeric, 0),
    coalesce(private.txt(p, 'communication_allowance')::numeric, 0),
    coalesce(private.txt(p, 'other_allowances')::numeric, 0),
    private.txt(p, 'bank_name'),
    upper(replace(private.txt(p, 'iban'), ' ', '')),
    private.txt(p, 'gosi_number'),
    auth.uid()
  )
  on conflict (employee_id) do update set
    basic_salary = excluded.basic_salary,
    housing_allowance = excluded.housing_allowance,
    transport_allowance = excluded.transport_allowance,
    communication_allowance = excluded.communication_allowance,
    other_allowances = excluded.other_allowances,
    bank_name = excluded.bank_name,
    iban = excluded.iban,
    gosi_number = excluded.gosi_number,
    updated_by = excluded.updated_by;
end;
$$;

create function public.employee_create(
  p_user_id uuid,
  p_national_id text,
  p_role public.employee_role,
  p_file jsonb,
  p_pay jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_id uuid;
begin
  if v_company is null or not private.can_manage_role(p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only a fresh Auth user made for this national ID: an old or leftover account (with a password
  -- someone else knows) can never be attached to a new employee row.
  if not exists (
    select 1 from auth.users
    where id = p_user_id
      and email = p_national_id || '@users.invalid'
      and created_at > now() - interval '10 minutes'
  ) or exists (select 1 from public.platform_admins where user_id = p_user_id)
    or exists (select 1 from public.employees where user_id = p_user_id) then
    raise exception 'user_mismatch' using errcode = 'P0001';
  end if;

  insert into public.employees (company_id, user_id, national_id, id_type, full_name_ar, role, locale, created_by)
  values (
    v_company, p_user_id, p_national_id,
    case when left(p_national_id, 1) = '1' then 'citizen'::public.id_type else 'resident'::public.id_type end,
    private.txt(p_file, 'full_name_ar'), p_role,
    coalesce(private.txt(p_file, 'locale'), 'ar'), auth.uid()
  )
  returning id into v_id;

  perform private.write_employee_file(v_id, p_role, p_file);
  perform private.write_compensation(v_id, v_company, coalesce(p_pay, '{}'::jsonb));
  return v_id;
end;
$$;

create function public.employee_update(
  p_employee_id uuid,
  p_role public.employee_role,
  p_file jsonb,
  p_pay jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_employee(p_employee_id) or not private.can_manage_role(p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.write_employee_file(p_employee_id, p_role, p_file);
  perform private.write_compensation(p_employee_id, private.auth_company_id(), coalesce(p_pay, '{}'::jsonb));
end;
$$;

revoke execute on function
  public.employee_create(uuid, text, public.employee_role, jsonb, jsonb),
  public.employee_update(uuid, public.employee_role, jsonb, jsonb)
from public, anon;
grant execute on function
  public.employee_create(uuid, text, public.employee_role, jsonb, jsonb),
  public.employee_update(uuid, public.employee_role, jsonb, jsonb)
to authenticated;

-- ---------------------------------------------------------------------------
-- my_profile: the full own file and own pay (manager by name only, as before).
-- ---------------------------------------------------------------------------
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
    'contract_type', e.contract_type,
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
  where e.id = private.auth_employee_id();
$$;

-- ---------------------------------------------------------------------------
-- Whether the caller may manage this employee (the same rule RLS uses). Lets the app check before
-- handing out a storage upload URL. Reveals only the caller's own permission.
-- ---------------------------------------------------------------------------
create function public.can_manage_employee(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_employee(p_employee_id);
$$;
revoke execute on function public.can_manage_employee(uuid) from public, anon;
grant execute on function public.can_manage_employee(uuid) to authenticated;
