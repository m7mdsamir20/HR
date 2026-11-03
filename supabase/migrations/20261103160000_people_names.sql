-- Names of colleagues for display (task creator, reviewer, notification actor). RLS doesn't let a
-- plain employee read a manager's row, but they should see who assigned or reviewed their work.
-- Names only, same company only; no ID numbers, phones or pay.
create function public.people_names(p_ids uuid[])
returns table (id uuid, full_name_ar text, full_name_en text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.full_name_ar, e.full_name_en
  from public.employees e
  where e.id = any (p_ids[1:200])
    and e.company_id = private.auth_company_id();
$$;

revoke execute on function public.people_names(uuid[]) from public, anon;
grant execute on function public.people_names(uuid[]) to authenticated;
