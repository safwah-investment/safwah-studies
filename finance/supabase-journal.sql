-- Immutable, owner-isolated double-entry journals. Apply as one migration.
-- Amounts are integer halalas; no existing finance records are changed.
create table public.finance_journals (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete restrict,
 date date not null,
 data jsonb not null,
 posted_at timestamptz not null default clock_timestamp(),
 reversal_of uuid references public.finance_journals(id) on delete restrict,
 source_record_id uuid references public.finance_records(id) on delete restrict
);
create index finance_journals_owner_date_idx on public.finance_journals(owner_id,date,id);
create unique index finance_journals_one_reversal_idx on public.finance_journals(owner_id,reversal_of) where reversal_of is not null;
create index finance_journals_reversal_idx on public.finance_journals(reversal_of) where reversal_of is not null;
create index finance_journals_source_idx on public.finance_journals(source_record_id) where source_record_id is not null;
alter table public.finance_journals enable row level security;
create policy "Users read their own journals" on public.finance_journals
 for select to authenticated using (owner_id=(select auth.uid()));
create policy "Users insert their own validated journals" on public.finance_journals
 for insert to authenticated with check (owner_id=(select auth.uid()));
revoke all on public.finance_journals from public,anon,authenticated;
grant select,insert on public.finance_journals to authenticated;
grant usage on schema finance_private to authenticated;

create function finance_private.normalize_finance_journal(entry jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 caller uuid:=auth.uid();
 journal_id uuid; journal_date date; entry_type text; description_text text; reference_text text;
 reversal_id uuid; source_id uuid; original jsonb; expected_lines jsonb;
 line jsonb; account_code text; debit_value numeric; credit_value numeric;
 debit_total bigint:=0; credit_total bigint:=0; normalized_lines jsonb:='[]'::jsonb;
begin
 if caller is null then raise exception 'JOURNAL_AUTH_REQUIRED'; end if;
 if entry is null or jsonb_typeof(entry)<>'object' or octet_length(entry::text)>32768 then raise exception 'JOURNAL_INVALID'; end if;
 if jsonb_typeof(entry->'id') is distinct from 'string' or (entry->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'JOURNAL_ID_INVALID'; end if;
 begin journal_id:=(entry->>'id')::uuid; exception when invalid_text_representation then raise exception 'JOURNAL_ID_INVALID'; end;
 if jsonb_typeof(entry->'date') is distinct from 'string' or (entry->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'JOURNAL_DATE_INVALID'; end if;
 begin
  journal_date:=(entry->>'date')::date;
  if to_char(journal_date,'YYYY-MM-DD')<>entry->>'date' or journal_date<date '0001-01-01' or journal_date>date '9999-12-31' then raise exception 'JOURNAL_DATE_INVALID'; end if;
 exception when datetime_field_overflow or invalid_datetime_format then raise exception 'JOURNAL_DATE_INVALID'; end;
 if entry ? 'entryType' and jsonb_typeof(entry->'entryType') is distinct from 'string' then raise exception 'JOURNAL_TYPE_INVALID'; end if;
 entry_type:=coalesce(entry->>'entryType','standard');
 if entry_type not in ('standard','opening','reversal') then raise exception 'JOURNAL_TYPE_INVALID'; end if;
 if jsonb_typeof(entry->'description') is distinct from 'string' then raise exception 'JOURNAL_DESCRIPTION_INVALID'; end if;
 description_text:=btrim(entry->>'description');
 if description_text='' or length(description_text)>2000 then raise exception 'JOURNAL_DESCRIPTION_INVALID'; end if;
 if entry ? 'reference' and entry->'reference'<>'null'::jsonb and jsonb_typeof(entry->'reference')<>'string' then raise exception 'JOURNAL_REFERENCE_INVALID'; end if;
 reference_text:=btrim(coalesce(entry->>'reference',''));
 if length(reference_text)>200 then raise exception 'JOURNAL_REFERENCE_INVALID'; end if;
 if entry ? 'reversalOf' and entry->'reversalOf'<>'null'::jsonb and entry->>'reversalOf'<>'' then
  if jsonb_typeof(entry->'reversalOf')<>'string' or (entry->>'reversalOf') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'JOURNAL_REVERSAL_INVALID'; end if;
  begin reversal_id:=(entry->>'reversalOf')::uuid; exception when invalid_text_representation then raise exception 'JOURNAL_REVERSAL_INVALID'; end;
 end if;
 if (entry_type='reversal')<>(reversal_id is not null) or reversal_id=journal_id then raise exception 'JOURNAL_REVERSAL_INVALID'; end if;
 if entry ? 'sourceRecordId' and entry->'sourceRecordId'<>'null'::jsonb and entry->>'sourceRecordId'<>'' then
  if jsonb_typeof(entry->'sourceRecordId')<>'string' or (entry->>'sourceRecordId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'JOURNAL_SOURCE_INVALID'; end if;
  begin source_id:=(entry->>'sourceRecordId')::uuid; exception when invalid_text_representation then raise exception 'JOURNAL_SOURCE_INVALID'; end;
  if not exists(select 1 from public.finance_records r where r.id=source_id and r.owner_id=caller) then raise exception 'JOURNAL_SOURCE_INVALID'; end if;
 end if;
 if jsonb_typeof(entry->'lines') is distinct from 'array' then raise exception 'JOURNAL_LINES_INVALID'; end if;
 if jsonb_array_length(entry->'lines') not between 2 and 40 then raise exception 'JOURNAL_LINES_INVALID'; end if;
 for line in select value from jsonb_array_elements(entry->'lines') loop
  if jsonb_typeof(line)<>'object' or jsonb_typeof(line->'account') is distinct from 'string' then raise exception 'JOURNAL_ACCOUNT_INVALID'; end if;
  account_code:=line->>'account';
  if account_code not in ('1101','1102','1103','1104','1105','1106','1107','1201','1202','1203','1204','2101','2102','2103','3101','3102','4101','5101','5102','5103','5104','5105','5106','5201','5202','5203') then raise exception 'JOURNAL_ACCOUNT_INVALID'; end if;
  if (line ? 'debit' and jsonb_typeof(line->'debit') is distinct from 'number') or (line ? 'credit' and jsonb_typeof(line->'credit') is distinct from 'number') then raise exception 'JOURNAL_AMOUNT_INVALID'; end if;
  debit_value:=coalesce(line->>'debit','0')::numeric; credit_value:=coalesce(line->>'credit','0')::numeric;
  if debit_value<0 or credit_value<0 or debit_value>100000000000 or credit_value>100000000000 or debit_value<>trunc(debit_value) or credit_value<>trunc(credit_value) or (debit_value>0)=(credit_value>0) then raise exception 'JOURNAL_AMOUNT_INVALID'; end if;
  debit_total:=debit_total+debit_value::bigint; credit_total:=credit_total+credit_value::bigint;
  if debit_total>100000000000 or credit_total>100000000000 then raise exception 'JOURNAL_TOTAL_INVALID'; end if;
  normalized_lines:=normalized_lines||jsonb_build_array(jsonb_build_object('account',account_code,'debit',debit_value::bigint,'credit',credit_value::bigint));
 end loop;
 if debit_total<=0 or debit_total<>credit_total then raise exception 'JOURNAL_UNBALANCED'; end if;
 if reversal_id is not null then
  select j.data into original from public.finance_journals j where j.id=reversal_id and j.owner_id=caller;
  if original is null or original->>'entryType'='reversal' or journal_date<(original->>'date')::date or source_id is distinct from (original->>'sourceRecordId')::uuid then raise exception 'JOURNAL_REVERSAL_INVALID'; end if;
  select jsonb_agg(jsonb_build_object('account',item.value->>'account','debit',(item.value->>'credit')::bigint,'credit',(item.value->>'debit')::bigint) order by item.ordinality)
   into expected_lines from jsonb_array_elements(original->'lines') with ordinality as item(value,ordinality);
  if normalized_lines<>expected_lines then raise exception 'JOURNAL_REVERSAL_MISMATCH'; end if;
 end if;
 return jsonb_build_object('id',journal_id::text,'date',to_char(journal_date,'YYYY-MM-DD'),'entryType',entry_type,'description',description_text,'reference',reference_text,'sourceRecordId',source_id::text,'reversalOf',reversal_id::text,'lines',normalized_lines);
end;
$$;
revoke all on function finance_private.normalize_finance_journal(jsonb) from public,anon;
grant execute on function finance_private.normalize_finance_journal(jsonb) to authenticated;

create function finance_private.guard_finance_journal() returns trigger
language plpgsql security invoker set search_path='' as $$
declare normalized jsonb;
begin
 if TG_OP<>'INSERT' then raise exception 'JOURNAL_IMMUTABLE'; end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'JOURNAL_OWNER_INVALID'; end if;
 normalized:=finance_private.normalize_finance_journal(new.data);
 if new.id is distinct from (normalized->>'id')::uuid or new.date is distinct from (normalized->>'date')::date or new.reversal_of is distinct from (normalized->>'reversalOf')::uuid or new.source_record_id is distinct from (normalized->>'sourceRecordId')::uuid then raise exception 'JOURNAL_COLUMNS_MISMATCH'; end if;
 new.data:=normalized;
 new.posted_at:=clock_timestamp();
 return new;
end;
$$;
revoke all on function finance_private.guard_finance_journal() from public,anon,authenticated;
create trigger finance_journal_guard before insert or update or delete on public.finance_journals
 for each row execute function finance_private.guard_finance_journal();

create function public.post_finance_journal(entry jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare normalized jsonb; journal_id uuid; saved public.finance_journals; conflict_constraint text;
begin
 normalized:=finance_private.normalize_finance_journal(entry);
 journal_id:=(normalized->>'id')::uuid;
 select * into saved from public.finance_journals j where j.id=journal_id and j.owner_id=auth.uid();
 if found then
  if saved.data<>normalized then raise exception 'JOURNAL_CONFLICT'; end if;
  return jsonb_build_object('id',saved.id,'data',saved.data,'posted_at',saved.posted_at);
 end if;
 begin
  insert into public.finance_journals(id,owner_id,date,data,reversal_of,source_record_id)
  values(journal_id,auth.uid(),(normalized->>'date')::date,normalized,(normalized->>'reversalOf')::uuid,(normalized->>'sourceRecordId')::uuid)
  on conflict(id) do nothing returning * into saved;
 exception when unique_violation then
  get stacked diagnostics conflict_constraint=constraint_name;
  if conflict_constraint='finance_journals_one_reversal_idx' then raise exception 'JOURNAL_ALREADY_REVERSED'; end if;
  raise exception 'JOURNAL_CONFLICT';
 end;
 if saved.id is null then
  select * into saved from public.finance_journals j where j.id=journal_id and j.owner_id=auth.uid();
  if saved.id is null or saved.data<>normalized then raise exception 'JOURNAL_CONFLICT'; end if;
 end if;
 return jsonb_build_object('id',saved.id,'data',saved.data,'posted_at',saved.posted_at);
end;
$$;
revoke all on function public.post_finance_journal(jsonb) from public,anon;
grant execute on function public.post_finance_journal(jsonb) to authenticated;
