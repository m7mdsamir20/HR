-- Phase 1c: tasks and proof of work (README §5). The lifecycle is enforced here:
--   assigned → in_progress → submitted → (changes_requested → in_progress/submitted …) → approved
-- Who: the owner assigns to anyone in the company, a manager to their direct reports. Nobody assigns
-- to themself, so nobody reviews their own work. Reviewers: the task's creator, the owner, and the
-- assignee's manager. All writes go through the RPCs below; tables only have read policies.

create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('assigned', 'in_progress', 'submitted', 'changes_requested', 'approved');
create type public.report_status as enum ('submitted', 'changes_requested', 'approved');

-- Delivery links in a report: https only (no javascript:, data:, http).
create function private.all_https(p_links text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(l ~ '^https://[^\s<>"]+$' and char_length(l) <= 2000), true) from unnest(p_links) as l;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  created_by uuid not null,
  assignee_id uuid not null,
  title text not null check (char_length(title) between 3 and 200),
  description text check (char_length(description) <= 4000),
  location text check (char_length(location) <= 200),
  priority public.task_priority not null default 'medium',
  due_date date not null,
  due_time time,
  expected_hours numeric(6, 2) check (expected_hours > 0 and expected_hours <= 999),
  status public.task_status not null default 'assigned',
  rating smallint check (rating between 1 and 5),
  started_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, created_by) references public.employees (company_id, id),
  foreign key (company_id, assignee_id) references public.employees (company_id, id),
  check (assignee_id <> created_by),
  check (status <> 'approved' or (rating is not null and approved_at is not null))
);

create index tasks_assignee on public.tasks (company_id, assignee_id, status);
create index tasks_company_status on public.tasks (company_id, status, due_date);
create index tasks_creator on public.tasks (created_by);

create trigger tasks_touch before update on public.tasks
  for each row execute function private.touch_updated_at();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function private.audit_row_change('task');

create table public.task_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  task_id uuid not null,
  submitted_by uuid not null,
  round smallint not null check (round between 1 and 50),
  summary text not null check (char_length(summary) between 3 and 4000),
  hours_spent numeric(6, 2) not null check (hours_spent between 0 and 999),
  obstacles text check (char_length(obstacles) <= 2000),
  links text[] not null default '{}' check (cardinality(links) <= 5 and private.all_https(links)),
  status public.report_status not null default 'submitted',
  review_note text check (char_length(review_note) <= 2000),
  rating smallint check (rating between 1 and 5),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (task_id, round),
  foreign key (company_id, task_id) references public.tasks (company_id, id) on delete cascade,
  foreign key (company_id, submitted_by) references public.employees (company_id, id),
  check (status <> 'approved' or rating is not null)
);

create index task_reports_task on public.task_reports (task_id, round desc);

create table public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  task_id uuid not null,
  report_id uuid not null,
  file_path text not null,
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key (company_id, report_id) references public.task_reports (company_id, id) on delete cascade,
  -- The file lives under the owning company and task; nothing else is accepted.
  check (file_path ~ ('^' || company_id::text || '/reports/' || task_id::text || '/[0-9a-f-]{36}\.[a-z]{3,4}$'))
);

create index report_attachments_report on public.report_attachments (report_id);

create table public.notifications (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  recipient_id uuid not null,
  actor_id uuid,
  type text not null check (type in ('task_assigned', 'task_submitted', 'task_approved', 'task_changes_requested')),
  task_id uuid references public.tasks (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, recipient_id) references public.employees (company_id, id)
);

create index notifications_inbox on public.notifications (recipient_id, created_at desc);
create index notifications_unread on public.notifications (recipient_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
-- Who may see a task: its assignee, its creator, the owner, and the assignee's manager.
create function private.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.company_id = private.auth_company_id()
      and (
        t.assignee_id = private.auth_employee_id()
        -- Creator rights follow the creator's current role: demoted to employee, they're gone.
        or (t.created_by = private.auth_employee_id() and private.auth_role() in ('owner', 'manager'))
        or private.auth_role() = 'owner'
        or exists (select 1 from public.employees e where e.id = t.assignee_id and e.manager_id = private.auth_employee_id())
      )
  );
$$;

-- Who may edit and review it: the same people minus the assignee.
create function private.can_review_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.company_id = private.auth_company_id()
      and t.assignee_id <> private.auth_employee_id()
      and (
        (t.created_by = private.auth_employee_id() and private.auth_role() in ('owner', 'manager'))
        or private.auth_role() = 'owner'
        or exists (select 1 from public.employees e where e.id = t.assignee_id and e.manager_id = private.auth_employee_id())
      )
  );
$$;

-- May the caller assign work to this employee? Owner: anyone active in the company but themself.
-- Manager: their active direct reports.
create function private.can_assign_to(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id
      and e.company_id = private.auth_company_id()
      and e.status = 'active'
      and e.id <> private.auth_employee_id()
      and (private.auth_role() = 'owner' or (private.auth_role() = 'manager' and e.manager_id = private.auth_employee_id()))
  );
$$;

grant execute on function private.can_see_task(uuid), private.can_review_task(uuid), private.can_assign_to(uuid) to authenticated;

-- People told about a submitted report: the creator and the assignee's manager (once each).
create function private.notify(p_company uuid, p_recipient uuid, p_type text, p_task uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (company_id, recipient_id, actor_id, type, task_id)
  select p_company, p_recipient, private.auth_employee_id(), p_type, p_task
  where p_recipient is not null and p_recipient is distinct from private.auth_employee_id();
$$;

-- ---------------------------------------------------------------------------
-- RLS: read policies only; every write is an RPC
-- ---------------------------------------------------------------------------
revoke all on public.tasks, public.task_reports, public.report_attachments, public.notifications from anon;
revoke insert, update, delete, truncate on public.tasks, public.task_reports, public.report_attachments, public.notifications from authenticated;
alter table public.tasks enable row level security;
alter table public.task_reports enable row level security;
alter table public.report_attachments enable row level security;
alter table public.notifications enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (company_id = (select private.auth_company_id()) and private.can_see_task(id));
create policy task_reports_select on public.task_reports for select to authenticated
  using (company_id = (select private.auth_company_id()) and private.can_see_task(task_id));
create policy report_attachments_select on public.report_attachments for select to authenticated
  using (company_id = (select private.auth_company_id()) and private.can_see_task(task_id));
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select private.auth_employee_id()));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create function public.task_create(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_assignee uuid := private.txt(p, 'assignee_id')::uuid;
  v_id uuid;
begin
  if v_company is null or private.auth_role() not in ('owner', 'manager') or not private.can_assign_to(v_assignee) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.take_rate_limit('task_create', v_company::text, 300, interval '1 hour');

  insert into public.tasks (company_id, created_by, assignee_id, title, description, location, priority, due_date, due_time, expected_hours)
  values (
    v_company, private.auth_employee_id(), v_assignee,
    private.txt(p, 'title'), private.txt(p, 'description'), private.txt(p, 'location'),
    coalesce(private.txt(p, 'priority'), 'medium')::public.task_priority,
    private.txt(p, 'due_date')::date, private.txt(p, 'due_time')::time,
    private.txt(p, 'expected_hours')::numeric
  )
  returning id into v_id;

  perform private.notify(v_company, v_assignee, 'task_assigned', v_id);
  return v_id;
end;
$$;

create function public.task_update(p_task_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_assignee uuid := private.txt(p, 'assignee_id')::uuid;
begin
  if not private.can_review_task(p_task_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.status = 'approved' then
    raise exception 'task_closed' using errcode = 'P0001';
  end if;
  -- Reassigning is a new assignment: the same rules, and only before work has been submitted.
  if v_assignee is distinct from v_task.assignee_id then
    if v_task.status not in ('assigned', 'in_progress') or not private.can_assign_to(v_assignee) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  update public.tasks set
    assignee_id = v_assignee,
    title = private.txt(p, 'title'),
    description = private.txt(p, 'description'),
    location = private.txt(p, 'location'),
    priority = coalesce(private.txt(p, 'priority'), 'medium')::public.task_priority,
    due_date = private.txt(p, 'due_date')::date,
    due_time = private.txt(p, 'due_time')::time,
    expected_hours = private.txt(p, 'expected_hours')::numeric,
    status = case when v_assignee is distinct from v_task.assignee_id then 'assigned' else status end,
    started_at = case when v_assignee is distinct from v_task.assignee_id then null else started_at end
  where id = p_task_id;

  if v_assignee is distinct from v_task.assignee_id then
    perform private.notify(v_task.company_id, v_assignee, 'task_assigned', p_task_id);
  end if;
end;
$$;

-- Only while nobody has started: afterwards the task is history.
create function public.task_delete(p_task_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_review_task(p_task_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.tasks where id = p_task_id and status = 'assigned';
  if not found then
    raise exception 'task_started' using errcode = 'P0001';
  end if;
end;
$$;

create function public.task_start(p_task_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set status = 'in_progress', started_at = now()
  where id = p_task_id
    and company_id = private.auth_company_id()
    and assignee_id = private.auth_employee_id()
    and status = 'assigned';
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- The assignee submits a completion report. Attachments were uploaded to the task's folder and
-- their content checked by the Server Action; the path check constraint pins them to this task.
create function public.task_submit_report(p_task_id uuid, p jsonb, p_attachments jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_report uuid;
  v_round smallint;
  v_manager uuid;
  a jsonb;
begin
  select * into v_task from public.tasks
  where id = p_task_id and company_id = private.auth_company_id() and assignee_id = private.auth_employee_id()
  for update;
  if v_task.id is null or v_task.status not in ('assigned', 'in_progress', 'changes_requested') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 10 then
    raise exception 'too_many_files' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('report_submit', auth.uid()::text, 30, interval '10 minutes');

  select coalesce(max(round), 0) + 1 into v_round from public.task_reports where task_id = p_task_id;
  insert into public.task_reports (company_id, task_id, submitted_by, round, summary, hours_spent, obstacles, links)
  values (
    v_task.company_id, p_task_id, v_task.assignee_id, v_round,
    private.txt(p, 'summary'), coalesce(private.txt(p, 'hours_spent')::numeric, 0), private.txt(p, 'obstacles'),
    coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p -> 'links', '[]'::jsonb))), '{}')
  )
  returning id into v_report;

  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    insert into public.report_attachments (company_id, task_id, report_id, file_path, file_name, mime_type, size_bytes)
    values (v_task.company_id, p_task_id, v_report, a ->> 'path', a ->> 'name', a ->> 'mime', (a ->> 'size')::integer);
  end loop;

  update public.tasks set
    status = 'submitted',
    submitted_at = now(),
    started_at = coalesce(started_at, now())
  where id = p_task_id;

  select manager_id into v_manager from public.employees where id = v_task.assignee_id;
  perform private.notify(v_task.company_id, v_task.created_by, 'task_submitted', p_task_id);
  if v_manager is distinct from v_task.created_by then
    perform private.notify(v_task.company_id, v_manager, 'task_submitted', p_task_id);
  end if;
  return v_report;
end;
$$;

-- Approve (1-5 rating) or send back with a note. Approval is audited (CLAUDE.md §5.18).
create function public.task_review(p_task_id uuid, p_decision text, p_rating integer, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_report uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  if not private.can_review_task(p_task_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.status <> 'submitted' then
    raise exception 'not_submitted' using errcode = 'P0001';
  end if;
  select id into v_report from public.task_reports where task_id = p_task_id order by round desc limit 1;

  if p_decision = 'approve' then
    if p_rating is null or p_rating not between 1 and 5 then
      raise exception 'rating_required' using errcode = 'P0001';
    end if;
    update public.task_reports set status = 'approved', rating = p_rating, review_note = v_note,
      reviewed_by = private.auth_employee_id(), reviewed_at = now()
    where id = v_report;
    update public.tasks set status = 'approved', rating = p_rating, approved_at = now() where id = p_task_id;
    perform private.audit(v_task.company_id, 'task.approve', 'task', p_task_id::text, jsonb_build_object('rating', p_rating));
    perform private.notify(v_task.company_id, v_task.assignee_id, 'task_approved', p_task_id);
  elsif p_decision = 'changes' then
    if v_note is null then
      raise exception 'note_required' using errcode = 'P0001';
    end if;
    update public.task_reports set status = 'changes_requested', review_note = v_note,
      reviewed_by = private.auth_employee_id(), reviewed_at = now()
    where id = v_report;
    update public.tasks set status = 'changes_requested' where id = p_task_id;
    perform private.notify(v_task.company_id, v_task.assignee_id, 'task_changes_requested', p_task_id);
  else
    raise exception 'invalid' using errcode = 'P0001';
  end if;
end;
$$;

-- Marks the caller's notifications read: the given ones, or all when p_ids is null.
create function public.notifications_mark_read(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where recipient_id = private.auth_employee_id()
    and read_at is null
    and (p_ids is null or id = any (p_ids));
$$;

-- Lets the app check before handing out an upload URL for report attachments.
create function public.can_submit_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks
    where id = p_task_id
      and company_id = private.auth_company_id()
      and assignee_id = private.auth_employee_id()
      and status in ('assigned', 'in_progress', 'changes_requested')
  );
$$;

revoke execute on function
  public.task_create(jsonb),
  public.task_update(uuid, jsonb),
  public.task_delete(uuid),
  public.task_start(uuid),
  public.task_submit_report(uuid, jsonb, jsonb),
  public.task_review(uuid, text, integer, text),
  public.notifications_mark_read(bigint[]),
  public.can_submit_task(uuid)
from public, anon;
grant execute on function
  public.task_create(jsonb),
  public.task_update(uuid, jsonb),
  public.task_delete(uuid),
  public.task_start(uuid),
  public.task_submit_report(uuid, jsonb, jsonb),
  public.task_review(uuid, text, integer, text),
  public.notifications_mark_read(bigint[]),
  public.can_submit_task(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: report attachments under <company>/reports/<task>/<uuid>.<ext>
-- Read: whoever sees the task. Write: the assignee while the task is open for a report.
-- ---------------------------------------------------------------------------
create or replace function private.storage_can_read(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[1] = private.auth_company_id()::text
    and case (storage.foldername(p_name))[2]
      when 'logo' then true
      when 'documents' then (storage.foldername(p_name))[3] = private.auth_employee_id()::text
        or private.can_manage_employee(private.uuid_or_null((storage.foldername(p_name))[3]))
      when 'reports' then private.can_see_task(private.uuid_or_null((storage.foldername(p_name))[3]))
      else false
    end;
$$;

create or replace function private.storage_can_write(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_name))[1] = private.auth_company_id()::text
    and case (storage.foldername(p_name))[2]
      when 'logo' then private.auth_role() = 'owner'
      when 'documents' then private.can_manage_employee(private.uuid_or_null((storage.foldername(p_name))[3]))
      when 'reports' then public.can_submit_task(private.uuid_or_null((storage.foldername(p_name))[3]))
      else false
    end;
$$;
