-- Security review follow-ups for phase 1c.
--  1. A manager's rights over a team's tasks follow their *current* role, like the creator's.
--  2. task_submit_report no longer trusts the attachment list it is handed: extension allowlist,
--     MIME matching the extension, the object really in storage with that size, never reused.
--  3. Files that a report, a document or the logo points at can't be deleted through the storage API.

-- ---------------------------------------------------------------------------
-- 1. Role-bound manager rights
-- ---------------------------------------------------------------------------
create or replace function private.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.company_id = private.auth_company_id()
      and (
        t.assignee_id = private.auth_employee_id()
        or (t.created_by = private.auth_employee_id() and private.auth_role() in ('owner', 'manager'))
        or private.auth_role() = 'owner'
        or (private.auth_role() = 'manager'
            and exists (select 1 from public.employees e where e.id = t.assignee_id and e.manager_id = private.auth_employee_id()))
      )
  );
$$;

create or replace function private.can_review_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.company_id = private.auth_company_id()
      and t.assignee_id <> private.auth_employee_id()
      and (
        (t.created_by = private.auth_employee_id() and private.auth_role() in ('owner', 'manager'))
        or private.auth_role() = 'owner'
        or (private.auth_role() = 'manager'
            and exists (select 1 from public.employees e where e.id = t.assignee_id and e.manager_id = private.auth_employee_id()))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Attachments are verified in the database
-- ---------------------------------------------------------------------------
create function private.mime_for_ext(p_ext text) returns text
language sql immutable set search_path = '' as $$
  select case p_ext
    when 'jpg' then 'image/jpeg'
    when 'png' then 'image/png'
    when 'webp' then 'image/webp'
    when 'heic' then 'image/heic'
    when 'pdf' then 'application/pdf'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  end;
$$;

alter table public.report_attachments drop constraint report_attachments_check;
alter table public.report_attachments add constraint report_attachments_path_check
  check (file_path ~ ('^' || company_id::text || '/reports/' || task_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|heic|pdf|docx|xlsx)$'));

create or replace function public.task_submit_report(p_task_id uuid, p jsonb, p_attachments jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_report uuid;
  v_round smallint;
  v_manager uuid;
  a jsonb;
  v_ext text;
  v_size bigint;
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

  -- Every attachment must be a file this person really uploaded to this task's folder, of an allowed
  -- type, whose declared type matches its extension and whose size matches what storage holds, and
  -- must not be attached anywhere already.
  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    v_ext := lower(substring(a ->> 'path' from '\.([a-z]+)$'));
    select (o.metadata ->> 'size')::bigint into v_size
      from storage.objects o where o.bucket_id = 'company-files' and o.name = a ->> 'path';
    if v_ext is null
       or private.mime_for_ext(v_ext) is distinct from a ->> 'mime'
       or v_size is null
       or v_size is distinct from (a ->> 'size')::bigint
       or exists (select 1 from public.report_attachments r where r.file_path = a ->> 'path') then
      raise exception 'invalid_attachment' using errcode = 'P0001';
    end if;
  end loop;

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
    values (v_task.company_id, p_task_id, v_report, a ->> 'path', left(a ->> 'name', 200), a ->> 'mime', (a ->> 'size')::integer);
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

-- ---------------------------------------------------------------------------
-- 3. Referenced files can't be deleted through the storage API
-- ---------------------------------------------------------------------------
create function private.storage_file_in_use(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.report_attachments where file_path = p_name)
      or exists (select 1 from public.employee_documents where file_path = p_name)
      or exists (select 1 from public.companies where logo_path = p_name);
$$;
grant execute on function private.storage_file_in_use(text) to authenticated;

drop policy company_files_delete on storage.objects;
create policy company_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-files' and private.storage_can_write(name) and not private.storage_file_in_use(name));
