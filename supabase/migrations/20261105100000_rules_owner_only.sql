-- The deduction tiers decide how much of a day's pay is suggested for lateness and absence, so
-- only the company owner changes them. HR can still read them (to explain a suggestion) and keeps
-- branches, shifts and the calendar; those edits are in the audit trail the owner can read.
drop policy rules_update on public.attendance_rules;
create policy rules_update on public.attendance_rules for update to authenticated
  using (company_id = (select private.auth_company_id()) and (select private.auth_role()) = 'owner')
  with check (company_id = (select private.auth_company_id()) and (select private.auth_role()) = 'owner');
