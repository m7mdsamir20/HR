-- Grant 'admin' role full task creation, assignment, review, and visibility parity with owner

-- 1. private.can_assign_to
create or replace function private.can_assign_to(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id
      and e.company_id = private.auth_company_id()
      and e.status = 'active'
      and e.id <> private.auth_employee_id()
      and (private.auth_role() in ('owner', 'admin') or (private.auth_role() = 'manager' and e.manager_id = private.auth_employee_id()))
  );
$$;

-- 2. private.can_see_task
create or replace function private.can_see_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.company_id = private.auth_company_id()
      and (
        t.assignee_id = private.auth_employee_id()
        or (t.created_by = private.auth_employee_id() and private.auth_role() in ('owner', 'admin', 'manager'))
        or private.auth_role() in ('owner', 'admin')
        or (private.auth_role() = 'manager'
            and exists (select 1 from public.employees e where e.id = t.assignee_id and e.manager_id = private.auth_employee_id()))
      )
  );
$$;

-- 3. private.can_review_task
create or replace function private.can_review_task(p_task_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.company_id = private.auth_company_id()
      and t.assignee_id <> private.auth_employee_id()
      and (
        (t.created_by = private.auth_employee_id() and private.auth_role() in ('owner', 'admin', 'manager'))
        or private.auth_role() in ('owner', 'admin')
        or (private.auth_role() = 'manager'
            and exists (select 1 from public.employees e where e.id = t.assignee_id and e.manager_id = private.auth_employee_id()))
      )
  );
$$;

-- 4. public.task_create
create or replace function public.task_create(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_assignee uuid := private.txt(p, 'assignee_id')::uuid;
  v_id uuid;
begin
  if v_company is null or private.auth_role() not in ('owner', 'admin', 'manager') or not private.can_assign_to(v_assignee) then
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
