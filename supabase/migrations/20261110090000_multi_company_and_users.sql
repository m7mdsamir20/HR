-- Migration: Multi-Company support for same Owner ID, Company Switcher, and User Account Management.

-- 1. Relax unique constraints so one user/national_id can be in multiple companies,
-- but still unique within each company.
alter table public.employees drop constraint if exists employees_user_id_key;
alter table public.employees add constraint employees_company_user_key unique (company_id, user_id);

drop index if exists public.employees_national_id_live;
create unique index if not exists employees_company_national_id_live
  on public.employees (company_id, national_id)
  where status <> 'deleted';

-- 2. Update private.active_membership() to support x-company-id header from request cookies/context,
-- with safe fallback to the user's primary active company.
create or replace function private.active_membership(
  out employee_id uuid,
  out company_id uuid,
  out role public.employee_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req_headers json;
  v_header_company text;
  v_target_company uuid := null;
begin
  if v_uid is null then
    return;
  end if;

  begin
    v_req_headers := current_setting('request.headers', true)::json;
    v_header_company := v_req_headers->>'x-company-id';
    if v_header_company is not null and v_header_company ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_target_company := v_header_company::uuid;
    end if;
  exception when others then
    v_target_company := null;
  end;

  -- Fallback to primary company if target company is invalid or membership expired
  if v_target_company is not null and not exists (
    select 1 from public.employees em
    join public.companies cm on cm.id = em.company_id
    where em.user_id = v_uid and em.company_id = v_target_company
      and em.status = 'active' and cm.status = 'active'
      and cm.subscription_ends_at >= (now() at time zone 'Asia/Riyadh')::date
  ) then
    v_target_company := null;
  end if;

  select e.id, e.company_id, e.role
  into employee_id, company_id, role
  from public.employees e
  join public.companies c on c.id = e.company_id
  where e.user_id = v_uid
    and e.status = 'active'
    and c.status = 'active'
    and c.subscription_ends_at >= (now() at time zone 'Asia/Riyadh')::date
    and (v_target_company is null or e.company_id = v_target_company)
  order by (case when e.company_id = v_target_company then 0 else 1 end), e.created_at desc
  limit 1;
end;
$$;

-- 3. Update public.my_account() to return list of all active companies the user belongs to.
create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_emp_id uuid;
  v_comp_id uuid;
  v_role public.employee_role;
  v_admin_name text;
  v_emp record;
  v_companies jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  -- Platform Admin check
  select full_name into v_admin_name
  from public.platform_admins
  where user_id = v_uid;

  if v_admin_name is not null then
    return jsonb_build_object('kind', 'platform_admin', 'full_name', v_admin_name);
  end if;

  -- Active company membership
  select employee_id, company_id, role
  into v_emp_id, v_comp_id, v_role
  from private.active_membership();

  if v_emp_id is null then
    -- Check if user is an employee whose company is expired or suspended
    select e.id, e.role, e.status, e.full_name_ar, e.full_name_en, e.locale,
           c.id as comp_id, c.name_ar as comp_name_ar, c.name_en as comp_name_en,
           c.logo_path, c.status as comp_status, c.subscription_ends_at
    into v_emp
    from public.employees e
    join public.companies c on c.id = e.company_id
    where e.user_id = v_uid and e.status <> 'deleted'
    order by e.created_at desc
    limit 1;

    if v_emp.id is null then
      return null;
    end if;

    return jsonb_build_object(
      'kind', 'employee',
      'employee_id', v_emp.id,
      'role', v_emp.role,
      'status', v_emp.status,
      'full_name_ar', v_emp.full_name_ar,
      'full_name_en', v_emp.full_name_en,
      'locale', v_emp.locale,
      'company', jsonb_build_object(
        'id', v_emp.comp_id,
        'name_ar', v_emp.comp_name_ar,
        'name_en', v_emp.comp_name_en,
        'logo_path', v_emp.logo_path,
        'status', v_emp.comp_status,
        'subscription_ends_at', v_emp.subscription_ends_at,
        'is_active', false
      ),
      'companies', '[]'::jsonb
    );
  end if;

  -- User has active membership
  select e.id, e.role, e.status, e.full_name_ar, e.full_name_en, e.locale,
         c.id as comp_id, c.name_ar as comp_name_ar, c.name_en as comp_name_en,
         c.logo_path, c.status as comp_status, c.subscription_ends_at
  into v_emp
  from public.employees e
  join public.companies c on c.id = e.company_id
  where e.id = v_emp_id;

  -- Aggregate all active companies for the user
  select coalesce(jsonb_agg(c_row), '[]'::jsonb)
  into v_companies
  from (
    select
      c2.id,
      c2.name_ar,
      c2.name_en,
      c2.logo_path,
      e2.role
    from public.employees e2
    join public.companies c2 on c2.id = e2.company_id
    where e2.user_id = v_uid
      and e2.status = 'active'
      and c2.status = 'active'
      and c2.subscription_ends_at >= (now() at time zone 'Asia/Riyadh')::date
    order by c2.name_ar
  ) c_row;

  return jsonb_build_object(
    'kind', 'employee',
    'employee_id', v_emp.id,
    'role', v_emp.role,
    'status', v_emp.status,
    'full_name_ar', v_emp.full_name_ar,
    'full_name_en', v_emp.full_name_en,
    'locale', v_emp.locale,
    'company', jsonb_build_object(
      'id', v_emp.comp_id,
      'name_ar', v_emp.comp_name_ar,
      'name_en', v_emp.comp_name_en,
      'logo_path', v_emp.logo_path,
      'status', v_emp.comp_status,
      'subscription_ends_at', v_emp.subscription_ends_at,
      'is_active', true
    ),
    'companies', v_companies
  );
end;
$$;

-- 4. Update admin_create_company to allow reusing existing Auth user ID for same national ID.
create or replace function public.admin_create_company(
  p_name_ar text,
  p_name_en text,
  p_commercial_reg text,
  p_max_employees integer,
  p_subscription_ends_at date,
  p_owner_user_id uuid,
  p_owner_national_id text,
  p_owner_name_ar text,
  p_owner_name_en text,
  p_owner_phone text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The Auth user must match this national ID and cannot be a platform admin.
  if not exists (
    select 1 from auth.users
    where id = p_owner_user_id and email = p_owner_national_id || '@users.invalid'
  ) or exists (select 1 from public.platform_admins where user_id = p_owner_user_id) then
    raise exception 'owner_user_mismatch' using errcode = 'P0001';
  end if;

  insert into public.companies (name_ar, name_en, commercial_reg, max_employees, subscription_ends_at)
  values (p_name_ar, nullif(p_name_en, ''), nullif(p_commercial_reg, ''), p_max_employees, p_subscription_ends_at)
  returning id into v_company;

  insert into public.employees (
    company_id, user_id, national_id, id_type, full_name_ar, full_name_en, phone, role, created_by
  ) values (
    v_company,
    p_owner_user_id,
    p_owner_national_id,
    case when left(p_owner_national_id, 1) = '1' then 'citizen'::public.id_type else 'resident'::public.id_type end,
    p_owner_name_ar,
    nullif(p_owner_name_en, ''),
    nullif(p_owner_phone, ''),
    'owner',
    auth.uid()
  );

  return v_company;
end;
$$;

-- 5. Update employee_create to support creating employees without an immediate user account (p_user_id is null).
create or replace function public.employee_create(
  p_user_id uuid,
  p_national_id text,
  p_role public.employee_role,
  p_file jsonb,
  p_pay jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := private.auth_company_id();
  v_id uuid;
  v_role public.employee_role := coalesce(p_role, 'employee');
begin
  if v_company is null or not private.can_manage_role(v_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is not null then
    if not exists (
      select 1 from auth.users
      where id = p_user_id
        and email = p_national_id || '@users.invalid'
    ) or exists (select 1 from public.platform_admins where user_id = p_user_id)
      or exists (select 1 from public.employees where company_id = v_company and user_id = p_user_id) then
      raise exception 'user_mismatch' using errcode = 'P0001';
    end if;
  end if;

  insert into public.employees (company_id, user_id, national_id, id_type, full_name_ar, role, locale, created_by)
  values (
    v_company, p_user_id, p_national_id,
    case when left(p_national_id, 1) = '1' then 'citizen'::public.id_type else 'resident'::public.id_type end,
    private.txt(p_file, 'full_name_ar'), v_role,
    coalesce(private.txt(p_file, 'locale'), 'ar'), auth.uid()
  )
  returning id into v_id;

  perform private.write_employee_file(v_id, v_role, p_file);
  perform private.write_compensation(v_id, v_company, coalesce(p_pay, '{}'::jsonb));
  return v_id;
end;
$$;

-- 6. RPC to assign / create a user account for an existing employee (from Settings > Users)
create or replace function public.employee_assign_user(
  p_employee_id uuid,
  p_user_id uuid,
  p_role public.employee_role,
  p_locale text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := private.auth_company_id();
  v_nat_id text;
begin
  if v_company is null or not private.can_manage_role(p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select national_id into v_nat_id
  from public.employees
  where id = p_employee_id and company_id = v_company and status = 'active';

  if v_nat_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Validate auth user matches
  if not exists (
    select 1 from auth.users
    where id = p_user_id and email = v_nat_id || '@users.invalid'
  ) or exists (select 1 from public.platform_admins where user_id = p_user_id) then
    raise exception 'user_mismatch' using errcode = 'P0001';
  end if;

  update public.employees
  set user_id = p_user_id,
      role = p_role,
      locale = coalesce(p_locale, 'ar'),
      disabled_at = null,
      updated_at = now()
  where id = p_employee_id and company_id = v_company;
end;
$$;

grant execute on function public.employee_assign_user(uuid, uuid, public.employee_role, text) to authenticated;
