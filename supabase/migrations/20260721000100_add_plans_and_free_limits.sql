begin;

-- IMPORTANT PRE-FLIGHT CHECKS
-- Run these read-only queries manually before applying this migration in Supabase:
--
-- 1. Duplicate settings rows (the migration stops safely if this returns rows):
--    select user_id, count(*) as row_count, array_agg(id order by id) as settings_ids
--    from public.settings
--    group by user_id
--    having count(*) > 1;
--
-- 2. Existing policies that could be more permissive than the policies below:
--    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
--    from pg_policies
--    where schemaname = 'public'
--      and tablename in (
--        'settings', 'plan_limits', 'ai_evidence', 'vehicles',
--        'inventory_items', 'machines'
--      )
--    order by tablename, policyname;
--
-- 3. Existing auth.users triggers. Another settings-creation trigger can coexist only
--    if it is compatible with the unique settings.user_id constraint:
--    select trigger_name, event_manipulation, action_statement
--    from information_schema.triggers
--    where event_object_schema = 'auth' and event_object_table = 'users';
--
-- Do not delete duplicate settings rows automatically. Compare company_name and
-- logo_path, decide which row is canonical, merge the values manually, then rerun.

-- A. Account plan. Existing company and logo values are not touched.
alter table public.settings
  add column if not exists plan text not null default 'free';

alter table public.settings
  alter column plan set default 'free';

update public.settings
set plan = 'free'
where plan is null;

alter table public.settings
  alter column plan set not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.settings'::regclass
      and conname = 'settings_plan_check'
  ) then
    alter table public.settings
      add constraint settings_plan_check
      check (plan in ('free', 'pro', 'admin')) not valid;
  end if;
end
$migration$;

alter table public.settings
  validate constraint settings_plan_check;

-- B. One settings row per auth user. Stop the entire migration without changing
-- data if duplicates exist; resolving duplicates requires a manual decision.
do $migration$
declare
  duplicate_user_ids text;
begin
  select string_agg(user_id::text, ', ' order by user_id::text)
  into duplicate_user_ids
  from (
    select user_id
    from public.settings
    group by user_id
    having count(*) > 1
  ) duplicates;

  if duplicate_user_ids is not null then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_SETTINGS_USER_ID:' || duplicate_user_ids,
      hint = 'Merge duplicate settings rows manually; do not delete them automatically.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.settings'::regclass
      and contype in ('p', 'u')
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.settings'::regclass
            and attname = 'user_id'
            and not attisdropped
        )
      ]::smallint[]
  ) then
    alter table public.settings
      add constraint settings_user_id_key unique (user_id);
  end if;
end
$migration$;

-- C. Create only missing settings rows. Existing company_name and logo_path are
-- preserved because ON CONFLICT performs no update.
insert into public.settings (user_id, plan)
select users.id, 'free'
from auth.users as users
on conflict (user_id) do nothing;

-- D. Automatically create the free settings row for every new auth user.
create or replace function public.esblu_create_settings_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.settings (user_id, plan)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  return new;
end
$function$;

revoke all on function public.esblu_create_settings_for_new_user() from public;

drop trigger if exists esblu_create_settings_after_auth_user_insert on auth.users;

create trigger esblu_create_settings_after_auth_user_insert
after insert on auth.users
for each row
execute function public.esblu_create_settings_for_new_user();

-- Close the small registration race between the first backfill and installing
-- the auth.users trigger. Rows created before the trigger became visible are
-- picked up here; rows created afterwards are handled by the trigger.
insert into public.settings (user_id, plan)
select users.id, 'free'
from auth.users as users
on conflict (user_id) do nothing;

-- E. Central, database-authoritative plan limits. NULL means unlimited.
create table if not exists public.plan_limits (
  plan text primary key,
  ai_evidence integer null,
  vehicles integer null,
  inventory_items integer null,
  machines integer null,
  constraint plan_limits_plan_check
    check (plan in ('free', 'pro', 'admin')),
  constraint plan_limits_non_negative_check
    check (
      (ai_evidence is null or ai_evidence >= 0)
      and (vehicles is null or vehicles >= 0)
      and (inventory_items is null or inventory_items >= 0)
      and (machines is null or machines >= 0)
    )
);

-- If a partial plan_limits table already exists, add missing columns. Incompatible
-- existing column types or keys intentionally make the migration fail safely.
alter table public.plan_limits
  add column if not exists plan text,
  add column if not exists ai_evidence integer null,
  add column if not exists vehicles integer null,
  add column if not exists inventory_items integer null,
  add column if not exists machines integer null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.plan_limits'::regclass
      and conname = 'plan_limits_plan_check'
  ) then
    alter table public.plan_limits
      add constraint plan_limits_plan_check
      check (plan in ('free', 'pro', 'admin')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.plan_limits'::regclass
      and conname = 'plan_limits_non_negative_check'
  ) then
    alter table public.plan_limits
      add constraint plan_limits_non_negative_check
      check (
        (ai_evidence is null or ai_evidence >= 0)
        and (vehicles is null or vehicles >= 0)
        and (inventory_items is null or inventory_items >= 0)
        and (machines is null or machines >= 0)
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.plan_limits'::regclass
      and contype = 'p'
  ) then
    alter table public.plan_limits
      add constraint plan_limits_pkey primary key (plan);
  end if;
end
$migration$;

alter table public.plan_limits validate constraint plan_limits_plan_check;
alter table public.plan_limits validate constraint plan_limits_non_negative_check;

insert into public.plan_limits (
  plan,
  ai_evidence,
  vehicles,
  inventory_items,
  machines
)
values
  ('free', 5, 2, 5, 2),
  ('pro', null, null, null, null),
  ('admin', null, null, null, null)
on conflict (plan) do update
set
  ai_evidence = excluded.ai_evidence,
  vehicles = excluded.vehicles,
  inventory_items = excluded.inventory_items,
  machines = excluded.machines;

-- F. Authenticated users can keep using the current settings page, but cannot
-- insert or update plan. Existing frontend writes already send only these safe
-- columns; do not change them to send an object returned by select('*').
revoke insert, update on table public.settings from public, anon, authenticated;
revoke insert (plan), update (plan) on table public.settings from public, anon, authenticated;

grant select on table public.settings to authenticated;
grant insert (user_id, company_name, logo_path) on table public.settings to authenticated;
grant update (company_name, logo_path) on table public.settings to authenticated;

revoke all on table public.plan_limits from public, anon, authenticated;
grant select on table public.plan_limits to authenticated;

-- G. RLS. These policies are added without deleting existing policies. PostgreSQL
-- combines permissive policies with OR, so the pre-flight policy query must be
-- reviewed: an older broad policy can still make access broader than intended.
alter table public.settings enable row level security;
alter table public.plan_limits enable row level security;
alter table public.ai_evidence enable row level security;
alter table public.vehicles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.machines enable row level security;

do $migration$
declare
  table_name text;
begin
  foreach table_name in array array[
    'settings',
    'ai_evidence',
    'vehicles',
    'inventory_items',
    'machines'
  ]
  loop
    -- The audited production schema already has one compatible ALL owner policy
    -- on these tables. An ALL policy applies to SELECT/INSERT/UPDATE/DELETE, so
    -- adding four equivalent permissive policies would only create redundant OR
    -- branches. If no authenticated/PUBLIC ALL policy exists in another
    -- environment, create the granular fallback policies below.
    if exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and cmd = 'ALL'
        and (
          'authenticated' = any (roles)
          or 'public' = any (roles)
        )
    ) then
      raise notice 'Keeping existing audited ALL owner policy on public.%', table_name;
      continue;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'esblu_owner_select'
    ) then
      execute format(
        'create policy esblu_owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
        table_name
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'esblu_owner_insert'
    ) then
      execute format(
        'create policy esblu_owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
        table_name
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'esblu_owner_update'
    ) then
      execute format(
        'create policy esblu_owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
        table_name
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'esblu_owner_delete'
    ) then
      execute format(
        'create policy esblu_owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
        table_name
      );
    end if;
  end loop;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'plan_limits'
      and policyname = 'esblu_authenticated_plan_limits_select'
  ) then
    create policy esblu_authenticated_plan_limits_select
      on public.plan_limits
      for select
      to authenticated
      using (true);
  end if;
end
$migration$;

-- H. Authoritative limit enforcement. The transaction-level advisory lock
-- serializes inserts for the same user and resource across tabs and clients.
create or replace function public.esblu_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  authenticated_user_id uuid := auth.uid();
  request_role text := coalesce(auth.role(), '');
  is_privileged boolean := false;
  account_plan text := 'free';
  resource_limit integer;
  current_usage bigint;
begin
  if new.user_id is null then
    raise exception using
      errcode = '23502',
      message = 'PLAN_LIMIT_USER_MISSING';
  end if;

  is_privileged :=
    request_role = 'service_role'
    -- In a SECURITY DEFINER function current_user is the function owner. Use
    -- session_user to identify direct privileged SQL sessions and auth.role()
    -- above for PostgREST/service-role requests.
    or session_user in (
      'postgres',
      'service_role',
      'supabase_admin',
      'supabase_auth_admin'
    );

  if not is_privileged
    and (authenticated_user_id is null or new.user_id is distinct from authenticated_user_id)
  then
    raise exception using
      errcode = '42501',
      message = 'PLAN_LIMIT_USER_MISMATCH';
  end if;

  if tg_table_schema <> 'public'
    or tg_table_name not in ('ai_evidence', 'vehicles', 'inventory_items', 'machines')
  then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_LIMIT_UNSUPPORTED_RESOURCE:' || tg_table_schema || '.' || tg_table_name;
  end if;

  -- A single bigint lock key is deterministic for user + table. Hash collisions
  -- are harmless and only serialize two unrelated inserts for one transaction.
  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':' || tg_table_name, 0)
  );

  select settings.plan
  into account_plan
  from public.settings as settings
  where settings.user_id = new.user_id;

  account_plan := coalesce(account_plan, 'free');

  select case tg_table_name
    when 'ai_evidence' then limits.ai_evidence
    when 'vehicles' then limits.vehicles
    when 'inventory_items' then limits.inventory_items
    when 'machines' then limits.machines
  end
  into resource_limit
  from public.plan_limits as limits
  where limits.plan = account_plan;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_LIMIT_CONFIGURATION_MISSING:' || account_plan;
  end if;

  if resource_limit is null then
    return new;
  end if;

  execute format(
    'select count(*) from public.%I where user_id = $1',
    tg_table_name
  )
  into current_usage
  using new.user_id;

  if current_usage >= resource_limit then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_LIMIT_REACHED:' || tg_table_name;
  end if;

  return new;
end
$function$;

revoke all on function public.esblu_enforce_plan_limit() from public;

drop trigger if exists esblu_plan_limit_before_insert on public.ai_evidence;
create trigger esblu_plan_limit_before_insert
before insert on public.ai_evidence
for each row execute function public.esblu_enforce_plan_limit();

drop trigger if exists esblu_plan_limit_before_insert on public.vehicles;
create trigger esblu_plan_limit_before_insert
before insert on public.vehicles
for each row execute function public.esblu_enforce_plan_limit();

drop trigger if exists esblu_plan_limit_before_insert on public.inventory_items;
create trigger esblu_plan_limit_before_insert
before insert on public.inventory_items
for each row execute function public.esblu_enforce_plan_limit();

drop trigger if exists esblu_plan_limit_before_insert on public.machines;
create trigger esblu_plan_limit_before_insert
before insert on public.machines
for each row execute function public.esblu_enforce_plan_limit();

commit;
