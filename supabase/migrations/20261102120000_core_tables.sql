-- Phase 1a core tables: companies, platform admins, employees, audit log, login attempts.
-- Data model: CLAUDE.md §4. Access rules (RLS, RPCs) live in the next migration.

-- Non-exposed schema for helpers and internal tables (PostgREST only serves `public`).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Nothing in this app is readable without signing in: drop Supabase's default grants to `anon`
-- for everything created by these migrations, and stop functions being executable by default.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema private revoke execute on functions from public;

create type public.company_status as enum ('active', 'suspended');
create type public.employee_role as enum ('owner', 'hr', 'manager', 'employee');
create type public.employee_status as enum ('active', 'disabled', 'deleted');
create type public.id_type as enum ('citizen', 'resident');

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check (char_length(name_ar) between 2 and 120),
  name_en text check (char_length(name_en) between 2 and 120),
  commercial_reg text check (commercial_reg ~ '^[0-9]{10}$'),
  logo_path text,
  status public.company_status not null default 'active',
  max_employees integer not null check (max_employees between 1 and 100000),
  -- Last day of the subscription (inclusive, Asia/Riyadh).
  subscription_ends_at date not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger companies_touch before update on public.companies
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- platform_admins (system admins; not members of any company)
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  national_id text not null unique check (national_id ~ '^[12][0-9]{9}$'),
  full_name text not null check (char_length(full_name) between 2 and 120),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  -- NULL once the account is deleted; the row stays for task/report history.
  user_id uuid unique references auth.users (id) on delete set null,
  national_id text not null check (national_id ~ '^[12][0-9]{9}$'),
  id_type public.id_type not null,
  full_name_ar text not null check (char_length(full_name_ar) between 2 and 120),
  full_name_en text check (char_length(full_name_en) between 2 and 120),
  phone text check (phone ~ '^05[0-9]{8}$'),
  job_title text check (char_length(job_title) <= 120),
  role public.employee_role not null default 'employee',
  manager_id uuid,
  status public.employee_status not null default 'active',
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  deleted_at timestamptz,
  unique (company_id, id),
  -- A manager is always in the same company as the employee.
  foreign key (company_id, manager_id) references public.employees (company_id, id),
  check (manager_id is distinct from id),
  check ((id_type = 'citizen') = (left(national_id, 1) = '1')),
  check (status <> 'deleted' or user_id is null)
);

-- National ID is unique system-wide among live accounts; deleting an account frees it. CLAUDE.md §2.
create unique index employees_national_id_live on public.employees (national_id) where status <> 'deleted';
create index employees_company on public.employees (company_id, status);
create index employees_manager on public.employees (manager_id);

create trigger employees_touch before update on public.employees
  for each row execute function private.touch_updated_at();

-- Subscription seat limit, enforced in the database so two parallel inserts can't both pass. §5.5
create function private.enforce_employee_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_active integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.company_id = new.company_id then
    return new;
  end if;

  -- Row lock serialises concurrent hires in the same company.
  select max_employees into v_max from public.companies where id = new.company_id for update;
  select count(*) into v_active
    from public.employees
    where company_id = new.company_id and status = 'active' and id <> new.id;

  if v_active >= v_max then
    raise exception 'employee_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger employees_limit before insert or update of status, company_id on public.employees
  for each row execute function private.enforce_employee_limit();

-- ---------------------------------------------------------------------------
-- audit_logs (append-only; written by triggers and security-definer functions only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id),
  -- auth.users id. No FK: the trail must survive the user's deletion.
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_company_created on public.audit_logs (company_id, created_at desc);

-- Keys whose value changed between two row images, as {key: {from, to}}.
create function private.jsonb_changes(p_old jsonb, p_new jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', p_old -> n.key, 'to', n.value)), '{}'::jsonb)
  from jsonb_each(p_new) as n
  where n.key not in ('updated_at') and (p_old -> n.key) is distinct from n.value;
$$;

create function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity text := tg_argv[0];
  -- Read fields through jsonb: the same function serves tables with different columns.
  v_new jsonb := to_jsonb(new);
  v_company uuid;
  v_meta jsonb;
begin
  v_company := case v_entity when 'company' then new.id else (v_new ->> 'company_id')::uuid end;

  if tg_op = 'INSERT' then
    v_meta := case v_entity
      when 'company' then jsonb_build_object('name_ar', v_new -> 'name_ar')
      else jsonb_build_object('role', v_new -> 'role')
    end;
  else
    v_meta := jsonb_build_object('changes', private.jsonb_changes(to_jsonb(old), v_new));
    if v_meta -> 'changes' = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.audit_logs (company_id, actor_id, action, target_type, target_id, meta)
  values (v_company, auth.uid(), v_entity || '.' || lower(tg_op), v_entity, new.id::text, v_meta);
  return new;
end;
$$;

create trigger companies_audit after insert or update on public.companies
  for each row execute function private.audit_row_change('company');
create trigger employees_audit after insert or update on public.employees
  for each row execute function private.audit_row_change('employee');

-- ---------------------------------------------------------------------------
-- login_attempts (private: only the login Server Action touches it, through service-role RPCs)
-- ---------------------------------------------------------------------------
create table private.login_attempts (
  id bigint generated always as identity primary key,
  -- HMAC-SHA256 of the normalised national ID / client IP with RATE_LIMIT_PEPPER. Never raw values.
  national_id_hash text not null,
  ip_hash text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index login_attempts_id on private.login_attempts (national_id_hash, created_at desc);
create index login_attempts_ip on private.login_attempts (ip_hash, created_at desc);
create index login_attempts_created on private.login_attempts (created_at);
