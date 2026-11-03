-- Generated PDFs contain personal data (employee card: ID, contract, pay) and work evidence (task
-- report). Each export is authorized with the same rules as reading the data, rate limited, and
-- audited (who exported what), before the app builds the file.
create function public.record_export(p_kind text, p_target uuid) returns void
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
  else
    raise exception 'unknown_export' using errcode = 'P0001';
  end if;

  perform private.take_rate_limit('pdf', auth.uid()::text, 20, interval '10 minutes');
  perform private.audit(v_company, 'export.' || p_kind, p_kind, p_target::text);
end;
$$;

revoke execute on function public.record_export(text, uuid) from public, anon;
grant execute on function public.record_export(text, uuid) to authenticated;
