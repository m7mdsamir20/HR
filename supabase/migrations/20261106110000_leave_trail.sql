-- Who approved an approved leave request, for the printed copy. The decision columns hold auth user
-- ids, and an employee can't read colleagues' rows, so this returns just the two names, only to
-- someone who may see the request.
create function public.leave_request_trail(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'manager_name_ar', m.full_name_ar, 'manager_name_en', m.full_name_en,
    'decider_name_ar', d.full_name_ar, 'decider_name_en', d.full_name_en)
  from public.leave_requests r
  left join public.employees m on m.user_id = r.manager_approved_by
  left join public.employees d on d.user_id = r.decided_by
  where r.id = p_id and r.company_id = private.auth_company_id() and r.status = 'approved'
    and private.can_see_attendance(r.employee_id);
$$;

revoke execute on function public.leave_request_trail(uuid) from public, anon;
grant execute on function public.leave_request_trail(uuid) to authenticated;
