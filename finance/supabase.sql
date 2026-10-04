begin;
create schema if not exists finance_private;
revoke all on schema finance_private from public,anon;
grant usage on schema finance_private to authenticated;
-- Run once in your Supabase project's SQL editor.
-- Only explicitly allowlisted, verified email addresses receive administrator access.
create table finance_private.finance_admin_invites(email text primary key);
alter table finance_private.finance_admin_invites enable row level security;
revoke all on finance_private.finance_admin_invites from public,anon,authenticated;
insert into finance_private.finance_admin_invites(email) values
('afalsuhaimi@gmail.com'),('eltahirsaad3@gmail.com'),('ahmed@safwah-group.com');
create table public.finance_admins(user_id uuid primary key references auth.users(id));
alter table public.finance_admins enable row level security;
create policy "Read own administrator membership" on public.finance_admins
 for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.finance_admins from anon,authenticated;
grant select on public.finance_admins to authenticated;
create function finance_private.activate_finance_admin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(
 select 1 from finance_private.finance_admin_invites where email=lower(new.email))
 then insert into public.finance_admins(user_id) values(new.id) on conflict do nothing;
 else delete from public.finance_admins where user_id=new.id;
 end if;
 return new;
end $$;
revoke all on function finance_private.activate_finance_admin() from public,anon,authenticated;
create trigger activate_verified_finance_admin after insert or update of email,email_confirmed_at on auth.users
for each row execute function finance_private.activate_finance_admin();
create table public.finance_records(
 id uuid primary key, data jsonb not null, revision integer not null default 1,
 updated_at timestamptz not null default now(),
 constraint valid_finance_record check (
 jsonb_typeof(data->'amount')='number' and (data->>'amount')::numeric>0
 and (data->>'amount')::numeric=trunc((data->>'amount')::numeric)
 and jsonb_typeof(data->'payments')='array' and jsonb_typeof(data->'attachments')='array'
 and coalesce(length(data->>'description'),0) between 1 and 2000)
);
alter table public.finance_records enable row level security;
create policy "Administrators read records" on public.finance_records for select to authenticated
 using(exists(select 1 from public.finance_admins where user_id=(select auth.uid())));
revoke all on public.finance_records from anon,authenticated;
grant select on public.finance_records to authenticated;
create or replace function finance_private.save_finance_record(record_id uuid,record_data jsonb,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare next_revision integer; payment jsonb; total_paid numeric:=0;
begin
 if not exists(select 1 from public.finance_admins where user_id=auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
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
 insert into public.finance_records(id,data) values(record_id,record_data) on conflict do nothing returning revision into next_revision;
 else
 update public.finance_records set data=record_data,revision=revision+1,updated_at=now()
 where id=record_id and revision=expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'STALE_RECORD'; end if;
 return next_revision;
end $$;
revoke all on function finance_private.save_finance_record(uuid,jsonb,integer) from public,anon;
grant execute on function finance_private.save_finance_record(uuid,jsonb,integer) to authenticated;
create function public.save_finance_record(record_id uuid,record_data jsonb,expected_revision integer)
returns integer language sql security invoker set search_path='' as $
 select finance_private.save_finance_record(record_id,record_data,expected_revision);
$;
revoke all on function public.save_finance_record(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_finance_record(uuid,jsonb,integer) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-documents','finance-documents',false,20000000,array['application/pdf','image/png','image/jpeg']);
create policy "Administrators read private documents" on storage.objects for select to authenticated
using(bucket_id='finance-documents' and exists(select 1 from public.finance_admins where user_id=(select auth.uid())));
create policy "Administrators upload private documents" on storage.objects for insert to authenticated
with check(bucket_id='finance-documents'
and exists(select 1 from public.finance_admins where user_id=(select auth.uid()))
and exists(select 1 from public.finance_records where id::text=(storage.foldername(name))[1]));
-- After the manager confirms their email, the project owner grants access:
-- insert into public.finance_admins(user_id)
-- select id from auth.users where email='MANAGER_EMAIL' and email_confirmed_at is not null;

commit;
