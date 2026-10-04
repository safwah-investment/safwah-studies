create schema if not exists finance_private;
revoke all on schema finance_private from public,anon;
grant usage on schema finance_private to authenticated;
alter table public.finance_admin_invites set schema finance_private;
alter function public.activate_finance_admin() set schema finance_private;
create or replace function finance_private.activate_finance_admin() returns trigger
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
alter function public.save_finance_record(uuid,jsonb,integer) set schema finance_private;
create function public.save_finance_record(record_id uuid,record_data jsonb,expected_revision integer)
returns integer language sql security invoker set search_path='' as $$
 select finance_private.save_finance_record(record_id,record_data,expected_revision);
$$;
revoke all on function public.save_finance_record(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_finance_record(uuid,jsonb,integer) to authenticated;
