-- Private workspace for every authenticated Supabase identity, including anonymous users.
-- Apply after the current finance schema. Auth configuration/website changes are separate.
begin;

create schema if not exists finance_private;
revoke all on schema finance_private from public;
grant usage on schema finance_private to authenticated;

alter table public.finance_records
 add column owner_id uuid references auth.users(id) on delete set null;
create index finance_records_owner_updated_idx on public.finance_records(owner_id,updated_at desc,id);

-- Preserve the former institution ledger. Do not let an unverified email claimant take it.
-- If no trusted existing owner is found, rows stay NULL/private until a manual UUID assignment.
do $$
declare trusted_owner_id uuid;
begin
 select u.id into trusted_owner_id from auth.users u
 where lower(u.email)='afalsuhaimi@gmail.com' and u.email_confirmed_at is not null
 order by u.created_at,u.id limit 1;
 if trusted_owner_id is not null then
  update public.finance_records set owner_id=trusted_owner_id where owner_id is null;
 end if;
end;
$$;

alter table public.finance_records enable row level security;
-- This table belongs only to the finance app: remove every prior global/admin read policy.
do $$
declare existing_policy record;
begin
 for existing_policy in select p.policyname from pg_policies p
  where p.schemaname='public' and p.tablename='finance_records'
 loop execute format('drop policy %I on public.finance_records',existing_policy.policyname); end loop;
end;
$$;
revoke all on public.finance_records from public,anon,authenticated;
grant select on public.finance_records to authenticated;
create policy "Users read their own finance workspace" on public.finance_records
 for select to authenticated using(owner_id=(select auth.uid()));
create policy "Finance workspace ownership guard" on public.finance_records
 as restrictive for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

-- Email/admin approval is no longer a workspace access gate. Keep its data as an archive.
drop trigger if exists activate_verified_finance_admin on auth.users;
revoke all on public.finance_admins from public,anon,authenticated;
do $$
declare old_function record;
begin
 if to_regclass('public.finance_members') is not null then
  execute 'revoke all on public.finance_members from public,anon,authenticated';
 end if;
 for old_function in
  select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','finance_private') and p.proname in (
   'request_finance_access','list_finance_access_requests','decide_finance_access_request',
   'claim_finance_access_notifications','complete_finance_access_notification')
 loop execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',
  old_function.nspname,old_function.proname,old_function.args); end loop;
end;
$$;

-- Same RPC contract and validations; owner_id is assigned by the server and never transferred.
create or replace function finance_private.save_finance_record(record_id uuid,record_data jsonb,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare caller_id uuid:=auth.uid(); next_revision integer; payment jsonb; total_paid numeric:=0;
begin
 if caller_id is null or not exists(select 1 from auth.users u where u.id=caller_id)
 then raise exception 'ACCESS_DENIED'; end if;
 if record_data is null or jsonb_typeof(record_data)<>'object'
 or jsonb_typeof(record_data->'amount') is distinct from 'number'
 or jsonb_typeof(record_data->'payments') is distinct from 'array'
 or jsonb_typeof(record_data->'attachments') is distinct from 'array'
 or jsonb_typeof(record_data->'reviewed') is distinct from 'boolean'
 or jsonb_typeof(record_data->'description') is distinct from 'string'
 or (record_data->>'amount')::numeric>100000000000 then raise exception 'INVALID_RECORD'; end if;
 if record_data->>'id' is distinct from record_id::text then raise exception 'INVALID_ID'; end if;
 if coalesce(record_data->>'kind','') not in ('مصروف','إيراد','عهدة نقدية','أصل / تجهيزات','قيد التصنيف','مدد — رواتب الموظفين','رواتب المتدربين','المقطوع للعاملين') then raise exception 'INVALID_KIND'; end if;
 for payment in select * from jsonb_array_elements(record_data->'payments') loop
  if jsonb_typeof(payment->'amount') is distinct from 'number' or (payment->>'amount')::numeric<=0 or (payment->>'amount')::numeric<>trunc((payment->>'amount')::numeric) or coalesce(payment->>'date','')='' then raise exception 'INVALID_PAYMENT'; end if;
  total_paid:=total_paid+(payment->>'amount')::numeric;
 end loop;
 if total_paid>(record_data->>'amount')::numeric then raise exception 'INVALID_PAYMENT_TOTAL'; end if;
 if expected_revision=0 then
  insert into public.finance_records(id,data,owner_id) values(record_id,record_data,caller_id)
  on conflict do nothing returning revision into next_revision;
 else
  update public.finance_records set data=record_data,revision=revision+1,updated_at=now()
  where id=record_id and owner_id=caller_id and revision=expected_revision
  returning revision into next_revision;
 end if;
 -- Missing/other-owner/stale IDs share one response, without account/record enumeration.
 if next_revision is null then raise exception 'STALE_RECORD'; end if;
 return next_revision;
end;
$$;
revoke all on function finance_private.save_finance_record(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function finance_private.save_finance_record(uuid,jsonb,integer) to authenticated;
create or replace function public.save_finance_record(record_id uuid,record_data jsonb,expected_revision integer)
returns integer language sql security invoker set search_path='' as $$
 select finance_private.save_finance_record(record_id,record_data,expected_revision);
$$;
revoke all on function public.save_finance_record(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_finance_record(uuid,jsonb,integer) to authenticated;

-- Existing object paths remain record UUID/file UUID. The record determines ownership.
update storage.buckets set public=false where id='finance-documents';
drop policy if exists "Administrators read private documents" on storage.objects;
drop policy if exists "Administrators upload private documents" on storage.objects;
drop policy if exists "Approved members read private documents" on storage.objects;
drop policy if exists "Finance writers upload private documents" on storage.objects;
create policy "Users read their own finance documents" on storage.objects
 for select to authenticated
 using(bucket_id='finance-documents' and exists(
  select 1 from public.finance_records r
  where r.id::text=(storage.foldername(name))[1] and r.owner_id=(select auth.uid())
 ));
create policy "Users upload their own finance documents" on storage.objects
 for insert to authenticated
 with check(bucket_id='finance-documents' and exists(
  select 1 from public.finance_records r
  where r.id::text=(storage.foldername(name))[1] and r.owner_id=(select auth.uid())
 ));
-- A permissive policy for another bucket must never reopen finance objects.
create policy "Finance document ownership guard" on storage.objects
 as restrictive for all to authenticated
 using(bucket_id<>'finance-documents' or exists(
  select 1 from public.finance_records r
  where r.id::text=(storage.foldername(name))[1] and r.owner_id=(select auth.uid())
 ))
 with check(bucket_id<>'finance-documents' or exists(
  select 1 from public.finance_records r
  where r.id::text=(storage.foldername(name))[1] and r.owner_id=(select auth.uid())
 ));
create policy "Unsigned visitors cannot access finance documents" on storage.objects
 as restrictive for all to anon
 using(bucket_id<>'finance-documents') with check(bucket_id<>'finance-documents');

commit;
