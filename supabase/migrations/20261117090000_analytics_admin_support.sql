-- Update get_analytics_summary to support 'admin' role alongside 'owner' and 'hr'

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
  v_first_of_month date := date_trunc('month', (now() at time zone 'Asia/Riyadh'))::date;
  v_soon_30 date := (now() at time zone 'Asia/Riyadh')::date + interval '30 days';
  v_soon_15 date := (now() at time zone 'Asia/Riyadh')::date + interval '15 days';

  v_workforce jsonb := null;
  v_tasks jsonb;
  v_attendance jsonb;
  v_financial jsonb := null;
  v_dept_breakdown jsonb := '[]'::jsonb;
  v_team_employee_ids uuid[];

  -- workforce vars
  v_tot_emp int := 0;
  v_saudi_emp int := 0;
  v_expat_emp int := 0;
  v_saudization_rate numeric(5, 1) := 0;
  v_dept_count int := 0;
  v_branch_count int := 0;
  v_exp_docs_30 int := 0;
  v_exp_docs_15 int := 0;

  -- tasks vars
  v_t_total int := 0;
  v_t_approved int := 0;
  v_t_submitted int := 0;
  v_t_in_progress int := 0;
  v_t_changes int := 0;
  v_t_assigned int := 0;
  v_t_overdue int := 0;
  v_t_completion_rate numeric(5, 1) := 0;
  v_t_avg_rating numeric(3, 1) := 0;
  v_t_hours numeric(10, 1) := 0;

  -- attendance vars
  v_att_present int := 0;
  v_att_on_time int := 0;
  v_att_late int := 0;
  v_att_absent int := 0;
  v_att_rate numeric(5, 1) := 0;
  v_month_leaves int := 0;
  v_month_deductions int := 0;

  -- financial vars
  v_pay_run record;
  v_adv_count int := 0;
  v_adv_balance numeric(12, 2) := 0;
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
      and status = 'active';
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. WORKFORCE & SAUDIZATION
  -- ---------------------------------------------------------------------------
  if v_role in ('owner', 'admin', 'hr') then
    select
      count(*),
      count(*) filter (where id_type = 'citizen'),
      count(*) filter (where id_type = 'resident')
    into v_tot_emp, v_saudi_emp, v_expat_emp
    from public.employees
    where company_id = v_company_id and status = 'active';

    if v_tot_emp > 0 then
      v_saudization_rate := round((v_saudi_emp * 100.0) / v_tot_emp, 1);
    end if;

    select count(*) into v_dept_count from public.departments where company_id = v_company_id;
    select count(*) into v_branch_count from public.branches where company_id = v_company_id;

    select
      count(*) filter (where expiry_date <= v_soon_30),
      count(*) filter (where expiry_date <= v_soon_15)
    into v_exp_docs_30, v_exp_docs_15
    from public.employee_documents
    where company_id = v_company_id
      and expiry_date is not null
      and expiry_date >= v_today;

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

    -- Department breakdown
    select coalesce(jsonb_agg(d_row), '[]'::jsonb)
    into v_dept_breakdown
    from (
      select
        d.id,
        d.name_ar,
        d.name_en,
        count(e.id)::int as employee_count
      from public.departments d
      left join public.employees e on e.department_id = d.id and e.status = 'active'
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
  -- 2. TASKS & OPERATIONAL PRODUCTIVITY
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
    into
      v_t_total, v_t_approved, v_t_submitted, v_t_in_progress, v_t_changes, v_t_assigned, v_t_overdue
    from public.tasks
    where company_id = v_company_id;

    select
      coalesce(round(avg(rating)::numeric, 1), 0),
      coalesce(round(sum(hours_spent)::numeric, 1), 0)
    into v_t_avg_rating, v_t_hours
    from public.task_reports
    where company_id = v_company_id and status = 'approved';

  elsif v_role = 'manager' then
    select
      count(*),
      count(*) filter (where status = 'approved'),
      count(*) filter (where status = 'submitted'),
      count(*) filter (where status = 'in_progress'),
      count(*) filter (where status = 'changes_requested'),
      count(*) filter (where status = 'assigned'),
      count(*) filter (where status in ('assigned', 'in_progress', 'changes_requested') and due_date < v_today)
    into
      v_t_total, v_t_approved, v_t_submitted, v_t_in_progress, v_t_changes, v_t_assigned, v_t_overdue
    from public.tasks
    where company_id = v_company_id
      and assignee_id = any(v_team_employee_ids);

    select
      coalesce(round(avg(tr.rating)::numeric, 1), 0),
      coalesce(round(sum(tr.hours_spent)::numeric, 1), 0)
    into v_t_avg_rating, v_t_hours
    from public.task_reports tr
    join public.tasks t on t.id = tr.task_id
    where tr.company_id = v_company_id
      and tr.status = 'approved'
      and t.assignee_id = any(v_team_employee_ids);

  else -- employee
    select
      count(*),
      count(*) filter (where status = 'approved'),
      count(*) filter (where status = 'submitted'),
      count(*) filter (where status = 'in_progress'),
      count(*) filter (where status = 'changes_requested'),
      count(*) filter (where status = 'assigned'),
      count(*) filter (where status in ('assigned', 'in_progress', 'changes_requested') and due_date < v_today)
    into
      v_t_total, v_t_approved, v_t_submitted, v_t_in_progress, v_t_changes, v_t_assigned, v_t_overdue
    from public.tasks
    where company_id = v_company_id and assignee_id = v_employee_id;

    select
      coalesce(round(avg(rating)::numeric, 1), 0),
      coalesce(round(sum(hours_spent)::numeric, 1), 0)
    into v_t_avg_rating, v_t_hours
    from public.task_reports
    where company_id = v_company_id and submitted_by = v_employee_id and status = 'approved';
  end if;

  if v_t_total > 0 then
    v_t_completion_rate := round((v_t_approved * 100.0) / v_t_total, 1);
  end if;

  v_tasks := jsonb_build_object(
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
  );

  -- ---------------------------------------------------------------------------
  -- 3. ATTENDANCE & PUNCTUALITY
  -- ---------------------------------------------------------------------------
  if v_role in ('owner', 'admin', 'hr') then
    select
      count(*) filter (where status in ('present', 'late')),
      count(*) filter (where status = 'present'),
      count(*) filter (where status = 'late'),
      count(*) filter (where status = 'absent')
    into v_att_present, v_att_on_time, v_att_late, v_att_absent
    from public.attendance_records
    where company_id = v_company_id and work_date = v_today;

    if v_tot_emp > 0 then
      v_att_rate := round((v_att_present * 100.0) / v_tot_emp, 1);
    end if;

    select count(*)
    into v_month_leaves
    from public.leave_requests
    where company_id = v_company_id
      and status = 'approved'
      and (start_date <= v_today and end_date >= v_first_of_month);

    select count(*)
    into v_month_deductions
    from public.attendance_deductions
    where company_id = v_company_id
      and status in ('pending', 'approved')
      and work_date >= v_first_of_month;

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
      and employee_id = any(v_team_employee_ids)
      and status in ('pending', 'approved')
      and work_date >= v_first_of_month;

  else -- employee
    select
      count(*) filter (where status in ('present', 'late')),
      count(*) filter (where status = 'present'),
      count(*) filter (where status = 'late'),
      count(*) filter (where status = 'absent')
    into v_att_present, v_att_on_time, v_att_late, v_att_absent
    from public.attendance_records
    where company_id = v_company_id
      and work_date >= v_first_of_month
      and employee_id = v_employee_id;

    select count(*)
    into v_month_leaves
    from public.leave_requests
    where company_id = v_company_id
      and status = 'approved'
      and employee_id = v_employee_id
      and (start_date <= v_today and end_date >= v_first_of_month);
  end if;

  v_attendance := jsonb_build_object(
    'today_present', v_att_present,
    'today_on_time', v_att_on_time,
    'today_late', v_att_late,
    'today_absent', v_att_absent,
    'today_rate', v_att_rate,
    'month_leaves', v_month_leaves,
    'month_deductions', v_month_deductions
  );

  -- ---------------------------------------------------------------------------
  -- 4. FINANCIAL (STRICTLY OWNER, ADMIN & HR)
  -- ---------------------------------------------------------------------------
  if v_role in ('owner', 'admin', 'hr') then
    select
      year,
      month,
      status,
      total_gross,
      total_net,
      total_gosi_employer,
      total_deductions,
      employee_count
    into v_pay_run
    from public.payroll_runs
    where company_id = v_company_id
    order by year desc, month desc
    limit 1;

    select
      count(*),
      coalesce(sum(remaining_amount), 0)
    into v_adv_count, v_adv_balance
    from public.advance_requests
    where company_id = v_company_id
      and status = 'approved'
      and remaining_amount > 0;

    v_financial := jsonb_build_object(
      'has_run', v_pay_run.year is not null,
      'latest_run', case when v_pay_run.year is not null then jsonb_build_object(
        'year', v_pay_run.year,
        'month', v_pay_run.month,
        'status', v_pay_run.status,
        'total_gross', v_pay_run.total_gross,
        'total_net', v_pay_run.total_net,
        'total_gosi_employer', v_pay_run.total_gosi_employer,
        'total_deductions', v_pay_run.total_deductions,
        'employee_count', v_pay_run.employee_count
      ) else null end,
      'active_advances_count', v_adv_count,
      'total_advances_balance', v_adv_balance
    );
  end if;

  return jsonb_build_object(
    'role', v_role,
    'workforce', v_workforce,
    'tasks', v_tasks,
    'attendance', v_attendance,
    'financial', v_financial,
    'departments', v_dept_breakdown
  );
end;
$$;

grant execute on function public.get_analytics_summary() to authenticated;
