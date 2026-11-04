-- Phase 3a: Employee Advances & GOSI Engine (README §3 & CLAUDE.md §8).
--
-- GOSI (General Organization for Social Insurance) rules in Saudi Arabia:
--   Contributory wage = least(basic_salary + housing_allowance, 45000.00)
--   Saudi citizen:
--     Annuities: 9% employee + 9% employer
--     Saned (unemployment): 0.75% employee + 0.75% employer
--     Occupational hazards: 2% employer (0% employee)
--     Total employee share: 9.75%
--     Total employer share: 11.75%
--   Non-Saudi resident:
--     Occupational hazards: 2% employer only (0% employee)
--     Total employee share: 0%
--     Total employer share: 2%
--
-- Advances (سلف الموظفين):
--   Employee requests an advance with amount, installments count (1-24), and reason.
--   Monthly installment cannot exceed 50% of the employee's basic salary.
--   Employee cannot have more than one active/pending advance at a time.
--   Approval: Owner or HR (not themself, not owner).
--   Installment deduction: automated during payroll run (Phase 3b) or manual early repayment.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.advance_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null,
  amount numeric(10, 2) not null check (amount between 100 and 100000),
  installments_count integer not null check (installments_count between 1 and 24),
  monthly_installment numeric(10, 2) not null check (monthly_installment > 0),
  paid_amount numeric(10, 2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  remaining_amount numeric(10, 2) generated always as (amount - paid_amount) stored,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, employee_id) references public.employees (company_id, id),
  check ((status in ('approved', 'rejected', 'completed')) = (decided_at is not null and decided_by is not null)),
  check (status <> 'rejected' or decision_note is not null)
);
create index advance_requests_employee on public.advance_requests (employee_id, status);
create index advance_requests_company_status on public.advance_requests (company_id, status);

create table public.advance_installments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  advance_id uuid not null references public.advance_requests (id) on delete cascade,
  employee_id uuid not null,
  amount numeric(10, 2) not null check (amount > 0),
  payment_date date not null,
  method text not null check (method in ('payroll_deduction', 'manual_repayment')),
  notes text check (char_length(notes) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);
create index advance_installments_advance on public.advance_installments (advance_id);
create index advance_installments_employee on public.advance_installments (employee_id, payment_date);

-- Notifications about advances
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned', 'task_submitted', 'task_approved', 'task_changes_requested', 'document_expiring', 'leave_requested', 'leave_decided', 'advance_requested', 'advance_decided'));
alter table public.notifications add column if not exists advance_id uuid references public.advance_requests (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- RLS: Reads only; writes are RPCs
-- ---------------------------------------------------------------------------
revoke all on public.advance_requests, public.advance_installments from anon;
revoke insert, update, delete, truncate on public.advance_requests, public.advance_installments from authenticated;
alter table public.advance_requests enable row level security;
alter table public.advance_installments enable row level security;

-- Advances contain confidential financial compensation information:
-- Accessible to Owner, HR, and the concerned employee themselves.
-- Managers do not have access.
create policy advances_select on public.advance_requests for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and (
      (select private.auth_role()) in ('owner', 'hr')
      or employee_id = (select private.auth_employee_id())
    )
  );

create policy advance_installments_select on public.advance_installments for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and (
      (select private.auth_role()) in ('owner', 'hr')
      or employee_id = (select private.auth_employee_id())
    )
  );

-- ---------------------------------------------------------------------------
-- Calculations & Helpers
-- ---------------------------------------------------------------------------

-- GOSI breakdown calculation
create function private.calculate_gosi(p_employee_id uuid)
returns table (
  contributory_wage numeric(12, 2),
  employee_share numeric(12, 2),
  employer_share numeric(12, 2),
  annuities_employee numeric(12, 2),
  annuities_employer numeric(12, 2),
  saned_employee numeric(12, 2),
  saned_employer numeric(12, 2),
  hazards_employer numeric(12, 2)
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id_type public.id_type;
  v_basic numeric(12, 2);
  v_housing numeric(12, 2);
  v_contributory numeric(12, 2);
begin
  select e.id_type, coalesce(c.basic_salary, 0), coalesce(c.housing_allowance, 0)
  into v_id_type, v_basic, v_housing
  from public.employees e
  left join public.employee_compensation c on c.employee_id = e.id
  where e.id = p_employee_id;

  if v_id_type is null then
    return;
  end if;

  -- Contributory wage capped at 45,000 SAR
  v_contributory := least(greatest(v_basic + v_housing, 0), 45000.00);

  if v_id_type = 'citizen' then
    contributory_wage := v_contributory;
    annuities_employee := round(v_contributory * 0.09, 2);
    annuities_employer := round(v_contributory * 0.09, 2);
    saned_employee := round(v_contributory * 0.0075, 2);
    saned_employer := round(v_contributory * 0.0075, 2);
    hazards_employer := round(v_contributory * 0.02, 2);
    employee_share := annuities_employee + saned_employee;
    employer_share := annuities_employer + saned_employer + hazards_employer;
    return next;
  else
    contributory_wage := v_contributory;
    annuities_employee := 0;
    annuities_employer := 0;
    saned_employee := 0;
    saned_employer := 0;
    hazards_employer := round(v_contributory * 0.02, 2);
    employee_share := 0;
    employer_share := hazards_employer;
    return next;
  end if;
end;
$$;

-- Public GOSI preview helper (accessible to self or owner/HR)
create function public.employee_gosi_preview(p_employee_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_res record;
begin
  if p_employee_id <> private.auth_employee_id() and not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_res from private.calculate_gosi(p_employee_id);
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'contributory_wage', v_res.contributory_wage,
    'employee_share', v_res.employee_share,
    'employer_share', v_res.employer_share,
    'annuities_employee', v_res.annuities_employee,
    'annuities_employer', v_res.annuities_employer,
    'saned_employee', v_res.saned_employee,
    'saned_employer', v_res.saned_employer,
    'hazards_employer', v_res.hazards_employer
  );
end;
$$;

-- Notification helper for advances
create function private.notify_advance(p_company uuid, p_recipient uuid, p_type text, p_advance uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null then return; end if;
  insert into public.notifications (company_id, recipient_id, type, advance_id, payload)
  values (p_company, p_recipient, p_type, p_advance, '{}'::jsonb);
end;
$$;

create function private.notify_advance_approvers(p_advance_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  a record;
begin
  select company_id, employee_id into r from public.advance_requests where id = p_advance_id;
  if not found then return; end if;

  -- Notify active HR and owners of the company (excluding the applicant themself)
  for a in
    select id from public.employees
    where company_id = r.company_id and role in ('owner', 'hr')
      and status = 'active' and id <> r.employee_id
  loop
    perform private.notify_advance(r.company_id, a.id, 'advance_requested', p_advance_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Employee requests an advance
create function public.advance_request_create(
  p_amount numeric,
  p_installments integer,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_employee uuid := private.auth_employee_id();
  v_basic numeric(12, 2);
  v_monthly numeric(10, 2);
  v_id uuid;
begin
  if v_company is null or v_employee is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_amount is null or p_amount < 100 or p_amount > 100000 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  if p_installments is null or p_installments < 1 or p_installments > 24 then
    raise exception 'invalid_installments' using errcode = 'P0001';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(p_reason) > 500 then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  -- Check employee basic salary for 50% max installment limit
  select coalesce(basic_salary, 0) into v_basic
  from public.employee_compensation
  where employee_id = v_employee and company_id = v_company;

  if v_basic is null or v_basic <= 0 then
    raise exception 'no_compensation_record' using errcode = 'P0001';
  end if;

  v_monthly := round(p_amount / p_installments, 2);
  if v_monthly > round(v_basic * 0.50, 2) then
    raise exception 'installment_exceeds_salary_limit' using errcode = 'P0001';
  end if;

  -- Check if employee already has an active or pending advance
  if exists (
    select 1 from public.advance_requests
    where company_id = v_company and employee_id = v_employee
      and status in ('pending', 'approved')
  ) then
    raise exception 'existing_active_advance' using errcode = 'P0001';
  end if;

  insert into public.advance_requests (
    company_id, employee_id, amount, installments_count, monthly_installment, reason, status
  ) values (
    v_company, v_employee, p_amount, p_installments, v_monthly, trim(p_reason), 'pending'
  ) returning id into v_id;

  perform private.notify_advance_approvers(v_id);
  return v_id;
end;
$$;

-- Owner or HR decides on an advance request
create function public.advance_request_decide(
  p_id uuid,
  p_decision text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_role public.employee_role := private.auth_role();
  v_employee uuid := private.auth_employee_id();
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;

  if p_decision = 'rejected' and (p_note is null or char_length(trim(p_note)) < 3) then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  select * into r from public.advance_requests
  where id = p_id and company_id = private.auth_company_id()
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if r.status <> 'pending' then
    raise exception 'not_pending' using errcode = 'P0001';
  end if;

  -- Can caller decide?
  -- Owner can decide for anyone except self; HR can decide for anyone they can manage
  if v_role = 'owner' then
    if r.employee_id = v_employee then
      raise exception 'cannot_decide_own_request' using errcode = '42501';
    end if;
  elsif v_role = 'hr' then
    if not private.can_manage_employee(r.employee_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.advance_requests
  set status = p_decision,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_note = nullif(trim(p_note), '')
  where id = p_id;

  perform private.notify_advance(r.company_id, r.employee_id, 'advance_decided', p_id);
end;
$$;

-- Employee cancels their own pending advance request
create function public.advance_request_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_employee uuid := private.auth_employee_id();
  v_role public.employee_role := private.auth_role();
begin
  select * into r from public.advance_requests
  where id = p_id and company_id = private.auth_company_id()
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if r.status <> 'pending' then
    raise exception 'cannot_cancel_non_pending' using errcode = 'P0001';
  end if;

  if r.employee_id <> v_employee and v_role not in ('owner', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.advance_requests
  set status = 'cancelled'
  where id = p_id;
end;
$$;

-- Owner or HR records a manual early repayment on an approved advance
create function public.advance_manual_repayment(
  p_advance_id uuid,
  p_amount numeric,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_role public.employee_role := private.auth_role();
  v_inst_id uuid;
begin
  if v_role not in ('owner', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  select * into r from public.advance_requests
  where id = p_advance_id and company_id = private.auth_company_id()
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if r.status <> 'approved' then
    raise exception 'not_an_approved_advance' using errcode = 'P0001';
  end if;

  if p_amount > r.remaining_amount then
    raise exception 'amount_exceeds_remaining' using errcode = 'P0001';
  end if;

  insert into public.advance_installments (
    company_id, advance_id, employee_id, amount, payment_date, method, notes, created_by
  ) values (
    r.company_id, r.id, r.employee_id, p_amount, (now() at time zone 'Asia/Riyadh')::date,
    'manual_repayment', trim(p_note), auth.uid()
  ) returning id into v_inst_id;

  update public.advance_requests
  set paid_amount = paid_amount + p_amount,
      status = case when paid_amount + p_amount >= amount then 'completed' else 'approved' end
  where id = r.id;

  return v_inst_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function Grants
-- ---------------------------------------------------------------------------
grant execute on function public.employee_gosi_preview(uuid) to authenticated;
grant execute on function public.advance_request_create(numeric, integer, text) to authenticated;
grant execute on function public.advance_request_decide(uuid, text, text) to authenticated;
grant execute on function public.advance_request_cancel(uuid) to authenticated;
grant execute on function public.advance_manual_repayment(uuid, numeric, text) to authenticated;

