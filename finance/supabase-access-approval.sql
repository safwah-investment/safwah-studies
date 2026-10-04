-- Apply after the existing finance schema/private-function migrations.
-- Email authentication proves identity; only the confirmed owner can approve access.
begin;

create schema if not exists finance_private;
revoke all on schema finance_private from public;
grant usage on schema finance_private to anon,authenticated,service_role;

create table finance_private.finance_access_requests (
 id uuid primary key default gen_random_uuid(),
 email text not null unique,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 access_role text check(access_role in ('viewer','editor')),
 created_at timestamptz not null default now(),
 requested_at timestamptz not null default now(),
 request_window_started_at timestamptz not null default now(),
 request_count integer not null default 1 check(request_count between 1 and 3),
 decided_at timestamptz,
 decided_by uuid references auth.users(id) on delete set null,
 constraint approved_role_required check(status <> 'approved' or access_role is not null),
 constraint normalized_request_email check(email=lower(btrim(email)) and length(email) between 3 and 254)
);
alter table finance_private.finance_access_requests enable row level security;
revoke all on finance_private.finance_access_requests from public,anon,authenticated,service_role;
create index finance_access_requests_status_requested_idx
 on finance_private.finance_access_requests(status,requested_at desc);

create table public.finance_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 access_role text not null check(access_role in ('viewer','editor')),
 approved_email text not null,
 approved_at timestamptz not null default now(),
 approved_by uuid references auth.users(id) on delete set null,
 constraint normalized_member_email check(approved_email=lower(btrim(approved_email)))
);
alter table public.finance_members enable row level security;
revoke all on public.finance_members from public,anon,authenticated;
grant select on public.finance_members to authenticated;
create index finance_members_approved_email_idx on public.finance_members(approved_email);

create table finance_private.finance_access_notifications (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references finance_private.finance_access_requests(id) on delete cascade,
 kind text not null check(kind in ('request','approved','rejected')),
 email text not null,
 access_role text check(access_role in ('viewer','editor')),
 event_at timestamptz not null default now(),
 state text not null default 'queued' check(state in ('queued','sending','sent','failed','dead','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz not null default now(),
 last_claimed_at timestamptz,
 delivered_at timestamptz,
 unique(request_id,kind,event_at)
);
alter table finance_private.finance_access_notifications enable row level security;
revoke all on finance_private.finance_access_notifications from public,anon,authenticated,service_role;
create index finance_access_notifications_retry_idx
 on finance_private.finance_access_notifications(next_attempt_at,event_at)
 where state in ('queued','sending','failed');
create index finance_access_notifications_request_rate_idx
 on finance_private.finance_access_notifications(event_at) where kind='request';

create or replace function finance_private.is_finance_owner()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from auth.users u where u.id=auth.uid()
  and lower(u.email)='afalsuhaimi@gmail.com' and u.email_confirmed_at is not null
 );
$$;
revoke all on function finance_private.is_finance_owner() from public,anon,authenticated;
grant execute on function finance_private.is_finance_owner() to authenticated;

create or replace function finance_private.is_finance_reader()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  finance_private.is_finance_owner()
  or exists(select 1 from public.finance_admins a where a.user_id=auth.uid())
  or exists(select 1 from public.finance_members m join auth.users u on u.id=m.user_id
   join finance_private.finance_access_requests r on r.email=m.approved_email
   where m.user_id=auth.uid() and u.email_confirmed_at is not null
   and lower(u.email)=m.approved_email and r.status='approved' and r.access_role=m.access_role)
 );
$$;
revoke all on function finance_private.is_finance_reader() from public,anon,authenticated;
grant execute on function finance_private.is_finance_reader() to authenticated;

create or replace function finance_private.is_finance_writer()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  finance_private.is_finance_owner()
  or exists(select 1 from public.finance_admins a where a.user_id=auth.uid())
  or exists(select 1 from public.finance_members m join auth.users u on u.id=m.user_id
   join finance_private.finance_access_requests r on r.email=m.approved_email
   where m.user_id=auth.uid() and m.access_role='editor'
   and u.email_confirmed_at is not null and lower(u.email)=m.approved_email
   and r.status='approved' and r.access_role=m.access_role)
 );
$$;
revoke all on function finance_private.is_finance_writer() from public,anon,authenticated;
grant execute on function finance_private.is_finance_writer() to authenticated;

create policy "Read own or owner-managed finance membership" on public.finance_members
 for select to authenticated
 using(user_id=(select auth.uid()) or (select finance_private.is_finance_owner()));

create or replace function finance_private.request_finance_access(email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized_email text:=lower(btrim(email));
 request_row finance_private.finance_access_requests%rowtype;
 accepted_at timestamptz:=clock_timestamp();
begin
 if normalized_email is null or length(normalized_email) not between 3 and 254
 or normalized_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$'
 then raise exception 'INVALID_EMAIL'; end if;
 -- The verified owner receives fixed access through authentication, without a request.
 if normalized_email='afalsuhaimi@gmail.com' then return jsonb_build_object('accepted',true); end if;
 -- Global and per-address gates are internal; responses reveal no approval/rate state.
 perform pg_advisory_xact_lock(hashtextextended('safwah-finance-access-global-gate',0));
 accepted_at:=clock_timestamp();
 if (select count(*) from finance_private.finance_access_notifications n
  where n.kind='request' and n.event_at>accepted_at-interval '1 hour')>=30
 then return jsonb_build_object('accepted',true); end if;
 perform pg_advisory_xact_lock(hashtextextended(normalized_email,0));
 select r.* into request_row from finance_private.finance_access_requests r
 where r.email=normalized_email for update;
 if not found then
  insert into finance_private.finance_access_requests(email,created_at,requested_at,request_window_started_at)
  values(normalized_email,accepted_at,accepted_at,accepted_at) returning * into request_row;
 elsif request_row.status<>'pending'
 or request_row.requested_at>accepted_at-interval '10 minutes'
 or (request_row.request_window_started_at>accepted_at-interval '24 hours' and request_row.request_count>=3)
 then return jsonb_build_object('accepted',true);
 else
  update finance_private.finance_access_requests r
  set requested_at=accepted_at,
   request_count=case when r.request_window_started_at<=accepted_at-interval '24 hours' then 1 else r.request_count+1 end,
   request_window_started_at=case when r.request_window_started_at<=accepted_at-interval '24 hours' then accepted_at else r.request_window_started_at end
 where r.id=request_row.id returning r.* into request_row;
 end if;
 update finance_private.finance_access_notifications n set state='cancelled'
 where n.request_id=request_row.id and n.kind='request' and n.state in ('queued','failed');
 insert into finance_private.finance_access_notifications(request_id,kind,email,event_at,next_attempt_at)
 values(request_row.id,'request',normalized_email,accepted_at,accepted_at);
 return jsonb_build_object('accepted',true);
end;
$$;
revoke all on function finance_private.request_finance_access(text) from public,anon,authenticated;
grant execute on function finance_private.request_finance_access(text) to anon,authenticated;
create function public.request_finance_access(email text)
returns jsonb language sql security invoker set search_path='' as $$
 select finance_private.request_finance_access(email);
$$;
revoke all on function public.request_finance_access(text) from public,anon,authenticated;
grant execute on function public.request_finance_access(text) to anon,authenticated;

create function finance_private.list_finance_access_requests(status_filter text default 'pending')
returns table(id uuid,email text,status text,access_role text,requested_at timestamptz,decided_at timestamptz,email_verified boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not finance_private.is_finance_owner() then raise exception 'ACCESS_DENIED'; end if;
 if status_filter is not null and status_filter not in ('pending','approved','rejected') then raise exception 'INVALID_STATUS'; end if;
 return query select r.id,r.email,r.status,r.access_role,r.requested_at,r.decided_at,
  exists(select 1 from auth.users u where lower(u.email)=r.email and u.email_confirmed_at is not null)
 from finance_private.finance_access_requests r
 where status_filter is null or r.status=status_filter
 order by r.requested_at desc,r.id limit 200;
end;
$$;
revoke all on function finance_private.list_finance_access_requests(text) from public,anon,authenticated;
grant execute on function finance_private.list_finance_access_requests(text) to authenticated;
create function public.list_finance_access_requests(status_filter text default 'pending')
returns table(id uuid,email text,status text,access_role text,requested_at timestamptz,decided_at timestamptz,email_verified boolean)
language sql security invoker set search_path='' as $$
 select * from finance_private.list_finance_access_requests(status_filter);
$$;
revoke all on function public.list_finance_access_requests(text) from public,anon,authenticated;
grant execute on function public.list_finance_access_requests(text) to authenticated;

create function finance_private.decide_finance_access_request(request_id uuid,approve boolean,desired_role text default 'viewer')
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row finance_private.finance_access_requests%rowtype;
 target_request_id uuid:=request_id; target_user_id uuid; decision_status text; decision_role text; decision_time timestamptz:=clock_timestamp();
begin
 if not finance_private.is_finance_owner() then raise exception 'ACCESS_DENIED'; end if;
 if approve is null or desired_role is null or desired_role not in ('viewer','editor') then raise exception 'INVALID_ROLE'; end if;
 select r.* into request_row from finance_private.finance_access_requests r where r.id=target_request_id for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if request_row.email='afalsuhaimi@gmail.com' then raise exception 'OWNER_ACCESS_FIXED'; end if;
 decision_status:=case when approve then 'approved' else 'rejected' end;
 decision_role:=case when approve then desired_role else null end;
 select u.id into target_user_id from auth.users u
 where lower(u.email)=request_row.email and u.email_confirmed_at is not null
 order by u.created_at,u.id limit 1;
 -- A new explicit owner decision replaces a non-owner's legacy admin grant.
 -- Migration/bootstrap itself preserves all pre-existing administrator rows.
 delete from public.finance_admins a using auth.users u
 where a.user_id=u.id and lower(u.email)=request_row.email
 and u.email_confirmed_at is not null and lower(u.email)<>'afalsuhaimi@gmail.com';
 if request_row.status is distinct from decision_status or request_row.access_role is distinct from decision_role then
  update finance_private.finance_access_requests r set status=decision_status,access_role=decision_role,
   decided_at=decision_time,decided_by=auth.uid() where r.id=target_request_id;
  -- Do not send old queued decisions after the owner changes their decision.
  update finance_private.finance_access_notifications n set state='cancelled'
  where n.request_id=target_request_id and n.state in ('queued','failed');
  insert into finance_private.finance_access_notifications(request_id,kind,email,access_role,event_at,next_attempt_at)
  values(target_request_id,decision_status,request_row.email,decision_role,decision_time,decision_time);
 end if;
 if approve and target_user_id is not null then
  insert into public.finance_members(user_id,access_role,approved_email,approved_at,approved_by)
  values(target_user_id,desired_role,request_row.email,decision_time,auth.uid())
  on conflict(user_id) do update set access_role=excluded.access_role,approved_email=excluded.approved_email,
   approved_at=excluded.approved_at,approved_by=excluded.approved_by;
 elsif not approve then
  delete from public.finance_members m where m.approved_email=request_row.email;
 end if;
 return jsonb_build_object('status',decision_status,'access_role',decision_role,'email_verified',target_user_id is not null);
end;
$$;
revoke all on function finance_private.decide_finance_access_request(uuid,boolean,text) from public,anon,authenticated;
grant execute on function finance_private.decide_finance_access_request(uuid,boolean,text) to authenticated;
create function public.decide_finance_access_request(request_id uuid,approve boolean,desired_role text default 'viewer')
returns jsonb language sql security invoker set search_path='' as $$
 select finance_private.decide_finance_access_request(request_id,approve,desired_role);
$$;
revoke all on function public.decide_finance_access_request(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.decide_finance_access_request(uuid,boolean,text) to authenticated;

-- Preserve all legacy administrators. New email-approved members still need verified identity.
create or replace function finance_private.activate_finance_admin() returns trigger
language plpgsql security definer set search_path='' as $$
declare approved_request finance_private.finance_access_requests%rowtype;
begin
 if new.email_confirmed_at is not null and lower(new.email)='afalsuhaimi@gmail.com'
 then insert into public.finance_admins(user_id) values(new.id) on conflict do nothing;
 end if;
 select r.* into approved_request from finance_private.finance_access_requests r
 where r.email=lower(new.email) and r.status='approved' for share;
 if new.email_confirmed_at is not null and found then
  insert into public.finance_members(user_id,access_role,approved_email,approved_at,approved_by)
  values(new.id,approved_request.access_role,approved_request.email,approved_request.decided_at,approved_request.decided_by)
  on conflict(user_id) do update set access_role=excluded.access_role,approved_email=excluded.approved_email,
   approved_at=excluded.approved_at,approved_by=excluded.approved_by;
 else
  delete from public.finance_members m where m.user_id=new.id;
 end if;
 return new;
end;
$$;
revoke all on function finance_private.activate_finance_admin() from public,anon,authenticated,service_role;

-- Replace the existing read policies, leaving the data untouched.
drop policy if exists "Administrators read records" on public.finance_records;
create policy "Approved members read records" on public.finance_records for select to authenticated
 using((select finance_private.is_finance_reader()));
drop policy if exists "Administrators read private documents" on storage.objects;
create policy "Approved members read private documents" on storage.objects for select to authenticated
 using(bucket_id='finance-documents' and (select finance_private.is_finance_reader()));
drop policy if exists "Administrators upload private documents" on storage.objects;
create policy "Finance writers upload private documents" on storage.objects for insert to authenticated
 with check(bucket_id='finance-documents' and (select finance_private.is_finance_writer())
 and exists(select 1 from public.finance_records r where r.id::text=(storage.foldername(name))[1]));

-- Same validation and concurrency behavior as the current save RPC; authorization also permits approved editors.
create or replace function finance_private.save_finance_record(record_id uuid,record_data jsonb,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare next_revision integer; payment jsonb; total_paid numeric:=0;
begin
 if not finance_private.is_finance_writer() then raise exception 'ACCESS_DENIED'; end if;
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
end;
$$;
revoke all on function finance_private.save_finance_record(uuid,jsonb,integer) from public,anon;
grant execute on function finance_private.save_finance_record(uuid,jsonb,integer) to authenticated;

-- Delivery worker APIs: only a server-held service role may claim or complete notifications.
create function finance_private.claim_finance_access_notifications(limit_count integer default 10)
returns table(id uuid,kind text,email text,request_id uuid,access_role text)
language plpgsql security definer set search_path='' as $$
begin
 -- Reclaimed work must still represent the current request/decision.
 update finance_private.finance_access_notifications n set state='cancelled'
 from finance_private.finance_access_requests r
 where r.id=n.request_id and (n.state in ('queued','failed')
  or (n.state='sending' and n.last_claimed_at<=now()-interval '10 minutes'))
 and ((n.kind='request' and (r.status<>'pending' or r.requested_at is distinct from n.event_at))
  or (n.kind in ('approved','rejected') and
   (r.status is distinct from n.kind or r.decided_at is distinct from n.event_at or r.access_role is distinct from n.access_role)));
 update finance_private.finance_access_notifications n set state='dead'
 where n.state='sending' and n.attempts>=5 and n.last_claimed_at<=now()-interval '10 minutes';
 return query
 with candidates as (
  select n.id from finance_private.finance_access_notifications n
  where n.attempts<5 and (
   (n.state in ('queued','failed') and n.next_attempt_at<=now())
   or (n.state='sending' and n.last_claimed_at<=now()-interval '10 minutes')
  ) order by n.event_at,n.id for update skip locked
  limit greatest(1,least(coalesce(limit_count,10),10))
 ), claimed as (
  update finance_private.finance_access_notifications n set state='sending',attempts=n.attempts+1,last_claimed_at=now()
  from candidates c where n.id=c.id
  returning n.id,n.kind,n.email,n.request_id,n.access_role
 ) select c.id,c.kind,c.email,c.request_id,c.access_role from claimed c;
end;
$$;
revoke all on function finance_private.claim_finance_access_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function finance_private.claim_finance_access_notifications(integer) to service_role;
create function public.claim_finance_access_notifications(limit_count integer default 10)
returns table(id uuid,kind text,email text,request_id uuid,access_role text)
language sql security invoker set search_path='' as $$
 select * from finance_private.claim_finance_access_notifications(limit_count);
$$;
revoke all on function public.claim_finance_access_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_finance_access_notifications(integer) to service_role;

create function finance_private.complete_finance_access_notification(notification_id uuid,delivered boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if delivered is null then raise exception 'INVALID_DELIVERY_RESULT'; end if;
 update finance_private.finance_access_notifications n
 set state=case when delivered then 'sent' when n.attempts>=5 then 'dead' else 'failed' end,
  delivered_at=case when delivered then now() else null end,next_attempt_at=now()+interval '10 minutes'
 where n.id=notification_id and n.state='sending';
 get diagnostics changed=row_count;
 return changed=1;
end;
$$;
revoke all on function finance_private.complete_finance_access_notification(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function finance_private.complete_finance_access_notification(uuid,boolean) to service_role;
create function public.complete_finance_access_notification(notification_id uuid,delivered boolean)
returns boolean language sql security invoker set search_path='' as $$
 select finance_private.complete_finance_access_notification(notification_id,delivered);
$$;
revoke all on function public.complete_finance_access_notification(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.complete_finance_access_notification(uuid,boolean) to service_role;

commit;
