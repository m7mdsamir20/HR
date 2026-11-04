-- Phase 3b: Monthly Payroll Runs, Slips, WPS, and Deductions Reconciliation (README §3 & CLAUDE.md §8).
--
-- Features:
--   - Monthly payroll runs for a company (year, month).
--   - Individual employee payslips with full earnings (basic, housing, transport, comms, other).
--   - Automated deductions integration:
--       1. GOSI calculation (Saudi 9.75% employee + 11.75% employer, expat 2% employer hazards).
--       2. Approved attendance deductions (late/early/absence based on day_fraction * basic / 30).
--       3. Approved unpaid/reduced sick leaves (days_unpaid * basic / 30 + days_three_quarter * 0.25 * basic / 30).
--       4. Scheduled monthly installment from active approved advance.
--       5. Manual adjustments / bonuses / extra deductions with notes.
--   - Run approval locks the run and automatically commits advance repayments.
--   - RLS: Employee sees only their own slips; Owner and HR see all runs and slips; Managers have no access.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  year integer not null check (year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'cancelled')),
  total_basic numeric(12, 2) not null default 0,
  total_housing numeric(12, 2) not null default 0,
  total_other_allowances numeric(12, 2) not null default 0,
  total_gross numeric(12, 2) not null default 0,
  total_gosi_employee numeric(12, 2) not null default 0,
  total_gosi_employer numeric(12, 2) not null default 0,
  total_attendance_deductions numeric(12, 2) not null default 0,
  total_leave_deductions numeric(12, 2) not null default 0,
  total_advance_deductions numeric(12, 2) not null default 0,
  total_other_deductions numeric(12, 2) not null default 0,
  total_deductions numeric(12, 2) not null default 0,
  total_net numeric(12, 2) not null default 0,
  employee_count integer not null default 0,
  notes text check (char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, year, month),
  check ((status in ('approved', 'paid')) = (approved_at is not null and approved_by is not null))
);
create index payroll_runs_company_year_month on public.payroll_runs (company_id, year, month);

create table public.payroll_slips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id uuid not null,
  -- Earnings breakdown
  basic_salary numeric(12, 2) not null default 0 check (basic_salary >= 0),
  housing_allowance numeric(12, 2) not null default 0 check (housing_allowance >= 0),
  transport_allowance numeric(12, 2) not null default 0 check (transport_allowance >= 0),
  communication_allowance numeric(12, 2) not null default 0 check (communication_allowance >= 0),
  other_allowances numeric(12, 2) not null default 0 check (other_allowances >= 0),
  gross_salary numeric(12, 2) not null default 0 check (gross_salary >= 0),
  -- Deductions breakdown
  gosi_employee numeric(12, 2) not null default 0 check (gosi_employee >= 0),
  gosi_employer numeric(12, 2) not null default 0 check (gosi_employer >= 0),
  attendance_deduction numeric(12, 2) not null default 0 check (attendance_deduction >= 0),
  leave_deduction numeric(12, 2) not null default 0 check (leave_deduction >= 0),
  advance_deduction numeric(12, 2) not null default 0 check (advance_deduction >= 0),
  other_deductions numeric(12, 2) not null default 0 check (other_deductions >= 0),
  total_deductions numeric(12, 2) not null default 0 check (total_deductions >= 0),
  -- Net
  net_salary numeric(12, 2) not null default 0 check (net_salary >= 0),
  -- Payment info snapshot
  bank_name text check (char_length(bank_name) <= 80),
  iban text check (iban is null or iban ~ '^SA[0-9]{22}$'),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id),
  foreign key (company_id, employee_id) references public.employees (company_id, id)
);
create index payroll_slips_employee on public.payroll_slips (employee_id);
create index payroll_slips_run on public.payroll_slips (payroll_run_id);

-- Add payroll notifications
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned', 'task_submitted', 'task_approved', 'task_changes_requested', 'document_expiring', 'leave_requested', 'leave_decided', 'advance_requested', 'advance_decided', 'payroll_ready'));
alter table public.notifications add column if not exists payroll_slip_id uuid references public.payroll_slips (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- RLS: Reads only; writes are RPCs
-- ---------------------------------------------------------------------------
revoke all on public.payroll_runs, public.payroll_slips from anon;
revoke insert, update, delete, truncate on public.payroll_runs, public.payroll_slips from authenticated;
alter table public.payroll_runs enable row level security;
alter table public.payroll_slips enable row level security;

-- Payroll runs are accessible only to Owner and HR
create policy payroll_runs_select on public.payroll_runs for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and (select private.auth_role()) in ('owner', 'hr')
  );

-- Payroll slips: Owner/HR can see all in company; Employee can see their own slips
create policy payroll_slips_select on public.payroll_slips for select to authenticated
  using (
    company_id = (select private.auth_company_id())
    and (
      (select private.auth_role()) in ('owner', 'hr')
      or employee_id = (select private.auth_employee_id())
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs & Helpers
-- ---------------------------------------------------------------------------

-- Helper to recompute totals for a payroll run
create function private.recompute_payroll_run(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.payroll_runs r
  set total_basic = coalesce(s.basic, 0),
      total_housing = coalesce(s.housing, 0),
      total_other_allowances = coalesce(s.other_allow, 0),
      total_gross = coalesce(s.gross, 0),
      total_gosi_employee = coalesce(s.gosi_ee, 0),
      total_gosi_employer = coalesce(s.gosi_er, 0),
      total_attendance_deductions = coalesce(s.att_ded, 0),
      total_leave_deductions = coalesce(s.leave_ded, 0),
      total_advance_deductions = coalesce(s.adv_ded, 0),
      total_other_deductions = coalesce(s.other_ded, 0),
      total_deductions = coalesce(s.tot_ded, 0),
      total_net = coalesce(s.net, 0),
      employee_count = coalesce(s.cnt, 0)
  from (
    select
      sum(basic_salary) as basic,
      sum(housing_allowance) as housing,
      sum(transport_allowance + communication_allowance + other_allowances) as other_allow,
      sum(gross_salary) as gross,
      sum(gosi_employee) as gosi_ee,
      sum(gosi_employer) as gosi_er,
      sum(attendance_deduction) as att_ded,
      sum(leave_deduction) as leave_ded,
      sum(advance_deduction) as adv_ded,
      sum(other_deductions) as other_ded,
      sum(total_deductions) as tot_ded,
      sum(net_salary) as net,
      count(*)::integer as cnt
    from public.payroll_slips
    where payroll_run_id = p_run_id
  ) s
  where r.id = p_run_id;
end;
$$;

-- Create monthly payroll run (computes drafts for all active employees)
create function public.payroll_run_create(
  p_year integer,
  p_month integer,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_role public.employee_role := private.auth_role();
  v_run_id uuid;
  v_emp record;
  v_gosi record;
  v_att_ded numeric(12, 2);
  v_leave_ded numeric(12, 2);
  v_adv_ded numeric(12, 2);
  v_gross numeric(12, 2);
  v_tot_ded numeric(12, 2);
  v_net numeric(12, 2);
  v_start_date date;
  v_end_date date;
  v_active_adv record;
begin
  if v_role not in ('owner', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_year is null or p_year < 2020 or p_year > 2100 or p_month is null or p_month < 1 or p_month > 12 then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.payroll_runs
    where company_id = v_company and year = p_year and month = p_month
      and status <> 'cancelled'
  ) then
    raise exception 'run_already_exists' using errcode = 'P0001';
  end if;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  insert into public.payroll_runs (
    company_id, year, month, status, notes, created_by
  ) values (
    v_company, p_year, p_month, 'draft', trim(p_notes), auth.uid()
  ) returning id into v_run_id;

  -- Generate slips for active employees with compensation records
  for v_emp in
    select
      e.id as employee_id,
      coalesce(c.basic_salary, 0) as basic_salary,
      coalesce(c.housing_allowance, 0) as housing_allowance,
      coalesce(c.transport_allowance, 0) as transport_allowance,
      coalesce(c.communication_allowance, 0) as communication_allowance,
      coalesce(c.other_allowances, 0) as other_allowances,
      c.bank_name,
      c.iban
    from public.employees e
    join public.employee_compensation c on c.employee_id = e.id
    where e.company_id = v_company and e.status = 'active'
  loop
    -- 1. GOSI
    select * into v_gosi from private.calculate_gosi(v_emp.employee_id);

    -- 2. Attendance deductions (approved within this month)
    select coalesce(sum(
      round(d.day_fraction * (v_emp.basic_salary / 30.0), 2)
    ), 0)
    into v_att_ded
    from public.attendance_deductions d
    where d.company_id = v_company and d.employee_id = v_emp.employee_id
      and d.status = 'approved'
      and d.work_date between v_start_date and v_end_date;

    -- 3. Leave deductions (unpaid days & three-quarter days)
    select coalesce(sum(
      round(coalesce(l.days_unpaid, 0) * (v_emp.basic_salary / 30.0) +
            coalesce(l.days_three_quarter, 0) * 0.25 * (v_emp.basic_salary / 30.0), 2)
    ), 0)
    into v_leave_ded
    from public.leave_requests l
    where l.company_id = v_company and l.employee_id = v_emp.employee_id
      and l.status = 'approved'
      and l.start_date <= v_end_date and l.end_date >= v_start_date;

    -- 4. Advance installment
    v_adv_ded := 0;
    select * into v_active_adv
    from public.advance_requests
    where company_id = v_company and employee_id = v_emp.employee_id
      and status = 'approved' and remaining_amount > 0
    order by created_at asc
    limit 1;

    if found then
      v_adv_ded := least(v_active_adv.monthly_installment, v_active_adv.remaining_amount);
    end if;

    -- Totals
    v_gross := v_emp.basic_salary + v_emp.housing_allowance + v_emp.transport_allowance +
               v_emp.communication_allowance + v_emp.other_allowances;

    v_tot_ded := coalesce(v_gosi.employee_share, 0) + v_att_ded + v_leave_ded + v_adv_ded;
    v_net := greatest(0, v_gross - v_tot_ded);

    insert into public.payroll_slips (
      company_id, payroll_run_id, employee_id,
      basic_salary, housing_allowance, transport_allowance, communication_allowance, other_allowances,
      gross_salary,
      gosi_employee, gosi_employer,
      attendance_deduction, leave_deduction, advance_deduction, other_deductions,
      total_deductions, net_salary,
      bank_name, iban
    ) values (
      v_company, v_run_id, v_emp.employee_id,
      v_emp.basic_salary, v_emp.housing_allowance, v_emp.transport_allowance, v_emp.communication_allowance, v_emp.other_allowances,
      v_gross,
      coalesce(v_gosi.employee_share, 0), coalesce(v_gosi.employer_share, 0),
      v_att_ded, v_leave_ded, v_adv_ded, 0,
      v_tot_ded, v_net,
      v_emp.bank_name, v_emp.iban
    );
  end loop;

  perform private.recompute_payroll_run(v_run_id);
  return v_run_id;
end;
$$;

-- Adjust an individual slip (bonus or extra deduction) while run is in draft
create function public.payroll_slip_adjust(
  p_slip_id uuid,
  p_other_allowances numeric,
  p_other_deductions numeric,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  r record;
  v_role public.employee_role := private.auth_role();
  v_gross numeric(12, 2);
  v_tot_ded numeric(12, 2);
  v_net numeric(12, 2);
begin
  if v_role not in ('owner', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_other_allowances < 0 or p_other_deductions < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  select * into s from public.payroll_slips
  where id = p_slip_id and company_id = private.auth_company_id()
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into r from public.payroll_runs where id = s.payroll_run_id;
  if r.status <> 'draft' then
    raise exception 'run_locked' using errcode = 'P0001';
  end if;

  v_gross := s.basic_salary + s.housing_allowance + s.transport_allowance +
             s.communication_allowance + p_other_allowances;
  v_tot_ded := s.gosi_employee + s.attendance_deduction + s.leave_deduction +
               s.advance_deduction + p_other_deductions;
  v_net := greatest(0, v_gross - v_tot_ded);

  update public.payroll_slips
  set other_allowances = p_other_allowances,
      other_deductions = p_other_deductions,
      gross_salary = v_gross,
      total_deductions = v_tot_ded,
      net_salary = v_net,
      notes = trim(p_notes)
  where id = p_slip_id;

  perform private.recompute_payroll_run(s.payroll_run_id);
end;
$$;

-- Approve and lock payroll run (owner only)
create function public.payroll_run_approve(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s record;
  v_role public.employee_role := private.auth_role();
  v_adv record;
begin
  if v_role <> 'owner' then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  select * into r from public.payroll_runs
  where id = p_run_id and company_id = private.auth_company_id()
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if r.status <> 'draft' then
    raise exception 'not_draft' using errcode = 'P0001';
  end if;

  -- Lock run
  update public.payroll_runs
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  where id = p_run_id;

  -- Process advance repayments and notify employees
  for s in select * from public.payroll_slips where payroll_run_id = p_run_id loop
    if s.advance_deduction > 0 then
      select * into v_adv from public.advance_requests
      where company_id = r.company_id and employee_id = s.employee_id
        and status = 'approved' and remaining_amount > 0
      order by created_at asc
      limit 1;

      if found then
        insert into public.advance_installments (
          company_id, advance_id, employee_id, amount, payment_date, method, notes, created_by
        ) values (
          r.company_id, v_adv.id, s.employee_id, s.advance_deduction, (now() at time zone 'Asia/Riyadh')::date,
          'payroll_deduction', format('خصم مسير رواتب شهر %s/%s', r.month, r.year), auth.uid()
        );

        update public.advance_requests
        set paid_amount = paid_amount + s.advance_deduction,
            status = case when paid_amount + s.advance_deduction >= amount then 'completed' else 'approved' end
        where id = v_adv.id;
      end if;
    end if;

    -- Send notification to employee
    insert into public.notifications (
      company_id, recipient_id, type, payroll_slip_id, payload
    ) values (
      r.company_id, s.employee_id, 'payroll_ready', s.id,
      jsonb_build_object('year', r.year, 'month', r.month, 'net', s.net_salary)
    );
  end loop;
end;
$$;

-- Delete draft payroll run
create function public.payroll_run_delete(p_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_role public.employee_role := private.auth_role();
begin
  if v_role not in ('owner', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into r from public.payroll_runs
  where id = p_run_id and company_id = private.auth_company_id();

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if r.status <> 'draft' then
    raise exception 'cannot_delete_locked_run' using errcode = 'P0001';
  end if;

  delete from public.payroll_runs where id = p_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function Grants
-- ---------------------------------------------------------------------------
grant execute on function public.payroll_run_create(integer, integer, text) to authenticated;
grant execute on function public.payroll_slip_adjust(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.payroll_run_approve(uuid) to authenticated;
grant execute on function public.payroll_run_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Export: Payslip PDF
-- ---------------------------------------------------------------------------
create or replace function public.record_export(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
begin
  if v_company is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_kind = 'employee_card' then
    if not private.can_manage_employee(p_target) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'task_report' then
    if not private.can_see_task(p_target) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'attendance_sheet' then
    if p_target is distinct from v_company or private.auth_role() not in ('owner', 'hr') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'leave_request' then
    if not exists (select 1 from public.leave_requests r
                   where r.id = p_target and r.company_id = v_company and r.status = 'approved'
                     and private.can_see_attendance(r.employee_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif p_kind = 'payslip' then
    if not exists (select 1 from public.payroll_slips s
                   where s.id = p_target and s.company_id = v_company
                     and (s.employee_id = private.auth_employee_id() or private.auth_role() in ('owner', 'hr'))) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'unknown_export' using errcode = 'P0001';
  end if;

  perform private.take_rate_limit('pdf', auth.uid()::text, 20, interval '10 minutes');
  perform private.audit(v_company, 'export.' || p_kind, p_kind, p_target::text);
end;
$$;
