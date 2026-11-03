-- Phase 1b: departments, employee management, documents and file storage. CLAUDE.md §2, §4, §5.
-- Role rule (§2): the owner manages everyone; HR manages managers and employees only; nobody
-- manages themself through these RPCs (own data lives under "profile"); one active owner minimum.

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name_ar text not null check (char_length(name_ar) between 2 and 80),
  name_en text check (char_length(name_en) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name_ar)
);

alter table public.employees add column department_id uuid;
alter table public.employees
  add constraint employees_department_fk foreign key (company_id, department_id)
  references public.departments (company_id, id) on delete set null (department_id);
create index employees_department on public.employees (department_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers on employees
-- ---------------------------------------------------------------------------
-- At least one active owner per company, whoever makes the change.
create function private.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active')
     and not exists (
       select 1 from public.employees
       where company_id = old.company_id and role = 'owner' and status = 'active' and id <> old.id
     ) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger employees_keep_owner before update of role, status on public.employees
  for each row execute function private.keep_an_owner();

-- A manager is an active owner, HR or manager (the same-company rule is the composite FK).
create function private.valid_manager() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.manager_id is not null and not exists (
    select 1 from public.employees
    where id = new.manager_id and status = 'active' and role in ('owner', 'hr', 'manager')
  ) then
    raise exception 'invalid_manager' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger employees_valid_manager before insert or update of manager_id on public.employees
  for each row execute function private.valid_manager();

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create function private.can_manage_role(p_role public.employee_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.auth_role()
    when 'owner' then true
    when 'hr' then p_role in ('manager', 'employee')
    else false
  end;
$$;

-- The caller may manage this employee: same company, role within reach, not themself, not deleted.
create function private.can_manage_employee(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id
      and e.company_id = private.auth_company_id()
      and e.id is distinct from private.auth_employee_id()
      and e.status <> 'deleted'
      and private.can_manage_role(e.role)
  );
$$;

grant execute on function private.can_manage_role(public.employee_role), private.can_manage_employee(uuid) to authenticated;

-- Ends every session of a user (refresh tokens go with them). Access tokens still verify until
-- they expire (≤ 1 h), but RLS re-checks the employee's status on every request.
create function private.revoke_sessions(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Generic rate limit (§5.11): count-and-record in one step under an advisory lock.
-- ---------------------------------------------------------------------------
create table private.action_attempts (
  id bigint generated always as identity primary key,
  kind text not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index action_attempts_lookup on private.action_attempts (kind, key, created_at desc);
alter table private.action_attempts enable row level security;
revoke all on private.action_attempts from public, anon, authenticated;

create function private.take_rate_limit(p_kind text, p_key text, p_max integer, p_window interval)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('rl:' || p_kind || ':' || p_key, 0));
  if (select count(*) from private.action_attempts
      where kind = p_kind and key = p_key and created_at > now() - p_window) >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into private.action_attempts (kind, key) values (p_kind, p_key);
  if random() < 0.01 then
    delete from private.action_attempts where created_at < now() - interval '1 day';
  end if;
end;
$$;

-- For actions that don't go through an RPC of their own (file uploads, own password change).
-- The key is always the caller, so a user can only spend their own allowance.
create function public.consume_rate_limit(p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  case p_kind
    when 'password_change' then perform private.take_rate_limit(p_kind, auth.uid()::text, 5, interval '15 minutes');
    when 'upload' then perform private.take_rate_limit(p_kind, auth.uid()::text, 60, interval '10 minutes');
    else raise exception 'unknown_limit' using errcode = 'P0001';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit: extend the row trigger to documents and deletions
-- ---------------------------------------------------------------------------
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
  values (v_company, auth.uid(), v_entity || '.' || lower(tg_op), v_entity, v_row ->> 'id', v_meta);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function private.audit(p_company uuid, p_action text, p_target_type text, p_target_id text, p_meta jsonb default '{}')
returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (company_id, actor_id, action, target_type, target_id, meta)
  values (p_company, auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_meta, '{}'::jsonb));
$$;

create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function private.audit_row_change('department');

-- ---------------------------------------------------------------------------
-- Employee management RPCs. Auth users are created/banned/deleted by the Server Action with the
-- service role; these do the authorization and the tenant writes as the signed-in user.
-- ---------------------------------------------------------------------------
create function public.employee_create(
  p_user_id uuid,
  p_national_id text,
  p_full_name_ar text,
  p_full_name_en text,
  p_phone text,
  p_job_title text,
  p_role public.employee_role,
  p_department_id uuid,
  p_manager_id uuid,
  p_locale text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_id uuid;
begin
  if v_company is null or not private.can_manage_role(p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.take_rate_limit('employee_create', v_company::text, 30, interval '10 minutes');

  if not exists (
    select 1 from auth.users where id = p_user_id and email = p_national_id || '@users.invalid'
  ) or exists (select 1 from public.platform_admins where user_id = p_user_id) then
    raise exception 'user_mismatch' using errcode = 'P0001';
  end if;

  insert into public.employees (
    company_id, user_id, national_id, id_type, full_name_ar, full_name_en, phone, job_title,
    role, department_id, manager_id, locale, created_by
  ) values (
    v_company, p_user_id, p_national_id,
    case when left(p_national_id, 1) = '1' then 'citizen'::public.id_type else 'resident'::public.id_type end,
    p_full_name_ar, nullif(p_full_name_en, ''), nullif(p_phone, ''), nullif(p_job_title, ''),
    p_role, p_department_id, p_manager_id, coalesce(nullif(p_locale, ''), 'ar'), auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.employee_update(
  p_employee_id uuid,
  p_full_name_ar text,
  p_full_name_en text,
  p_phone text,
  p_job_title text,
  p_role public.employee_role,
  p_department_id uuid,
  p_manager_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_employee(p_employee_id) or not private.can_manage_role(p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.employees set
    full_name_ar = p_full_name_ar,
    full_name_en = nullif(p_full_name_en, ''),
    phone = nullif(p_phone, ''),
    job_title = nullif(p_job_title, ''),
    role = p_role,
    department_id = p_department_id,
    manager_id = p_manager_id
  where id = p_employee_id;
end;
$$;

-- Returns the Auth user id so the caller can ban/unban it.
create function public.employee_set_status(p_employee_id uuid, p_status public.employee_status) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if p_status not in ('active', 'disabled') or not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.employees set
    status = p_status,
    disabled_at = case when p_status = 'disabled' then now() else null end
  where id = p_employee_id and user_id is not null
  returning user_id into v_user;

  if v_user is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_status = 'disabled' then
    perform private.revoke_sessions(v_user);
  end if;
  return v_user;
end;
$$;

-- Deleting is two calls around the Auth deletion: begin authorizes (no write) and returns the Auth
-- user, finish marks the row deleted. Retrying after a failure in between is safe.
create function public.employee_delete_begin(p_employee_id uuid) returns uuid
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

create function public.employee_delete_finish(p_employee_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.employees
    set status = 'deleted', user_id = null, deleted_at = now(), manager_id = null
    where id = p_employee_id;
  -- Their direct reports keep working, just without a manager.
  update public.employees set manager_id = null where manager_id = p_employee_id;
end;
$$;

-- Ends the employee's sessions and returns the Auth user whose password the caller then sets.
-- The audit row records who reset whose password, never the password.
create function public.employee_password_reset_begin(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_company uuid;
begin
  if not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select user_id, company_id into v_user, v_company from public.employees where id = p_employee_id;
  if v_user is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('password_reset', auth.uid()::text, 30, interval '10 minutes');
  perform private.revoke_sessions(v_user);
  perform private.audit(v_company, 'employee.password_reset', 'employee', p_employee_id::text);
  return v_user;
end;
$$;

-- Own profile: language and the audit trail of a self-service password change.
create function public.profile_set_locale(p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_locale not in ('ar', 'en') then
    raise exception 'invalid' using errcode = 'P0001';
  end if;
  update public.employees set locale = p_locale where id = private.auth_employee_id();
end;
$$;

create function public.profile_password_changed() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_employee uuid := private.auth_employee_id();
begin
  if v_employee is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.audit(private.auth_company_id(), 'employee.password_change', 'employee', v_employee::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Company profile (owner): name, CR and logo. Subscription stays the system admin's.
-- ---------------------------------------------------------------------------
create function public.company_update_profile(p_name_ar text, p_name_en text, p_commercial_reg text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.auth_role() is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.companies set
    name_ar = p_name_ar,
    name_en = nullif(p_name_en, ''),
    commercial_reg = nullif(p_commercial_reg, '')
  where id = private.auth_company_id();
end;
$$;

-- Returns the previous logo path so the caller can remove the old file.
create function public.company_set_logo(p_logo_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_old text;
begin
  if private.auth_role() is distinct from 'owner' then
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

-- ---------------------------------------------------------------------------
-- employee_documents
-- ---------------------------------------------------------------------------
create type public.document_type as enum ('iqama', 'national_id', 'work_permit', 'passport', 'health_card', 'contract');

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  doc_type public.document_type not null,
  number text check (char_length(number) <= 40),
  issue_date date,
  expiry_date date,
  file_path text,
  file_name text check (char_length(file_name) <= 200),
  mime_type text check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes integer check (size_bytes between 1 and 10485760),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  -- Files live under the owning company and employee; nothing else is accepted.
  check (file_path is null or file_path ~ ('^' || company_id::text || '/documents/' || employee_id::text || '/[0-9a-f-]{36}\.[a-z]{3,4}$'))
);

create index employee_documents_employee on public.employee_documents (employee_id);
create index employee_documents_expiry on public.employee_documents (company_id, expiry_date);

create trigger employee_documents_touch before update on public.employee_documents
  for each row execute function private.touch_updated_at();
create trigger employee_documents_audit after insert or update or delete on public.employee_documents
  for each row execute function private.audit_row_change('document');

-- ---------------------------------------------------------------------------
-- RLS for the new tables
-- ---------------------------------------------------------------------------
revoke all on public.departments, public.employee_documents from anon;
alter table public.departments enable row level security;
alter table public.employee_documents enable row level security;

create policy departments_select on public.departments for select to authenticated
  using (company_id = (select private.auth_company_id()));
create policy departments_write on public.departments for all to authenticated
  using (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'))
  with check (company_id = (select private.auth_company_id()) and (select private.auth_role()) in ('owner', 'hr'));

-- Documents: whoever manages the employee, and the employee themself (read only).
create policy documents_select on public.employee_documents for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and (employee_id = (select private.auth_employee_id()) or private.can_manage_employee(employee_id))
  );
create policy documents_insert on public.employee_documents for insert to authenticated
  with check (company_id = (select private.auth_company_id()) and private.can_manage_employee(employee_id));
create policy documents_update on public.employee_documents for update to authenticated
  using (company_id = (select private.auth_company_id()) and private.can_manage_employee(employee_id))
  with check (company_id = (select private.auth_company_id()) and private.can_manage_employee(employee_id));
create policy documents_delete on public.employee_documents for delete to authenticated
  using (company_id = (select private.auth_company_id()) and private.can_manage_employee(employee_id));

-- ---------------------------------------------------------------------------
-- RPC grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.consume_rate_limit(text),
  public.employee_create(uuid, text, text, text, text, text, public.employee_role, uuid, uuid, text),
  public.employee_update(uuid, text, text, text, text, public.employee_role, uuid, uuid),
  public.employee_set_status(uuid, public.employee_status),
  public.employee_delete_begin(uuid),
  public.employee_delete_finish(uuid),
  public.employee_password_reset_begin(uuid),
  public.profile_set_locale(text),
  public.profile_password_changed(),
  public.company_update_profile(text, text, text),
  public.company_set_logo(text)
from public, anon;
grant execute on function
  public.consume_rate_limit(text),
  public.employee_create(uuid, text, text, text, text, text, public.employee_role, uuid, uuid, text),
  public.employee_update(uuid, text, text, text, text, public.employee_role, uuid, uuid),
  public.employee_set_status(uuid, public.employee_status),
  public.employee_delete_begin(uuid),
  public.employee_delete_finish(uuid),
  public.employee_password_reset_begin(uuid),
  public.profile_set_locale(text),
  public.profile_password_changed(),
  public.company_update_profile(text, text, text),
  public.company_set_logo(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket. Paths: <company_id>/logo/<uuid>.<ext> and
-- <company_id>/documents/<employee_id>/<uuid>.<ext>. Policies mirror the table rules (§5.12).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-files', 'company-files', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
);

-- Path segments come from the client: a malformed one must mean "no", never an error.
create function private.uuid_or_null(p_value text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function private.uuid_or_null(text) to authenticated;

create function private.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[1] = private.auth_company_id()::text
    and case (storage.foldername(p_name))[2]
      when 'logo' then true
      when 'documents' then (storage.foldername(p_name))[3] = private.auth_employee_id()::text
        or private.can_manage_employee(private.uuid_or_null((storage.foldername(p_name))[3]))
      else false
    end;
$$;

create function private.storage_can_write(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[1] = private.auth_company_id()::text
    and case (storage.foldername(p_name))[2]
      when 'logo' then private.auth_role() = 'owner'
      when 'documents' then private.can_manage_employee(private.uuid_or_null((storage.foldername(p_name))[3]))
      else false
    end;
$$;

grant execute on function private.storage_can_read(text), private.storage_can_write(text) to authenticated;

create policy company_files_select on storage.objects for select to authenticated
  using (bucket_id = 'company-files' and private.storage_can_read(name));
create policy company_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-files' and private.storage_can_write(name));
create policy company_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-files' and private.storage_can_write(name));
