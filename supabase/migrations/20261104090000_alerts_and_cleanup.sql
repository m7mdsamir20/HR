-- Phase 1d: document expiry alerts (README §1-أ: 60, 30 and 15 days), the check that a recorded
-- document's file really exists (SECURITY.md F20), and the list of uploaded files nothing points at
-- (F12) for the cleanup job.

-- ---------------------------------------------------------------------------
-- Notifications for documents
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned', 'task_submitted', 'task_approved', 'task_changes_requested', 'document_expiring'));
alter table public.notifications
  add column document_id uuid references public.employee_documents (id) on delete cascade,
  add column days_left smallint;

-- ---------------------------------------------------------------------------
-- Which alert was already sent for which document
-- ---------------------------------------------------------------------------
create table private.document_alerts (
  document_id uuid not null references public.employee_documents (id) on delete cascade,
  threshold smallint not null check (threshold in (0, 15, 30, 60)),
  created_at timestamptz not null default now(),
  primary key (document_id, threshold)
);
alter table private.document_alerts enable row level security;
revoke all on private.document_alerts from public, anon, authenticated;

-- A renewed document (new expiry date) starts over.
create function private.reset_document_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.document_alerts where document_id = new.id;
  return new;
end;
$$;
create trigger employee_documents_reset_alerts after update of expiry_date on public.employee_documents
  for each row when (old.expiry_date is distinct from new.expiry_date)
  execute function private.reset_document_alerts();

-- ---------------------------------------------------------------------------
-- The daily job. Per document it sends ONE alert for the nearest threshold it has reached
-- (60, 30, 15 days, or 0 = expired/expires today), to the company's active owners and HR. A document
-- added with 20 days left gets a single "30" alert, not three. Returns how many documents alerted.
-- ---------------------------------------------------------------------------
create function private.generate_document_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  d record;
  v_threshold smallint;
  v_rows integer;
  v_alerted integer := 0;
begin
  for d in
    select ed.id, ed.company_id, (ed.expiry_date - v_today) as days_left
    from public.employee_documents ed
    join public.employees e on e.id = ed.employee_id and e.status = 'active'
    join public.companies c on c.id = ed.company_id and c.status = 'active' and c.subscription_ends_at >= v_today
    where ed.expiry_date is not null and (ed.expiry_date - v_today) <= 60
  loop
    v_threshold := case when d.days_left <= 0 then 0 when d.days_left <= 15 then 15 when d.days_left <= 30 then 30 else 60 end;

    -- Larger thresholds count as done, so they never fire later.
    insert into private.document_alerts (document_id, threshold)
    select d.id, t from unnest(array[0, 15, 30, 60]::smallint[]) as t where t > v_threshold
    on conflict do nothing;

    insert into private.document_alerts (document_id, threshold) values (d.id, v_threshold)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      continue;
    end if;

    insert into public.notifications (company_id, recipient_id, type, document_id, days_left)
    select d.company_id, r.id, 'document_expiring', d.id, d.days_left
    from public.employees r
    where r.company_id = d.company_id and r.status = 'active' and r.role in ('owner', 'hr');
    v_alerted := v_alerted + 1;
  end loop;
  return v_alerted;
end;
$$;
revoke execute on function private.generate_document_alerts() from public, anon, authenticated;

-- Every day at 04:00 UTC (07:00 in Riyadh).
create extension if not exists pg_cron;
select cron.schedule('document-expiry-alerts', '0 4 * * *', $$select private.generate_document_alerts()$$);

-- ---------------------------------------------------------------------------
-- A document may only point at a file that exists in storage (F20)
-- ---------------------------------------------------------------------------
create function private.require_stored_file() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.file_path is not null
     and not exists (select 1 from storage.objects o where o.bucket_id = 'company-files' and o.name = new.file_path) then
    raise exception 'file_missing' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger employee_documents_require_file before insert or update of file_path on public.employee_documents
  for each row execute function private.require_stored_file();

-- ---------------------------------------------------------------------------
-- Files nothing points at (F12): uploaded, then the report or document was never recorded. The cleanup
-- job (service role only) deletes them through the Storage API; only files older than a day, so an
-- upload still being finished is never touched.
-- ---------------------------------------------------------------------------
create function public.orphan_files(p_older_than interval default interval '1 day') returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'company-files'
    and o.created_at < now() - greatest(p_older_than, interval '1 hour')
    and not private.storage_file_in_use(o.name)
  order by o.created_at
  limit 500;
$$;
revoke execute on function public.orphan_files(interval) from public, anon, authenticated;
grant execute on function public.orphan_files(interval) to service_role;
