-- Transactional security checks: rollback retains no test users/data and sends no email.
begin;
create temporary table finance_access_test_context on commit drop as
select coalesce((select u.id from auth.users u where lower(u.email)='afalsuhaimi@gmail.com' limit 1),gen_random_uuid()) owner_id,
 gen_random_uuid() viewer_id,gen_random_uuid() editor_id,gen_random_uuid() outsider_id,
 coalesce((select u.id from auth.users u where lower(u.email)='eltahirsaad3@gmail.com' limit 1),gen_random_uuid()) legacy_id,
 exists(select 1 from public.finance_admins a join auth.users u on u.id=a.user_id where lower(u.email)='eltahirsaad3@gmail.com') legacy_was_admin,
 'access-viewer-'||gen_random_uuid()::text||'@example.invalid' viewer_email,
 'access-editor-'||gen_random_uuid()::text||'@example.invalid' editor_email,
 'access-outsider-'||gen_random_uuid()::text||'@example.invalid' outsider_email,
 gen_random_uuid() record_id,
 (select count(*) from finance_private.finance_access_requests r where r.email='afalsuhaimi@gmail.com') owner_requests_before,
 (select count(*) from finance_private.finance_access_notifications n where n.email='afalsuhaimi@gmail.com') owner_notifications_before;
grant select on pg_temp.finance_access_test_context to anon,authenticated,service_role;

insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
select owner_id,'afalsuhaimi@gmail.com',now(),'authenticated','authenticated',now(),now()
from pg_temp.finance_access_test_context c where not exists(select 1 from auth.users u where u.id=c.owner_id);
update auth.users u set email_confirmed_at=coalesce(u.email_confirmed_at,now())
where u.id=(select owner_id from pg_temp.finance_access_test_context);
insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
select viewer_id,viewer_email,null,'authenticated','authenticated',now(),now() from pg_temp.finance_access_test_context
union all select editor_id,editor_email,now(),'authenticated','authenticated',now(),now() from pg_temp.finance_access_test_context
union all select outsider_id,outsider_email,now(),'authenticated','authenticated',now(),now() from pg_temp.finance_access_test_context;
insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
select legacy_id,'eltahirsaad3@gmail.com',now(),'authenticated','authenticated',now(),now()
from pg_temp.finance_access_test_context c where not exists(select 1 from auth.users u where u.id=c.legacy_id);
update auth.users u set email_confirmed_at=coalesce(u.email_confirmed_at,now())
where u.id=(select legacy_id from pg_temp.finance_access_test_context);
do $$ begin
 if exists(select 1 from public.finance_admins a where a.user_id=(select legacy_id from pg_temp.finance_access_test_context))
 is distinct from (select legacy_was_admin from pg_temp.finance_access_test_context)
 then raise exception 'Legacy invitation auto-promoted or existing administrator was removed'; end if;
end $$;

set local role anon;
do $$
declare response jsonb; t pg_temp.finance_access_test_context%rowtype;
begin
 select * into t from pg_temp.finance_access_test_context;
 response:=public.request_finance_access('  '||upper(t.viewer_email)||'  ');
 if response<>'{"accepted":true}'::jsonb then raise exception 'Request response leaked state'; end if;
 if public.request_finance_access(t.viewer_email)<>response then raise exception 'Repeat response differs'; end if;
 if public.request_finance_access(t.editor_email)<>response then raise exception 'Other response differs'; end if;
 if public.request_finance_access('afalsuhaimi@gmail.com')<>response then raise exception 'Owner request response differs'; end if;
 begin perform public.request_finance_access('invalid email'); raise exception 'Invalid email accepted';
 exception when others then if sqlerrm<>'INVALID_EMAIL' then raise; end if; end;
 begin perform count(*) from finance_private.finance_access_requests; raise exception 'Anonymous private request read';
 exception when insufficient_privilege then null; end;
 begin perform count(*) from finance_private.finance_access_notifications; raise exception 'Anonymous outbox read';
 exception when insufficient_privilege then null; end;
 begin perform public.list_finance_access_requests(); raise exception 'Anonymous request list';
 exception when insufficient_privilege then null; end;
 begin perform public.decide_finance_access_request(gen_random_uuid(),true,'editor'); raise exception 'Anonymous approval';
 exception when insufficient_privilege then null; end;
 begin perform public.claim_finance_access_notifications(10); raise exception 'Anonymous outbox claim';
 exception when insufficient_privilege then null; end;
 begin perform public.complete_finance_access_notification(gen_random_uuid(),true); raise exception 'Anonymous outbox complete';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare t pg_temp.finance_access_test_context%rowtype;
begin
 select * into t from pg_temp.finance_access_test_context;
 if (select count(*) from finance_private.finance_access_requests r where r.email=t.viewer_email)<>1
 then raise exception 'Request not stored (ensure global 30/hour cap has free slots before tests)'; end if;
 if (select count(*) from finance_private.finance_access_notifications n where n.email=t.viewer_email and n.kind='request')<>1
 then raise exception 'Repeated request enqueued duplicate'; end if;
 if (select count(*) from finance_private.finance_access_requests r where r.email='afalsuhaimi@gmail.com')<>t.owner_requests_before
 or (select count(*) from finance_private.finance_access_notifications n where n.email='afalsuhaimi@gmail.com')<>t.owner_notifications_before
 then raise exception 'Owner self-request created an unnecessary request/notification'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select outsider_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_access_test_context%rowtype;
begin
 select * into t from pg_temp.finance_access_test_context;
 if (select count(*) from public.finance_records)<>0 then raise exception 'Unapproved financial read'; end if;
 begin perform public.save_finance_record(t.record_id,'{}'::jsonb,0); raise exception 'Unapproved save';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise; end if; end;
 begin perform public.list_finance_access_requests(); raise exception 'Non-owner request list';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise; end if; end;
 begin perform public.decide_finance_access_request(gen_random_uuid(),true,'editor'); raise exception 'Non-owner approval';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise; end if; end;
 begin insert into public.finance_members(user_id,access_role,approved_email) values(t.outsider_id,'editor',t.outsider_email); raise exception 'Self-promotion';
 exception when insufficient_privilege then null; end;
 begin perform public.claim_finance_access_notifications(10); raise exception 'Authenticated outbox claim';
 exception when insufficient_privilege then null; end;
 begin perform public.complete_finance_access_notification(gen_random_uuid(),true); raise exception 'Authenticated outbox complete';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Simulate an existing nonowner administrator, preserved until the owner's explicit new decision.
insert into public.finance_admins(user_id) select outsider_id from pg_temp.finance_access_test_context;
select public.request_finance_access((select outsider_email from pg_temp.finance_access_test_context));
insert into finance_private.finance_access_requests(email) values('afalsuhaimi@gmail.com') on conflict(email) do nothing;

select set_config('request.jwt.claim.sub',(select owner_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_access_test_context%rowtype; request_id uuid; response jsonb; payload jsonb;
begin
 select * into t from pg_temp.finance_access_test_context;
 select r.id into request_id from public.list_finance_access_requests('pending') r
 where r.email=t.viewer_email and not r.email_verified;
 if request_id is null then raise exception 'Owner cannot see unverified pending request'; end if;
 response:=public.decide_finance_access_request(request_id,true,'viewer');
 if response->>'status'<>'approved' or (response->>'email_verified')::boolean then raise exception 'Unconfirmed approval result incorrect'; end if;
 if exists(select 1 from public.finance_members m where m.user_id=t.viewer_id) then raise exception 'Unconfirmed account gained membership'; end if;
 select r.id into request_id from public.list_finance_access_requests('pending') r where r.email=t.editor_email;
 response:=public.decide_finance_access_request(request_id,true,'editor');
 if response->>'access_role'<>'editor' or not (response->>'email_verified')::boolean then raise exception 'Editor approval failed'; end if;
 select r.id into request_id from public.list_finance_access_requests('pending') r where r.email=t.outsider_email;
 response:=public.decide_finance_access_request(request_id,true,'viewer');
 if response->>'access_role'<>'viewer' then raise exception 'Legacy administrator viewer decision failed'; end if;
 select r.id into request_id from public.list_finance_access_requests(null) r where r.email='afalsuhaimi@gmail.com';
 begin perform public.decide_finance_access_request(request_id,false,'viewer'); raise exception 'Owner access was mutable';
 exception when others then if sqlerrm<>'OWNER_ACCESS_FIXED' then raise; end if; end;
 if not exists(select 1 from public.finance_admins a where a.user_id=t.owner_id) then raise exception 'Owner administrator removed'; end if;
 payload:=jsonb_build_object('id',t.record_id,'description','ACCESS TEST - rolled back','kind','مصروف','amount',10000,
  'payments','[]'::jsonb,'attachments','[]'::jsonb,'reviewed',false,'account','كهرباء ومياه');
 if public.save_finance_record(t.record_id,payload,0)<>1 then raise exception 'Owner save failed'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.finance_admins a where a.user_id=(select outsider_id from pg_temp.finance_access_test_context))
 then raise exception 'Explicit viewer decision left legacy administrator permission'; end if;
end $$;
update auth.users u set email_confirmed_at=now() where u.id=(select viewer_id from pg_temp.finance_access_test_context);
do $$ begin
 if not exists(select 1 from public.finance_members m where m.user_id=(select viewer_id from pg_temp.finance_access_test_context) and m.access_role='viewer')
 then raise exception 'Verified approved account did not activate'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select editor_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_access_test_context%rowtype; payload jsonb;
begin
 select * into t from pg_temp.finance_access_test_context;
 select r.data into payload from public.finance_records r where r.id=t.record_id;
 if public.save_finance_record(t.record_id,payload,1)<>2 then raise exception 'Approved editor save failed'; end if;
 insert into storage.objects(bucket_id,name) values('finance-documents',t.record_id::text||'/access-test.pdf');
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select viewer_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_access_test_context%rowtype; payload jsonb;
begin
 select * into t from pg_temp.finance_access_test_context;
 select r.data into payload from public.finance_records r where r.id=t.record_id;
 if payload is null then raise exception 'Viewer cannot read records'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='finance-documents' and o.name=t.record_id::text||'/access-test.pdf')
 then raise exception 'Viewer cannot read private documents'; end if;
 if (select count(*) from public.finance_members)<>1 then raise exception 'Viewer saw other membership'; end if;
 begin perform public.save_finance_record(t.record_id,payload,2); raise exception 'Viewer wrote record';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise; end if; end;
 begin insert into storage.objects(bucket_id,name) values('finance-documents',t.record_id::text||'/viewer-denied.pdf'); raise exception 'Viewer uploaded document';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Same decision does not enqueue twice; rejection removes read permission immediately.
select set_config('request.jwt.claim.sub',(select owner_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$
declare target_request_id uuid;
begin
 select r.id into target_request_id from public.list_finance_access_requests('approved') r
 where r.email=(select viewer_email from pg_temp.finance_access_test_context);
 perform public.decide_finance_access_request(target_request_id,true,'viewer');
end $$;
reset role;
do $$ begin
 if (select count(*) from finance_private.finance_access_notifications n where n.email=(select viewer_email from pg_temp.finance_access_test_context) and n.kind='approved')<>1
 then raise exception 'Identical decision enqueued duplicate'; end if;
end $$;
set local role authenticated;
do $$
declare target_request_id uuid;
begin
 select r.id into target_request_id from public.list_finance_access_requests('approved') r
 where r.email=(select viewer_email from pg_temp.finance_access_test_context);
 perform public.decide_finance_access_request(target_request_id,false,'viewer');
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select viewer_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.finance_records r where r.id=(select record_id from pg_temp.finance_access_test_context))
 then raise exception 'Rejected viewer retained read access'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select outsider_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_access_test_context%rowtype; payload jsonb;
begin
 select * into t from pg_temp.finance_access_test_context;
 select r.data into payload from public.finance_records r where r.id=t.record_id;
 if payload is null then raise exception 'Former legacy administrator lost granted viewer access'; end if;
 begin perform public.save_finance_record(t.record_id,payload,2); raise exception 'Former legacy administrator bypassed viewer role';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select owner_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$
declare target_request_id uuid;
begin
 select r.id into target_request_id from public.list_finance_access_requests('approved') r
 where r.email=(select outsider_email from pg_temp.finance_access_test_context);
 perform public.decide_finance_access_request(target_request_id,false,'viewer');
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select outsider_id::text from pg_temp.finance_access_test_context),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.finance_records r where r.id=(select record_id from pg_temp.finance_access_test_context))
 then raise exception 'Former legacy administrator bypassed rejection'; end if;
 begin perform public.save_finance_record((select record_id from pg_temp.finance_access_test_context),'{}'::jsonb,2); raise exception 'Rejected former administrator wrote';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise; end if; end;
end $$;
reset role;

-- Add eleven old, current pending test events; claim must cap its batch at ten.
with added_requests as (
 insert into finance_private.finance_access_requests(email,created_at,requested_at,request_window_started_at)
 select 'access-batch-'||gen_random_uuid()::text||'@example.invalid',now()-interval '2 days',now()-interval '2 days',now()-interval '2 days'
 from generate_series(1,11) returning id,email,requested_at
)
insert into finance_private.finance_access_notifications(request_id,kind,email,event_at,next_attempt_at)
select id,'request',email,requested_at,now()-interval '2 days' from added_requests;
set local role service_role;
do $$
declare notification record; claimed_count integer:=0; first_id uuid;
begin
 for notification in select * from public.claim_finance_access_notifications(100) loop
  claimed_count:=claimed_count+1;
  if first_id is null then first_id:=notification.id; end if;
 end loop;
 if claimed_count<>10 then raise exception 'Notification claim did not cap batch at ten'; end if;
 if not public.complete_finance_access_notification(first_id,true) then raise exception 'Notification complete failed'; end if;
 if public.complete_finance_access_notification(first_id,true) then raise exception 'Duplicate completion accepted'; end if;
end $$;
reset role;
rollback;
