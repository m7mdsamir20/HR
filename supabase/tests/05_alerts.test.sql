-- Document expiry alerts, the stored-file check on documents, and the orphan file list.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

insert into companies (id, name_ar, max_employees, subscription_ends_at, status) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 20, current_date + 60, 'active'),
  ('0000000b-0000-0000-0000-000000000000', 'شركة موقوفة', 20, current_date + 60, 'suspended');
insert into employees (id, company_id, national_id, id_type, full_name_ar, role, status) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '1000000601', 'citizen', 'مالك', 'owner', 'active'),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '1000000602', 'citizen', 'موارد', 'hr', 'active'),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '2000000603', 'resident', 'موظف', 'employee', 'active'),
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '2000000604', 'resident', 'موظف سابق', 'employee', 'disabled'),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '1000000611', 'citizen', 'مالك موقوفة', 'owner', 'active'),
  ('000000b2-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '2000000612', 'resident', 'موظف موقوفة', 'employee', 'active');

create function pg_temp.doc(p_id text, p_employee text, p_company text, p_days integer) returns void language sql as $$
  insert into employee_documents (id, company_id, employee_id, doc_type, expiry_date)
  values (p_id::uuid, p_company::uuid, p_employee::uuid, 'iqama', current_date + p_days);
$$;
create function pg_temp.alerts(p_doc text) returns bigint language sql as $$
  select count(*) from notifications where document_id = p_doc::uuid;
$$;

select pg_temp.doc('00000d00-0000-0000-0000-000000000045', '000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 45);
select pg_temp.doc('00000d00-0000-0000-0000-000000000020', '000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 20);
select pg_temp.doc('00000d00-0000-0000-0000-000000000010', '000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 10);
select pg_temp.doc('00000d00-0000-0000-0000-0000000000f1', '000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', -3);
select pg_temp.doc('00000d00-0000-0000-0000-000000000200', '000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 200);
select pg_temp.doc('00000d00-0000-0000-0000-0000000000d1', '000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', 5);
select pg_temp.doc('00000d00-0000-0000-0000-0000000000b1', '000000b2-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', 5);

select is(private.generate_document_alerts(), 4, 'four documents are due for an alert');
select is(pg_temp.alerts('00000d00-0000-0000-0000-000000000045'), 2::bigint, '45 days left: the owner and HR are told');
select is((select count(*) from notifications where document_id = '00000d00-0000-0000-0000-000000000045' and recipient_id = '000000a3-0000-0000-0000-000000000000'), 0::bigint,
  'the employee whose document it is isn''t told');
select is((select days_left from notifications where document_id = '00000d00-0000-0000-0000-000000000045' limit 1), 45::smallint, 'the alert carries the days left');
select is(pg_temp.alerts('00000d00-0000-0000-0000-000000000020'), 2::bigint, 'a document added with 20 days left gets a single alert, not 60, 30 and 15');
select is(pg_temp.alerts('00000d00-0000-0000-0000-0000000000f1'), 2::bigint, 'an expired document is reported');
select is(pg_temp.alerts('00000d00-0000-0000-0000-000000000200'), 0::bigint, 'a document far from expiry is left alone');
select is(pg_temp.alerts('00000d00-0000-0000-0000-0000000000d1') + pg_temp.alerts('00000d00-0000-0000-0000-0000000000b1'), 0::bigint,
  'no alerts for disabled employees or a suspended company');
select is(private.generate_document_alerts(), 0, 'running it again the same day sends nothing');

-- A changed expiry date starts a fresh cycle: 45 days becomes 25, so the 30-day alert fires once
update employee_documents set expiry_date = current_date + 25 where id = '00000d00-0000-0000-0000-000000000045';
select is(private.generate_document_alerts(), 1, 'a renewed or changed expiry starts a fresh alert cycle');
select is(pg_temp.alerts('00000d00-0000-0000-0000-000000000045'), 4::bigint, 'the owner and HR got a second alert for it');

-- A document can only point at a file that exists
select throws_ok(
  $$insert into employee_documents (company_id, employee_id, doc_type, file_path) values ('0000000a-0000-0000-0000-000000000000', '000000a3-0000-0000-0000-000000000000', 'passport',
    '0000000a-0000-0000-0000-000000000000/documents/000000a3-0000-0000-0000-000000000000/99999999-9999-9999-9999-999999999999.pdf')$$,
  'P0001', 'file_missing', 'a document can''t cite a file that was never uploaded');
insert into storage.objects (bucket_id, name, metadata) values
  ('company-files', '0000000a-0000-0000-0000-000000000000/documents/000000a3-0000-0000-0000-000000000000/99999999-9999-9999-9999-999999999999.pdf', '{"size": 10}');
select lives_ok(
  $$insert into employee_documents (company_id, employee_id, doc_type, file_path) values ('0000000a-0000-0000-0000-000000000000', '000000a3-0000-0000-0000-000000000000', 'passport',
    '0000000a-0000-0000-0000-000000000000/documents/000000a3-0000-0000-0000-000000000000/99999999-9999-9999-9999-999999999999.pdf')$$,
  'once it exists, it can');

-- Orphan files: only unreferenced files older than the cutoff
insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('company-files', '0000000a-0000-0000-0000-000000000000/reports/00000000-0000-0000-0000-000000000001/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', now() - interval '3 days', '{"size": 10}'),
  ('company-files', '0000000a-0000-0000-0000-000000000000/reports/00000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png', now() - interval '10 minutes', '{"size": 10}');
update storage.objects set created_at = now() - interval '3 days' where name like '%99999999-9999-9999-9999-999999999999.pdf';
select is((select count(*) from public.orphan_files()), 1::bigint,
  'only the old, unreferenced upload is listed (not the fresh one, not the one a document cites)');
set local role authenticated;
select throws_ok($$select * from public.orphan_files()$$, '42501', null, 'users can''t list orphan files; only the cleanup job (service role) can');
reset role;

select * from finish();
rollback;
