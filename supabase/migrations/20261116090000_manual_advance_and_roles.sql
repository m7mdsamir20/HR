-- Manual advance creation by management and admin role support

create or replace function public.advance_manual_create(
  p_employee_id uuid,
  p_amount numeric,
  p_installments integer,
  p_reason text,
  p_auto_approve boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := private.auth_company_id();
  v_role text := private.auth_role()::text;
  v_monthly numeric(10, 2);
  v_id uuid;
begin
  if v_company is null or v_role not in ('owner', 'admin', 'hr') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_role = 'hr' and not private.can_manage_employee(p_employee_id) then
    raise exception 'forbidden' using errcode = '42501';
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

  -- Verify employee belongs to company and is active
  if not exists (
    select 1 from public.employees
    where id = p_employee_id and company_id = v_company and status = 'active'
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Check existing active advance
  if exists (
    select 1 from public.advance_requests
    where company_id = v_company and employee_id = p_employee_id
      and status in ('pending', 'approved')
      and (remaining_amount is null or remaining_amount > 0)
  ) then
    raise exception 'existing_active_advance' using errcode = 'P0001';
  end if;

  v_monthly := round(p_amount / p_installments, 2);

  insert into public.advance_requests (
    company_id, employee_id, amount, installments_count, monthly_installment,
    paid_amount, remaining_amount, reason, status, decided_by, decided_at, decision_note
  ) values (
    v_company, p_employee_id, p_amount, p_installments, v_monthly,
    0, p_amount, trim(p_reason),
    case when p_auto_approve then 'approved' else 'pending' end,
    case when p_auto_approve then auth.uid() else null end,
    case when p_auto_approve then now() else null end,
    case when p_auto_approve then 'سلفة يدوية معتمدة بواسطة الإدارة' else null end
  ) returning id into v_id;

  perform private.notify_advance(v_company, p_employee_id, 'advance_created', v_id);
  return v_id;
end;
$$;

create or replace function public.advance_request_decide(
  p_id uuid,
  p_decision text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_role text := private.auth_role()::text;
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

  -- Caller permission: Owner & Admin can decide; HR can decide for anyone they can manage
  if v_role in ('owner', 'admin') then
    null;
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

grant execute on function public.advance_manual_create(uuid, numeric, integer, text, boolean) to authenticated;
grant execute on function public.advance_request_decide(uuid, text, text) to authenticated;
