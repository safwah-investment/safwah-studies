-- Run after journal-schema.sql. All synthetic users/records/journals roll back.
begin;
create temporary table journal_test_context on commit drop as
select gen_random_uuid() user_a,gen_random_uuid() user_b,
 gen_random_uuid() source_a,gen_random_uuid() source_b,
 gen_random_uuid() journal_a,gen_random_uuid() journal_b,gen_random_uuid() reversal_a,
 (select count(*) from public.finance_journals) original_journals,
 (select count(*) from public.finance_records) original_records;
grant select on pg_temp.journal_test_context to authenticated,anon;
insert into auth.users(id,aud,role,is_anonymous,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
select user_a,'authenticated','authenticated',true,null::text,null::timestamptz,'{"display_name":"Journal rollback test"}'::jsonb,now(),now() from pg_temp.journal_test_context
union all
select user_b,'authenticated','authenticated',true,null::text,null::timestamptz,'{"display_name":"Journal rollback test"}'::jsonb,now(),now() from pg_temp.journal_test_context;
insert into public.finance_records(id,owner_id,data)
select source_a,user_a,jsonb_build_object('id',source_a,'kind','مصروف','description','Journal source A rollback','amount',10000,'payments','[]'::jsonb,'attachments','[]'::jsonb,'reviewed',false) from pg_temp.journal_test_context
union all
select source_b,user_b,jsonb_build_object('id',source_b,'kind','مصروف','description','Journal source B rollback','amount',10000,'payments','[]'::jsonb,'attachments','[]'::jsonb,'reviewed',false) from pg_temp.journal_test_context;

create function pg_temp.journal_expect_reject(statement text,expected text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 begin
  execute statement;
  raise exception 'TEST_EXPECTED_REJECTION_NOT_RAISED';
 exception when others then
  if sqlerrm<>expected then raise exception 'Expected %, received %',expected,sqlerrm; end if;
 end;
end $$;
grant execute on function pg_temp.journal_expect_reject(text,text) to authenticated,anon;

select set_config('request.jwt.claim.sub',(select user_a::text from pg_temp.journal_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.journal_test_context%rowtype; payload jsonb; response jsonb; repeated jsonb; reversal jsonb; test_payload jsonb;
begin
 select * into t from pg_temp.journal_test_context;
 if (select count(*) from public.finance_journals)<>0 then raise exception 'New owner saw existing journals'; end if;
 payload:=jsonb_build_object('id',t.journal_a,'date','2026-10-06','entryType','standard','description',' A posted journal ','reference',' J-A ',
  'sourceRecordId',t.source_a,'reversalOf',null,'owner_id',t.user_b,'postedAt','1900-01-01',
  'lines',jsonb_build_array(jsonb_build_object('account','5103','debit',10000),jsonb_build_object('account','1101','credit',10000)));
 response:=public.post_finance_journal(payload);
 if response->>'id'<>t.journal_a::text or response->>'posted_at' is null then raise exception 'RPC response contract wrong'; end if;
 if not exists(select 1 from public.finance_journals j where j.id=t.journal_a and j.owner_id=t.user_a and j.source_record_id=t.source_a and j.date=date '2026-10-06') then raise exception 'Owner/source/date were not assigned correctly'; end if;
 if response->'data' ? 'owner_id' or response->'data' ? 'postedAt' or response->'data'->>'description'<>'A posted journal' or response->'data'->>'reference'<>'J-A' then raise exception 'Payload normalization wrong'; end if;
 repeated:=public.post_finance_journal(payload);
 if repeated<>response or (select count(*) from public.finance_journals)<>1 then raise exception 'Same-id retry duplicated/mutated journal'; end if;
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{description}','"Changed"'::jsonb)::text),'JOURNAL_CONFLICT');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{sourceRecordId}',to_jsonb(t.source_b))::text),'JOURNAL_SOURCE_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{date}','"2026-02-30"'::jsonb)::text),'JOURNAL_DATE_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{date}','"2026-2-3"'::jsonb)::text),'JOURNAL_DATE_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{lines,1,credit}','9999'::jsonb)::text),'JOURNAL_UNBALANCED');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{lines,0,account}','"9999"'::jsonb)::text),'JOURNAL_ACCOUNT_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{lines,0,debit}','1.5'::jsonb)::text),'JOURNAL_AMOUNT_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{lines,0,debit}','"10000"'::jsonb)::text),'JOURNAL_AMOUNT_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{lines,0,credit}','1'::jsonb)::text),'JOURNAL_AMOUNT_INVALID');
 test_payload:=jsonb_set(payload,'{lines}',jsonb_build_array(jsonb_build_object('account','1101','debit',60000000000,'credit',0),jsonb_build_object('account','1102','debit',60000000000,'credit',0),jsonb_build_object('account','3101','debit',0,'credit',60000000000),jsonb_build_object('account','3102','debit',0,'credit',60000000000)));
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',test_payload::text),'JOURNAL_TOTAL_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{lines,0,debit}','100000000001'::jsonb)::text),'JOURNAL_AMOUNT_INVALID');
 -- Direct inserts must pass the same database guard, not just frontend validation.
 test_payload:=jsonb_set(jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid())),'{lines,1,credit}','9999'::jsonb);
 perform pg_temp.journal_expect_reject(format('insert into public.finance_journals(id,owner_id,date,data,source_record_id) values(%L::uuid,%L::uuid,%L::date,%L::jsonb,%L::uuid)',test_payload->>'id',t.user_a,'2026-10-06',test_payload::text,t.source_a),'JOURNAL_UNBALANCED');
 test_payload:=jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid()));
 perform pg_temp.journal_expect_reject(format('insert into public.finance_journals(id,owner_id,date,data,source_record_id) values(%L::uuid,%L::uuid,%L::date,%L::jsonb,%L::uuid)',test_payload->>'id',t.user_b,'2026-10-06',test_payload::text,t.source_a),'JOURNAL_OWNER_INVALID');
 perform pg_temp.journal_expect_reject(format('insert into public.finance_journals(id,owner_id,date,data,source_record_id) values(%L::uuid,%L::uuid,%L::date,%L::jsonb,%L::uuid)',test_payload->>'id',t.user_a,'2026-10-07',test_payload::text,t.source_a),'JOURNAL_COLUMNS_MISMATCH');
 begin update public.finance_journals set data='{}'::jsonb where id=t.journal_a; raise exception 'UPDATE accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.finance_journals where id=t.journal_a; raise exception 'DELETE accepted'; exception when insufficient_privilege then null; end;
 reversal:=jsonb_build_object('id',t.reversal_a,'date','2026-10-06','entryType','reversal','description','A exact reversal','reference','','sourceRecordId',t.source_a,'reversalOf',t.journal_a,
  'lines',jsonb_build_array(jsonb_build_object('account','5103','debit',0,'credit',10000),jsonb_build_object('account','1101','debit',10000,'credit',0)));
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(reversal,'{date}','"2026-10-05"'::jsonb)::text),'JOURNAL_REVERSAL_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(reversal,'{sourceRecordId}','null'::jsonb)::text),'JOURNAL_REVERSAL_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(jsonb_set(reversal,'{lines,0,credit}','9000'::jsonb),'{lines,1,debit}','9000'::jsonb)::text),'JOURNAL_REVERSAL_MISMATCH');
 response:=public.post_finance_journal(reversal);
 if public.post_finance_journal(reversal)<>response then raise exception 'Reversal retry changed row'; end if;
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(reversal,'{id}',to_jsonb(gen_random_uuid()))::text),'JOURNAL_ALREADY_REVERSED');
 test_payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid())),'{entryType}','"reversal"'::jsonb),'{reversalOf}',to_jsonb(t.reversal_a));
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',test_payload::text),'JOURNAL_REVERSAL_INVALID');
 if (select count(*) from public.finance_journals)<>2 then raise exception 'Rejected requests left rows'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select user_b::text from pg_temp.journal_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.journal_test_context%rowtype; payload jsonb;
begin
 select * into t from pg_temp.journal_test_context;
 if (select count(*) from public.finance_journals)<>0 then raise exception 'B read A journal/reversal'; end if;
 payload:=jsonb_build_object('id',t.journal_b,'date','2026-10-06','entryType','opening','description','B opening','reference','','sourceRecordId',t.source_b,'reversalOf',null,
  'lines',jsonb_build_array(jsonb_build_object('account','1101','debit',10000,'credit',0),jsonb_build_object('account','3101','debit',0,'credit',10000)));
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{sourceRecordId}',to_jsonb(t.source_a))::text),'JOURNAL_SOURCE_INVALID');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',jsonb_set(payload,'{id}',to_jsonb(t.journal_a))::text),'JOURNAL_CONFLICT');
 perform pg_temp.journal_expect_reject(format('select public.post_finance_journal(%L::jsonb)',(payload||jsonb_build_object('entryType','reversal','reversalOf',t.journal_a))::text),'JOURNAL_REVERSAL_INVALID');
 perform public.post_finance_journal(payload);
 if (select count(*) from public.finance_journals)<>1 then raise exception 'B own journal missing'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub',(select user_a::text from pg_temp.journal_test_context),true);
set local role authenticated;
do $$
declare t pg_temp.journal_test_context%rowtype;
begin
 select * into t from pg_temp.journal_test_context;
 if exists(select 1 from public.finance_journals where id=t.journal_b) or (select count(*) from public.finance_journals)<>2 then raise exception 'A read B journal'; end if;
 if exists(select 1 from public.finance_journals where id=t.journal_a and posted_at<now()-interval '1 minute') then raise exception 'Client controlled posted_at'; end if;
end $$;
reset role;

set local request.jwt.claim.sub='';
set local role anon;
do $$
begin
 begin perform count(*) from public.finance_journals; raise exception 'Anon read journals'; exception when insufficient_privilege then null; end;
 begin perform public.post_finance_journal('{}'::jsonb); raise exception 'Anon posted journal'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare t pg_temp.journal_test_context%rowtype;
begin
 select * into t from pg_temp.journal_test_context;
 if (select count(*) from public.finance_journals)<>t.original_journals+3 then raise exception 'Unexpected journal count'; end if;
 if (select count(*) from public.finance_records)<>t.original_records+2 then raise exception 'Existing records changed'; end if;
end $$;
select 'JOURNAL_ISOLATION_TESTS_PASSED' as result;
rollback;
