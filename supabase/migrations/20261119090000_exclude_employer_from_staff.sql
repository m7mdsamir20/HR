-- Exclude owner and admin from staff employee metrics and counts

create or replace function public.get_analytics_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_company_id uuid;
  v_role text;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_first_of_month date := make_date(extract(year from v_today)::int, extract(month from v_today)::int, 1);
  v_soon_30 date := v_today + 30;
  v_soon_15 date := v_today + 15;

  v_team_employee_ids uuid[];

  -- Workforce & Saudization
  v_tot_emp int := 0;
  v_saudi_emp int := 0;
  v_expat_emp int := 0;
  v_saudization_rate numeric(5, 1) := 0.0;
  v_dept_count int := 0;
  v_branch_count int := 0;
  v_exp_docs_30 int := 0;
  v_exp_docs_15 int := 0;
  v_workforce jsonb := null;
  v_dept_breakdown jsonb := '[]'::jsonb;

  -- Tasks KPI
  v_t_total int := 0;
  v_t_approved int := 0;
  v_t_submitted int := 0;
  v_t_in_progress int := 0;
  v_t_changes int := 0;
  v_t_assigned int := 0;
  v_t_overdue int := 0;
  v_t_completion_rate numeric(5, 1) := 0.0;
  v_t_avg_rating numeric(3, 2) := 0.0;
  v_t_hours numeric(10, 1) := 0.0;

  -- Attendance KPI
  v_att_present int := 0;
  v_att_on_time int := 0;
  v_att_late int := 0;
  v_att_absent int := 0;
  v_att_rate numeric(5, 1) := 0.0;
  v_month_leaves int := 0;
  v_month_deductions int := 0;

  -- Financial KPI
  v_f_basic numeric(12, 2) := 0.0;
  v_f_housing numeric(12, 2) := 0.0;
  v_f_transport numeric(12, 2) := 0.0;
  v_f_other numeric(12, 2) := 0.0;
  v_f_gross numeric(12, 2) := 0.0;
  v_f_gosi_employer numeric(12, 2) := 0.0;
  v_f_gosi_employee numeric(12, 2) := 0.0;
  v_f_active_advances numeric(12, 2) := 0.0;
  v_f_outstanding_advances numeric(12, 2) := 0.0;
  v_financial jsonb := null;
begin
  select employee_id, company_id, role::text
  into v_employee_id, v_company_id, v_role
  from private.active_membership();

  if v_company_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_role = 'manager' then
    select coalesce(array_agg(id), '{}')
    into v_team_employee_ids
    from public.employees
    where company_id = v_company_id
      and manager_id = v_employee_id
      and status = 'active'
      and role not in ('owner', 'admin');
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. WORKFORCE & SAUDIZATION (Staff only: excludes employer/admin)
  -- ---------------------------------------------------------------------------
  if v_role in ('owner', 'admin', 'hr') then
    select
      count(*),
      count(*) filter (where id_type = 'citizen'),
      count(*) filter (where id_type = 'resident')
    into v_tot_emp, v_saudi_emp, v_expat_emp
    from public.employees
    where company_id = v_company_id and status = 'active' and role not in ('owner', 'admin');

    if v_tot_emp > 0 then
      v_saudization_rate := round((v_saudi_emp * 100.0) / v_tot_emp, 1);
    end if;

    select count(*) into v_dept_count from public.departments where company_id = v_company_id;
    select count(*) into v_branch_count from public.branches where company_id = v_company_id;

    select
      count(*) filter (where expiry_date <= v_soon_30),
      count(*) filter (where expiry_date <= v_soon_15)
    into v_exp_docs_30, v_exp_docs_15
    from public.employee_documents d
    join public.employees e on e.id = d.employee_id
    where d.company_id = v_company_id
      and d.expiry_date is not null
      and d.expiry_date >= v_today
      and e.role not in ('owner', 'admin');

    v_workforce := jsonb_build_object(
      'total_employees', v_tot_emp,
      'saudi_count', v_saudi_emp,
      'expat_count', v_expat_emp,
      'saudization_rate', v_saudization_rate,
      'departments_count', v_dept_count,
      'branches_count', v_branch_count,
      'expiring_docs_30d', v_exp_docs_30,
      'critical_docs_15d', v_exp_docs_15
    );

    -- Department breakdown (Staff only)
    select coalesce(jsonb_agg(d_row), '[]'::jsonb)
    into v_dept_breakdown
    from (
      select
        d.id,
        d.name_ar,
        d.name_en,
        count(e.id)::int as employee_count
      from public.departments d
      left join public.employees e on e.department_id = d.id and e.status = 'active' and e.role not in ('owner', 'admin')
      where d.company_id = v_company_id
      group by d.id, d.name_ar, d.name_en
      order by count(e.id) desc, d.name_ar
    ) d_row;

  elsif v_role = 'manager' then
    v_tot_emp := coalesce(array_length(v_team_employee_ids, 1), 0);
    v_workforce := jsonb_build_object(
      'total_employees', v_tot_emp,
      'saudi_count', null,
      'expat_count', null,
      'saudization_rate', null,
      'departments_count', null,
      'branches_count', null,
      'expiring_docs_30d', null,
      'critical_docs_15d', null
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. TASKS OVERVIEW
  -- ---------------------------------------------------------------------------
  if v_role in ('owner', 'admin', 'hr') then
    select
      count(*),
      count(*) filter (where status = 'approved'),
      count(*) filter (where status = 'submitted'),
      count(*) filter (where status = 'in_progress'),
      count(*) filter (where status = 'changes_requested'),
      count(*) filter (where status = 'assigned'),
      count(*) filter (where status in ('assigned', 'in_progress', 'changes_requested') and due_date < v_today)
    into v_t_total, v_t_approved, v_t_submitted, v_t_in_progress, v_t_changes, v_t_assigned, v_t_overdue
    from public.tasks
    where company_id = v_company_id;

    select coalesce(round(avg(rating)::numeric, 2), 0.0)
    into v_t_avg_rating
    from public.tasks
    where company_id = v_company_id and rating is not null;

    select coalesce(sum(hours_spent), 0.0)
    into v_t_hours
    from public.task_reports
    where company_id = v_company_id;

  elsif v_role = 'manager' then
    select
      count(*),
      count(*) filter (where status = 'approved'),
      count(*) filter (where status = 'submitted'),
      count(*) filter (where status = 'in_progress'),
      count(*) filter (where status = 'changes_requested'),
      count(*) filter (where status = 'assigned'),
      count(*) filter (where status in ('assigned', 'in_progress', 'changes_requested') and due_date < v_today)
    into v_t_total, v_t_approved, v_t_submitted, v_t_in_progress, v_t_changes, v_t_assigned, v_t_overdue
    from public.tasks
    where company_id = v_company_id
      and assignee_id = any(v_team_employee_ids);

    select coalesce(round(avg(rating)::numeric, 2), 0.0)
    into v_t_avg_rating
    from public.tasks
    where company_id = v_company_id and rating is not null and assignee_id = any(v_team_employee_ids);

    select coalesce(sum(r.hours_spent), 0.0)
    into v_t_hours
    from public.task_reports r
    join public.tasks t on t.id = r.task_id
    where r.company_id = v_company_id and t.assignee_id = any(v_team_employee_ids);

  else
    -- Employee: their own assigned tasks
    select
      count(*),
      count(*) filter (where status = 'approved'),
      count(*) filter (where status = 'submitted'),
      count(*) filter (where status = 'in_progress'),
      count(*) filter (where status = 'changes_requested'),
      count(*) filter (where status = 'assigned'),
      count(*) filter (where status in ('assigned', 'in_progress', 'changes_requested') and due_date < v_today)
    into v_t_total, v_t_approved, v_t_submitted, v_t_in_progress, v_t_changes, v_t_assigned, v_t_overdue
    from public.tasks
    where company_id = v_company_id and assignee_id = v_employee_id;

    select coalesce(round(avg(rating)::numeric, 2), 0.0)
    into v_t_avg_rating
    from public.tasks
    where company_id = v_company_id and rating is not null and assignee_id = v_employee_id;

    select coalesce(sum(hours_spent), 0.0)
    into v_t_hours
    from public.task_reports
    where company_id = v_company_id and reporter_id = v_employee_id;
  end if;

  if v_t_total > 0 then
    v_t_completion_rate := round((v_t_approved * 100.0) / v_t_total, 1);
  end if;

  -- ---------------------------------------------------------------------------
  -- 3. ATTENDANCE & PUNCTUALITY (Staff only)
  -- ---------------------------------------------------------------------------
  if v_role in ('owner', 'admin', 'hr') then
    select
      count(*) filter (where r.status in ('present', 'late')),
      count(*) filter (where r.status = 'present'),
      count(*) filter (where r.status = 'late'),
      count(*) filter (where r.status = 'absent')
    into v_att_present, v_att_on_time, v_att_late, v_att_absent
    from public.attendance_records r
    join public.employees e on e.id = r.employee_id
    where r.company_id = v_company_id and r.work_date = v_today and e.role not in ('owner', 'admin');

    if v_tot_emp > 0 then
      v_att_rate := round((v_att_present * 100.0) / v_tot_emp, 1);
    end if;

    select count(*)
    into v_month_leaves
    from public.leave_requests l
    join public.employees e on e.id = l.employee_id
    where l.company_id = v_company_id
      and l.status = 'approved'
      and e.role not in ('owner', 'admin')
      and (l.start_date <= v_today and l.end_date >= v_first_of_month);

    select count(*)
    into v_month_deductions
    from public.attendance_deductions d
    join public.employees e on e.id = d.employee_id
    where d.company_id = v_company_id
      and d.status in ('pending', 'approved')
      and e.role not in ('owner', 'admin')
      and d.work_date >= v_first_of_month;

  elsif v_role = 'manager' then
    select
      count(*) filter (where status in ('present', 'late')),
      count(*) filter (where status = 'present'),
      count(*) filter (where status = 'late'),
      count(*) filter (where status = 'absent')
    into v_att_present, v_att_on_time, v_att_late, v_att_absent
    from public.attendance_records
    where company_id = v_company_id
      and work_date = v_today
      and employee_id = any(v_team_employee_ids);

    if v_tot_emp > 0 then
      v_att_rate := round((v_att_present * 100.0) / v_tot_emp, 1);
    end if;

    select count(*)
    into v_month_leaves
    from public.leave_requests
    where company_id = v_company_id
      and status = 'approved'
      and employee_id = any(v_team_employee_ids)
      and (start_date <= v_today and end_date >= v_first_of_month);

    select count(*)
    into v_month_deductions
    from public.attendance_deductions
    where company_id = v_company_id
      and status in ('pending', 'approved')
      and employee_id = any(v_team_employee_ids)
      and work_date >= v_first_of_month;

  else
    -- Employee
    select
      count(*) filter (where status in ('present', 'late')),
      count(*) filter (where status = 'present'),
      count(*) filter (where status = 'late'),
      count(*) filter (where status = 'absent')
    into v_att_present, v_att_on_time, v_att_late, v_att_absent
    from public.attendance_records
    where company_id = v_company_id and employee_id = v_employee_id and work_date = v_today;

    select count(*)
    into v_month_leaves
    from public.leave_requests
    where company_id = v_company_id and employee_id = v_employee_id and status = 'approved'
      and (start_date <= v_today and end_date >= v_first_of_month);

    select count(*)
    into v_month_deductions
    from public.attendance_deductions
    where company_id = v_company_id and employee_id = v_employee_id and status in ('pending', 'approved')
      and work_date >= v_first_of_month;
  end if;

  -- ---------------------------------------------------------------------------
  -- 4. FINANCIAL KPI (Leader & HR only, staff payroll only)
  -- ---------------------------------------------------------------------------
  if v_role in ('owner', 'admin', 'hr') then
    select
      coalesce(sum(basic_salary), 0),
      coalesce(sum(housing_allowance), 0),
      coalesce(sum(transport_allowance), 0),
      coalesce(sum(coalesce(food_allowance, 0) + coalesce(other_allowances, 0)), 0),
      coalesce(sum(basic_salary + housing_allowance + transport_allowance + coalesce(food_allowance, 0) + coalesce(other_allowances, 0)), 0)
    into v_f_basic, v_f_housing, v_f_transport, v_f_other, v_f_gross
    from public.employees
    where company_id = v_company_id and status = 'active' and role not in ('owner', 'admin');

    select
      coalesce(sum(g.employer_share), 0),
      coalesce(sum(g.employee_share), 0)
    into v_f_gosi_employer, v_f_gosi_employee
    from public.employees e
    cross join lateral private.gosi_breakdown_of(e.id) g
    where e.company_id = v_company_id and e.status = 'active' and e.role not in ('owner', 'admin');

    select
      coalesce(sum(amount), 0),
      coalesce(sum(remaining_amount), 0)
    into v_f_active_advances, v_f_outstanding_advances
    from public.advance_requests a
    join public.employees e on e.id = a.employee_id
    where a.company_id = v_company_id and a.status = 'approved' and a.remaining_amount > 0 and e.role not in ('owner', 'admin');

    v_financial := jsonb_build_object(
      'monthly_payroll_est', v_f_gross,
      'basic_total', v_f_basic,
      'housing_total', v_f_housing,
      'transport_total', v_f_transport,
      'other_allowances_total', v_f_other,
      'gosi_employer_est', v_f_gosi_employer,
      'gosi_employee_est', v_f_gosi_employee,
      'total_burden_est', v_f_gross + v_f_gosi_employer,
      'active_advances_amount', v_f_active_advances,
      'outstanding_advances_balance', v_f_outstanding_advances
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- BUILD RESULT JSONB
  -- ---------------------------------------------------------------------------
  return jsonb_build_object(
    'role', v_role,
    'workforce', v_workforce,
    'departments', v_dept_breakdown,
    'tasks', jsonb_build_object(
      'total', v_t_total,
      'approved', v_t_approved,
      'submitted', v_t_submitted,
      'in_progress', v_t_in_progress,
      'changes_requested', v_t_changes,
      'assigned', v_t_assigned,
      'overdue', v_t_overdue,
      'completion_rate', v_t_completion_rate,
      'avg_rating', v_t_avg_rating,
      'hours_spent', v_t_hours
    ),
    'attendance', jsonb_build_object(
      'rate', v_att_rate,
      'present', v_att_present,
      'on_time', v_att_on_time,
      'late', v_att_late,
      'absent', v_att_absent,
      'month_leaves', v_month_leaves,
      'month_deductions', v_month_deductions
    ),
    'financial', v_financial
  );
end;
$$;
