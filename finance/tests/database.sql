-- Transactional checks: nothing is persisted, and no email is sent.
begin;
insert into auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
values(gen_random_uuid(),'ahmed@safwah-group.com',now(),'authenticated','authenticated',now(),now());
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email='ahmed@safwah-group.com'),true);
set local role authenticated;
do $$
declare test_id uuid:=gen_random_uuid(); payload jsonb; version integer;
begin
 payload:=jsonb_build_object('id',test_id,'description','TEST - rolled back','kind','مصروف','amount',10000,'payments',jsonb_build_array(jsonb_build_object('amount',2000,'date','2026-10-04')),'attachments','[]'::jsonb,'reviewed',false,'account','كهرباء ومياه');
 version:=public.save_finance_record(test_id,payload,0);
 if version<>1 or not exists(select 1 from public.finance_records where id=test_id) then raise exception 'Admin save/read failed'; end if;
 version:=public.save_finance_record(test_id,payload,1);
 if version<>2 then raise exception 'Wrong updated version'; end if;
 begin
 perform public.save_finance_record(test_id,payload,1);raise exception 'Stale save accepted';
 exception when others then if sqlerrm<>'STALE_RECORD' then raise; end if;end;
 payload:=jsonb_set(payload,'{payments}','[{"amount":20000,"date":"2026-10-04"}]'::jsonb);
 begin
 perform public.save_finance_record(test_id,payload,2);raise exception 'Overpayment accepted';
 exception when others then if sqlerrm<>'INVALID_PAYMENT_TOTAL' then raise;end if;end;
end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$ begin
 if (select count(*) from public.finance_records)<>0 then raise exception 'Unauthorized read';end if;
 begin
 perform public.save_finance_record(gen_random_uuid(),'{}'::jsonb,0);raise exception 'Unauthorized save';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
end $$;
rollback;
