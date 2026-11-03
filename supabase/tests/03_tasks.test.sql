-- Tasks and proof of work: who assigns, who sees, the lifecycle, reviews and notifications.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(48);

create function pg_temp.mk_user(p_id uuid, p_nid text) returns void language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at)
  values (p_id, p_nid || '@users.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
$$;
create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a1', '1000000901'); -- owner
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a2', '1000000902'); -- hr
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a3', '1000000903'); -- manager
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a4', '2000000904'); -- employee on the manager's team
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000a5', '2000000905'); -- employee, no manager
select pg_temp.mk_user('00000000-0000-0000-0000-0000000000b1', '1000000911'); -- other company owner

insert into companies (id, name_ar, max_employees, subscription_ends_at) values
  ('0000000a-0000-0000-0000-000000000000', 'شركة أ', 20, current_date + 30),
  ('0000000b-0000-0000-0000-000000000000', 'شركة ب', 20, current_date + 30);
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role) values
  ('000000a1-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', '1000000901', 'citizen', 'مالك', 'owner'),
  ('000000a2-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', '1000000902', 'citizen', 'موارد', 'hr'),
  ('000000a3-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', '1000000903', 'citizen', 'مشرف', 'manager'),
  ('000000b1-0000-0000-0000-000000000000', '0000000b-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', '1000000911', 'citizen', 'مالك ب', 'owner');
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id) values
  ('000000a4-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4', '2000000904', 'resident', 'فني 1', 'employee', '000000a3-0000-0000-0000-000000000000'),
  ('000000a5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5', '2000000905', 'resident', 'فني 2', 'employee', null);

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Assigning
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
insert into ids select 't1', public.task_create(jsonb_build_object('title', 'تركيب كاميرات فرع العليا', 'assignee_id', '000000a4-0000-0000-0000-000000000000',
  'due_date', current_date + 1, 'priority', 'high', 'expected_hours', '4'));
select isnt((select id from ids where name = 't1'), null, 'a manager assigns a task to a team member');
select throws_ok($$select public.task_create(jsonb_build_object('title', 'خارج الفريق', 'assignee_id', '000000a5-0000-0000-0000-000000000000', 'due_date', current_date))$$,
  '42501', null, 'a manager cannot assign outside their team');
select throws_ok($$select public.task_create(jsonb_build_object('title', 'لنفسي', 'assignee_id', '000000a3-0000-0000-0000-000000000000', 'due_date', current_date))$$,
  '42501', null, 'nobody assigns a task to themself');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$select public.task_create(jsonb_build_object('title', 'موظف', 'assignee_id', '000000a5-0000-0000-0000-000000000000', 'due_date', current_date))$$,
  '42501', null, 'an employee cannot assign tasks');
select is((select count(*) from notifications where type = 'task_assigned'), 1::bigint, 'the assignee is notified of a new task');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.task_create(jsonb_build_object('title', 'موارد', 'assignee_id', '000000a5-0000-0000-0000-000000000000', 'due_date', current_date))$$,
  '42501', null, 'HR does not assign tasks');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into ids select 't2', public.task_create(jsonb_build_object('title', 'جرد المستودع', 'assignee_id', '000000a5-0000-0000-0000-000000000000', 'due_date', current_date));
select isnt((select id from ids where name = 't2'), null, 'the owner assigns to anyone in the company');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.task_create(jsonb_build_object('title', 'دخيل', 'assignee_id', '000000a4-0000-0000-0000-000000000000', 'due_date', current_date))$$,
  '42501', null, 'another company cannot assign to our employees');
select is((select count(*) from tasks), 0::bigint, 'another company sees none of our tasks');
reset role;

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select results_eq('select id from tasks', $$select id from ids where name = 't1'$$, 'an employee sees only their own tasks');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select results_eq('select id from tasks', $$select id from ids where name = 't2'$$, 'the other employee sees only theirs');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq('select id from tasks', $$select id from ids where name = 't1'$$, 'a manager sees their team''s tasks, not others''');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from tasks), 2::bigint, 'the owner sees every task in the company');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*) from tasks), 0::bigint, 'HR is not part of the task flow');
select throws_ok($$insert into tasks (company_id, created_by, assignee_id, title, due_date) values ('0000000a-0000-0000-0000-000000000000', '000000a2-0000-0000-0000-000000000000', '000000a4-0000-0000-0000-000000000000', 'مباشر', current_date)$$,
  '42501', null, 'tasks are never written directly');
reset role;

-- ---------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select throws_ok(format('select public.task_start(%L)', (select id from ids where name = 't1')), '42501', null,
  'only the assignee can start a task');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select lives_ok(format('select public.task_start(%L)', (select id from ids where name = 't1')), 'the assignee starts the task');
select throws_ok(format('select public.task_review(%L, ''approve'', 5, null)', (select id from ids where name = 't1')), '42501', null,
  'the assignee can never review their own task');
select throws_ok(format($f$select public.task_submit_report(%L, jsonb_build_object('summary', 'تم', 'links', jsonb_build_array('javascript:alert(1)')), '[]')$f$,
  (select id from ids where name = 't1')), '23514', null, 'delivery links must be https');
select throws_ok(format($f$select public.task_submit_report(%L, jsonb_build_object('summary', 'تم'),
    jsonb_build_array(jsonb_build_object('path', '0000000a-0000-0000-0000-000000000000/reports/%s/11111111-1111-1111-1111-111111111111.jpg', 'name', 'x.jpg', 'mime', 'image/jpeg', 'size', 10)))$f$,
  (select id from ids where name = 't1'), (select id from ids where name = 't2')), 'P0001', 'invalid_attachment',
  'an attachment from another task''s folder is refused');
reset role;
insert into storage.objects (bucket_id, name, metadata)
values ('company-files', '0000000a-0000-0000-0000-000000000000/reports/' || (select id from ids where name = 't1') || '/11111111-1111-1111-1111-111111111111.jpg',
  '{"size": 1024, "mimetype": "image/jpeg"}');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format($f$select public.task_submit_report(%L, jsonb_build_object('summary', 'تم'),
    jsonb_build_array(jsonb_build_object('path', '0000000a-0000-0000-0000-000000000000/reports/%s/22222222-2222-2222-2222-222222222222.jpg', 'name', 'x.jpg', 'mime', 'image/jpeg', 'size', 10)))$f$,
  (select id from ids where name = 't1'), (select id from ids where name = 't1')), 'P0001', 'invalid_attachment',
  'an attachment that was never uploaded is refused');
select throws_ok(format($f$select public.task_submit_report(%L, jsonb_build_object('summary', 'تم'),
    jsonb_build_array(jsonb_build_object('path', '0000000a-0000-0000-0000-000000000000/reports/%s/11111111-1111-1111-1111-111111111111.jpg', 'name', 'x.jpg', 'mime', 'text/html', 'size', 1024)))$f$,
  (select id from ids where name = 't1'), (select id from ids where name = 't1')), 'P0001', 'invalid_attachment',
  'a declared type that doesn''t match the extension is refused');
select throws_ok(format($f$select public.task_submit_report(%L, jsonb_build_object('summary', 'تم'),
    jsonb_build_array(jsonb_build_object('path', '0000000a-0000-0000-0000-000000000000/reports/%s/11111111-1111-1111-1111-111111111111.jpg', 'name', 'x.jpg', 'mime', 'image/jpeg', 'size', 999)))$f$,
  (select id from ids where name = 't1'), (select id from ids where name = 't1')), 'P0001', 'invalid_attachment',
  'a size that doesn''t match storage is refused');
select isnt(public.task_submit_report((select id from ids where name = 't1'),
    jsonb_build_object('summary', 'تم تركيب 6 كاميرات وتجربة التسجيل', 'hours_spent', '5', 'obstacles', 'تأخر وصول الكابلات',
      'links', jsonb_build_array('https://example.com/handover')),
    jsonb_build_array(jsonb_build_object('path', '0000000a-0000-0000-0000-000000000000/reports/' || (select id from ids where name = 't1') || '/11111111-1111-1111-1111-111111111111.jpg',
      'name', 'site.jpg', 'mime', 'image/jpeg', 'size', 1024))),
  null, 'the assignee submits a completion report with proof');
select throws_ok(format($f$select public.task_submit_report(%L, jsonb_build_object('summary', 'مرة أخرى'), '[]')$f$, (select id from ids where name = 't1')),
  '42501', null, 'a submitted task cannot be submitted again before review');
select is(private.storage_can_write('0000000a-0000-0000-0000-000000000000/reports/' || (select id from ids where name = 't1') || '/x.jpg'), false,
  'no more uploads while the report waits for review');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is((select count(*) from notifications where type = 'task_submitted'), 1::bigint, 'the reviewer is notified of the report');
select is((select count(*) from report_attachments), 1::bigint, 'the reviewer sees the proof attachments');
select throws_ok(format('select public.task_review(%L, ''changes'', null, ''  '')', (select id from ids where name = 't1')), 'P0001', 'note_required',
  'asking for changes needs a note');
select lives_ok(format('select public.task_review(%L, ''changes'', null, ''أرفق صورة لوحة التحكم'')', (select id from ids where name = 't1')),
  'the reviewer asks for changes');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is(private.storage_can_write('0000000a-0000-0000-0000-000000000000/reports/' || (select id from ids where name = 't1') || '/x.jpg'), true,
  'the assignee can upload again once changes are requested');
select lives_ok(format($f$select public.task_submit_report(%L, jsonb_build_object('summary', 'أرفقت صورة لوحة التحكم', 'hours_spent', '1'), '[]')$f$, (select id from ids where name = 't1')),
  'the assignee resubmits');
reset role;
select is((select max(round) from task_reports where task_id = (select id from ids where name = 't1')), 2::smallint, 'each submission is its own round');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(format('select public.task_review(%L, ''approve'', null, null)', (select id from ids where name = 't1')), 'P0001', 'rating_required',
  'approval needs a 1-5 rating');
select lives_ok(format('select public.task_review(%L, ''approve'', 5, ''عمل ممتاز'')', (select id from ids where name = 't1')), 'the reviewer approves with a rating');
select throws_ok(format($f$select public.task_update(%L, jsonb_build_object('title', 'تعديل', 'assignee_id', '000000a4-0000-0000-0000-000000000000', 'due_date', current_date))$f$,
  (select id from ids where name = 't1')), 'P0001', 'task_closed', 'an approved task is closed to edits');
select throws_ok(format('select public.task_delete(%L)', (select id from ids where name = 't1')), 'P0001', 'task_started', 'a started task cannot be deleted');
reset role;

select is((select status::text || ':' || rating from tasks where id = (select id from ids where name = 't1')), 'approved:5', 'the task is approved with its rating');
select is((select count(*) from audit_logs where action = 'task.approve'), 1::bigint, 'the approval is audited');

-- ---------------------------------------------------------------------------
-- Notifications belong to their recipient
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select public.notifications_mark_read(null);
select is((select count(*) from notifications where read_at is null), 0::bigint, 'an employee marks their notifications read');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select is((select count(*) from notifications where recipient_id = '000000a4-0000-0000-0000-000000000000'), 0::bigint,
  'nobody reads someone else''s notifications');
reset role;

-- A file a report points at can't be deleted through the storage API, not even by its uploader
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
-- (Storage forbids raw SQL deletes, so check the predicate the delete policy uses.)
select is(private.storage_file_in_use('0000000a-0000-0000-0000-000000000000/reports/' || (select id from ids where name = 't1') || '/11111111-1111-1111-1111-111111111111.jpg'), true,
  'proof files that a report cites are marked in use, so the storage delete policy refuses them');
select is(private.storage_file_in_use('0000000a-0000-0000-0000-000000000000/reports/' || (select id from ids where name = 't1') || '/33333333-3333-3333-3333-333333333333.jpg'), false,
  'a file nothing points at can still be cleaned up');
reset role;

-- A manager whose role was removed loses the team's tasks even while manager_id still points at them
insert into employees (id, company_id, user_id, national_id, id_type, full_name_ar, role, manager_id)
select '000000a6-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', null, '2000000906', 'resident', 'فني 3', 'employee', '000000a2-0000-0000-0000-000000000000';
insert into tasks (id, company_id, created_by, assignee_id, title, due_date)
values ('00000ea5-0000-0000-0000-000000000000', '0000000a-0000-0000-0000-000000000000', '000000a1-0000-0000-0000-000000000000', '000000a6-0000-0000-0000-000000000000', 'مهمة فريق HR', current_date);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*) from tasks where id = '00000ea5-0000-0000-0000-000000000000'), 0::bigint,
  'someone who is not currently a manager does not see a "team" task through manager_id alone');
reset role;

-- Review rights follow the current role: a demoted manager loses them on tasks they created
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
insert into ids select 't4', public.task_create(jsonb_build_object('title', 'مهمة قبل تغيير الدور', 'assignee_id', '000000a4-0000-0000-0000-000000000000', 'due_date', current_date));
reset role;
update employees set role = 'employee', manager_id = null where id = '000000a3-0000-0000-0000-000000000000';
update employees set manager_id = null where id = '000000a4-0000-0000-0000-000000000000';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select is(private.can_review_task((select id from ids where name = 't4')), false, 'a creator demoted to employee can no longer review');
select is((select count(*) from tasks where id = (select id from ids where name = 't4')), 0::bigint, 'nor see the task they created');
reset role;

-- Display names: same company only, names only
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is((select full_name_ar from public.people_names(array['000000a3-0000-0000-0000-000000000000'::uuid])), 'مشرف',
  'an employee can see their manager''s name');
select is((select count(*) from public.people_names(array['000000b1-0000-0000-0000-000000000000'::uuid])), 0::bigint,
  'names from another company are never returned');
reset role;

select * from finish();
rollback;
