-- National ID lookup in the system admin panel must also find other system admins' IDs.
create policy platform_admins_admin_select on public.platform_admins for select to authenticated
  using ((select private.is_platform_admin()));
