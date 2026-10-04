-- Transactional tests: two no-email anonymous identities, no persisted users/files or mail.
begin;
create temporary table finance_workspace_test_context on commit drop as
select gen_random_uuid() user_a,gen_random_uuid() user_b,
 gen_random_uuid() record_a,gen_random_uuid() record_b,gen_random_uuid() quarantined_record,
 (select count(*) from public.finance_records) original_records,
 (select count(*) from public.finance_records where owner_id is null) original_unowned;
create temporary table finance_workspace_original_records on commit drop as
select id,owner_id,revision,data,updated_at from public.finance_records;
grant select on pg_temp.finance_workspace_test_context to authenticated,anon;

-- Matching editable display names must not match authentication/ownership.
insert into auth.users(id,aud,role,is_anonymous,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
select user_a,'authenticated','authenticated',true,null::text,null::timestamptz,'{"display_name":"Workspace test"}'::jsonb,now(),now()
from pg_temp.finance_workspace_test_context
union all
select user_b,'authenticated','authenticated',true,null::text,null::timestamptz,'{"display_name":"Workspace test"}'::jsonb,now(),now()
from pg_temp.finance_workspace_test_context;

-- A retained unassigned legacy row is quarantined, not claimed by a display name.
insert into public.finance_records(id,data,owner_id)
select quarantined_record,jsonb_build_object('id',quarantined_record,'description','UNOWNED TEST - rollback',
 'kind','مصروف','amount',10000,'payments','[]'::jsonb,'attachments','[]'::jsonb,'reviewed',false),null
from pg_temp.finance_workspace_test_context;

select set_config('request.jwt.claim.sub',(select user_a::text from pg_temp.finance_workspace_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_workspace_test_context%rowtype; payload jsonb;
begin
 select * into t from pg_temp.finance_workspace_test_context;
 if (select count(*) from public.finance_records)<>0 then raise exception 'New identity saw existing/legacy records'; end if;
 payload:=jsonb_build_object('id',t.record_a,'description','A TEST - rollback','kind','مصروف','amount',10000,
  'payments',jsonb_build_array(jsonb_build_object('amount',2000,'date','2026-10-04')),
  'attachments','[]'::jsonb,'reviewed',false,'owner_id',t.user_b,'account','كهرباء ومياه');
 if public.save_finance_record(t.record_a,payload,0)<>1 then raise exception 'No-email identity could not create record'; end if;
 if not exists(select 1 from public.finance_records r where r.id=t.record_a and r.owner_id=t.user_a)
 then raise exception 'Server did not assign authenticated owner'; end if;
 if public.save_finance_record(t.record_a,jsonb_set(payload,'{description}','"A changed"'::jsonb),1)<>2
 then raise exception 'Owner could not edit'; end if;
 begin perform public.save_finance_record(t.record_a,payload,1); raise exception 'Stale revision accepted';
 exception when others then if sqlerrm<>'STALE_RECORD' then raise; end if; end;
 begin perform public.save_finance_record(t.quarantined_record,jsonb_set(payload,'{id}',to_jsonb(t.quarantined_record)),1); raise exception 'Unowned legacy claim accepted';
 exception when others then if sqlerrm<>'STALE_RECORD' then raise; end if; end;
 begin update public.finance_records set owner_id=t.user_b where id=t.record_a; raise exception 'Direct ownership transfer accepted';
 exception when insufficient_privilege then null; end;
 begin insert into public.finance_records(id,data,owner_id) values(gen_random_uuid(),payload,t.user_b); raise exception 'Direct forged ownership insert accepted';
 exception when insufficient_privilege then null; end;
 insert into storage.objects(bucket_id,name) values('finance-documents',t.record_a::text||'/a-private.pdf');
 if not exists(select 1 from storage.objects o where o.bucket_id='finance-documents' and o.name=t.record_a::text||'/a-private.pdf')
 then raise exception 'Owner could not read own document'; end if;
end $$;
reset role;

-- Even a retained legacy finance_admin grant may not cross workspace boundaries.
insert into public.finance_admins(user_id) select user_b from pg_temp.finance_workspace_test_context;
select set_config('request.jwt.claim.sub',(select user_b::text from pg_temp.finance_workspace_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_workspace_test_context%rowtype; payload jsonb;
begin
 select * into t from pg_temp.finance_workspace_test_context;
 if (select count(*) from public.finance_records)<>0 then raise exception 'B/admin saw A/legacy records'; end if;
 payload:=jsonb_build_object('id',t.record_a,'description','B attempted A','kind','مصروف','amount',10000,
  'payments','[]'::jsonb,'attachments','[]'::jsonb,'reviewed',false);
 begin perform public.save_finance_record(t.record_a,payload,2); raise exception 'B edited A';
 exception when others then if sqlerrm<>'STALE_RECORD' then raise; end if; end;
 begin perform public.save_finance_record(t.record_a,payload,0); raise exception 'B replaced A';
 exception when others then if sqlerrm<>'STALE_RECORD' then raise; end if; end;
 if exists(select 1 from storage.objects o where o.bucket_id='finance-documents' and o.name=t.record_a::text||'/a-private.pdf')
 then raise exception 'B read A document'; end if;
 begin insert into storage.objects(bucket_id,name) values('finance-documents',t.record_a::text||'/b-forged.pdf'); raise exception 'B uploaded to A record';
 exception when insufficient_privilege then null; end;
 payload:=jsonb_set(payload,'{id}',to_jsonb(t.record_b));
 if public.save_finance_record(t.record_b,payload,0)<>1 then raise exception 'B own create failed'; end if;
 if not exists(select 1 from public.finance_records r where r.id=t.record_b and r.owner_id=t.user_b)
 then raise exception 'B owner assignment incorrect'; end if;
 insert into storage.objects(bucket_id,name) values('finance-documents',t.record_b::text||'/b-private.pdf');
 if not exists(select 1 from storage.objects o where o.bucket_id='finance-documents' and o.name=t.record_b::text||'/b-private.pdf')
 then raise exception 'B own document read failed'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select user_a::text from pg_temp.finance_workspace_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.finance_workspace_test_context%rowtype; payload jsonb;
begin
 select * into t from pg_temp.finance_workspace_test_context;
 if (select count(*) from public.finance_records)<>1 then raise exception 'A workspace was not isolated'; end if;
 if exists(select 1 from public.finance_records r where r.id=t.record_b) then raise exception 'A read B record'; end if;
 if exists(select 1 from storage.objects o where o.bucket_id='finance-documents' and o.name=t.record_b::text||'/b-private.pdf')
 then raise exception 'A read B document'; end if;
 payload:=jsonb_build_object('id',t.record_b,'description','A attempted B','kind','مصروف','amount',10000,
  'payments','[]'::jsonb,'attachments','[]'::jsonb,'reviewed',false);
 begin perform public.save_finance_record(t.record_b,payload,1); raise exception 'A edited B';
 exception when others then if sqlerrm<>'STALE_RECORD' then raise; end if; end;
 begin insert into storage.objects(bucket_id,name) values('finance-documents',t.record_b::text||'/a-forged.pdf'); raise exception 'A uploaded to B record';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Unauthenticated API visitors have no workspace or private documents.
set local request.jwt.claim.sub='';
set local role anon;
do $$
declare t pg_temp.finance_workspace_test_context%rowtype;
begin
 select * into t from pg_temp.finance_workspace_test_context;
 begin perform count(*) from public.finance_records; raise exception 'Unsigned visitor read records';
 exception when insufficient_privilege then null; end;
 begin perform public.save_finance_record(t.record_a,'{}'::jsonb,2); raise exception 'Unsigned visitor saved';
 exception when insufficient_privilege then null; end;
 begin
  if exists(select 1 from storage.objects o where o.bucket_id='finance-documents' and o.name in(t.record_a::text||'/a-private.pdf',t.record_b::text||'/b-private.pdf'))
  then raise exception 'Unsigned visitor read documents'; end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
declare t pg_temp.finance_workspace_test_context%rowtype;
begin
 select * into t from pg_temp.finance_workspace_test_context;
 if (select count(*) from public.finance_records)<>t.original_records+3 then raise exception 'Original record count changed'; end if;
 if (select count(*) from public.finance_records where owner_id is null)<>t.original_unowned+1 then raise exception 'Unassigned legacy rows changed'; end if;
 if exists(
  select 1 from pg_temp.finance_workspace_original_records original
  left join public.finance_records actual on actual.id=original.id
  where actual.id is null or actual.owner_id is distinct from original.owner_id
   or actual.revision is distinct from original.revision or actual.data is distinct from original.data
   or actual.updated_at is distinct from original.updated_at
 ) then raise exception 'Original financial data was modified'; end if;
 if (select revision from public.finance_records where id=t.record_a)<>2
 or (select data->>'description' from public.finance_records where id=t.record_a)<>'A changed'
 then raise exception 'Cross-user attempts changed A record'; end if;
 if exists(select 1 from storage.objects o where o.bucket_id='finance-documents' and o.name in(t.record_a::text||'/b-forged.pdf',t.record_b::text||'/a-forged.pdf'))
 then raise exception 'Cross-user upload unexpectedly persisted'; end if;
end $$;
-- Aggregate proof only; no user ids, emails, tokens, or record contents are returned.
select original_records as records_before_test,original_unowned as unassigned_before_test,
 true as two_workspaces_isolated,true as existing_data_preserved
from pg_temp.finance_workspace_test_context;
rollback;
