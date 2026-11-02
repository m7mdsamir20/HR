-- Phase 1a access rules: session helpers, RLS policies and RPCs. CLAUDE.md §5.
-- Default is deny: a table without a matching policy returns nothing to `authenticated`.

-- ---------------------------------------------------------------------------
-- Session helpers (security definer so policies can read employees without recursing into RLS)
-- ---------------------------------------------------------------------------
create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

-- The caller's membership, only while the employee, the company and the subscription are all
-- active. Every tenant policy goes through this, so disabling a user, suspending a company or
-- letting the subscription lapse cuts access on the next request, even with a valid JWT.
create function private.active_membership(out employee_id uuid, out company_id uuid, out role public.employee_role)
language sql stable security definer set search_path = '' as $$
  select e.id, e.company_id, e.role
  from public.employees e
  join public.companies c on c.id = e.company_id
  where e.user_id = (select auth.uid())
    and e.status = 'active'
    and c.status = 'active'
    and c.subscription_ends_at >= (now() at time zone 'Asia/Riyadh')::date;
$$;

create function private.auth_employee_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select employee_id from private.active_membership();
$$;

create function private.auth_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select company_id from private.active_membership();
$$;

create function private.auth_role() returns public.employee_role
language sql stable security definer set search_path = '' as $$
  select role from private.active_membership();
$$;

grant execute on function
  private.is_platform_admin(),
  private.active_membership(),
  private.auth_employee_id(),
  private.auth_company_id(),
  private.auth_role()
to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges: reads go through RLS; writes in phase 1a only through the RPCs below.
-- ---------------------------------------------------------------------------
revoke all on public.companies, public.platform_admins, public.employees, public.audit_logs from anon;
revoke insert, delete, truncate on public.companies from authenticated;
revoke insert, update, delete, truncate on public.platform_admins from authenticated;
revoke insert, update, delete, truncate on public.employees from authenticated;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
revoke all on private.login_attempts from public, anon, authenticated;

alter table public.companies enable row level security;
alter table public.platform_admins enable row level security;
alter table public.employees enable row level security;
alter table public.audit_logs enable row level security;
alter table private.login_attempts enable row level security;

-- companies
create policy companies_select on public.companies for select to authenticated
  using ((select private.is_platform_admin()) or id = (select private.auth_company_id()));

-- Subscription, limits and suspension are the system admin's alone. Owners edit their company
-- profile in phase 1b through a column-limited RPC, not through this policy.
create policy companies_admin_update on public.companies for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- platform_admins: each admin sees their own row (used to route after login).
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- employees: owner/HR see the whole company, a manager sees self + direct reports, an employee
-- sees only themself. The system admin sees all (owners list, national ID conflicts).
create policy employees_select on public.employees for select to authenticated
  using (
    (select private.is_platform_admin())
    or (
      company_id = (select private.auth_company_id())
      and (
        (select private.auth_role()) in ('owner', 'hr')
        or id = (select private.auth_employee_id())
        or ((select private.auth_role()) = 'manager' and manager_id = (select private.auth_employee_id()))
      )
    )
  );

-- audit_logs: system admin sees all; a company owner sees their company's trail.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (select private.is_platform_admin())
    or (company_id = (select private.auth_company_id()) and (select private.auth_role()) = 'owner')
  );

-- ---------------------------------------------------------------------------
-- my_account(): what the app needs to route the signed-in user, including an inactive company
-- (so an owner can be shown "subscription ended"). Returns only the caller's own data.
-- ---------------------------------------------------------------------------
create function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('kind', 'platform_admin', 'full_name', pa.full_name)
       from public.platform_admins pa
       where pa.user_id = (select auth.uid())),
    (select jsonb_build_object(
        'kind', 'employee',
        'employee_id', e.id,
        'role', e.role,
        'status', e.status,
        'full_name_ar', e.full_name_ar,
        'full_name_en', e.full_name_en,
        'locale', e.locale,
        'company', jsonb_build_object(
          'id', c.id,
          'name_ar', c.name_ar,
          'name_en', c.name_en,
          'logo_path', c.logo_path,
          'status', c.status,
          'subscription_ends_at', c.subscription_ends_at,
          'is_active', c.status = 'active'
            and c.subscription_ends_at >= (now() at time zone 'Asia/Riyadh')::date
        ))
       from public.employees e
       join public.companies c on c.id = e.company_id
       where e.user_id = (select auth.uid()) and e.status <> 'deleted')
  );
$$;

revoke execute on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_company(): company + its first owner in one transaction. The Server Action
-- creates the Auth user first (service role), then calls this as the signed-in system admin.
-- ---------------------------------------------------------------------------
create function public.admin_create_company(
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
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The Auth user must be the one derived from this national ID and not already in use.
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

revoke execute on function public.admin_create_company(text, text, text, integer, date, uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_create_company(text, text, text, integer, date, uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Login rate limit (§5.10). Service role only: the login Server Action calls these.
-- 5 failures per national ID in 15 minutes (counted since the last success), and a wider
-- 50 failures per IP, since whole offices share one IP.
--
-- login_begin() checks and records in one step under advisory locks, so parallel requests can't
-- all pass the check before any failure is written. The attempt is stored as a failure up front
-- and only flipped by login_succeeded() after the password and membership checks pass.
-- ---------------------------------------------------------------------------
create function public.login_begin(p_id_hash text, p_ip_hash text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id_failures integer;
  v_ip_failures integer;
  v_attempt bigint;
begin
  -- Always ID then IP, so two sessions can't deadlock on these locks.
  perform pg_advisory_xact_lock(hashtextextended('login:id:' || p_id_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('login:ip:' || p_ip_hash, 0));

  select count(*) into v_id_failures
    from private.login_attempts a
    where a.national_id_hash = p_id_hash
      and not a.success
      and a.created_at > greatest(
        now() - interval '15 minutes',
        coalesce((select max(s.created_at) from private.login_attempts s
                   where s.national_id_hash = p_id_hash and s.success), '-infinity'::timestamptz)
      );

  select count(*) into v_ip_failures
    from private.login_attempts a
    where a.ip_hash = p_ip_hash
      and not a.success
      and a.created_at > now() - interval '15 minutes';

  if v_id_failures >= 5 or v_ip_failures >= 50 then
    return null;
  end if;

  insert into private.login_attempts (national_id_hash, ip_hash, success)
  values (p_id_hash, p_ip_hash, false)
  returning id into v_attempt;

  -- Occasional cleanup keeps the table small without a cron job.
  if random() < 0.01 then
    delete from private.login_attempts where created_at < now() - interval '1 day';
  end if;

  return v_attempt;
end;
$$;

create function public.login_succeeded(p_attempt bigint) returns void
language sql security definer set search_path = '' as $$
  update private.login_attempts set success = true where id = p_attempt;
$$;

revoke execute on function public.login_begin(text, text) from public, anon, authenticated;
revoke execute on function public.login_succeeded(bigint) from public, anon, authenticated;
grant execute on function public.login_begin(text, text) to service_role;
grant execute on function public.login_succeeded(bigint) to service_role;
