begin;

-- =============================================================================
-- Esblu — company-based RLS pre 12 business tabuliek (nahradenie user_id-only
-- autorizácie modelom založeným na aktívnom company_members membershipe)
-- =============================================================================
-- Kontext: company_id existuje a je backfillnutý na všetkých 12 business
-- tabuľkách (20260814120000), invite/membership flow funguje
-- (20260814130000), ale business RLS a triggery stále používajú výhradne
-- auth.uid() = user_id. Employee po prijatí pozvánky preto nevidí firemné
-- dáta. Táto migrácia to opravuje end-to-end na DB vrstve.
--
-- Rozsah — presne 12 business tabuliek:
--   ai_evidence, documents, document_links, document_attachments,
--   document_review_log, vehicles, vehicle_services, machines,
--   machine_services, machine_photos, inventory_items, inventory_photos
--
-- NEMENÍ: companies, company_members, company_invites, settings,
-- plan_limits (štruktúru), Storage buckety/policies (samostatná migrácia
-- 20260814170000), frontend kód.
--
-- Rolový model (company_members.role):
--   owner, admin  → plný prístup (SELECT/INSERT/UPDATE/DELETE) na všetkých
--                    12 tabuľkách v rámci vlastnej firmy.
--   employee      → plný prístup na: machines, machine_services,
--                    machine_photos, inventory_items, inventory_photos.
--                  → SELECT + INSERT (ale NIE UPDATE/DELETE) na: ai_evidence,
--                    documents, document_links, document_attachments.
--                  → SELECT + INSERT na document_review_log (append-only pre
--                    všetky role, nezmenené).
--                  → SELECT + INSERT + UPDATE (ale NIE DELETE) na
--                    vehicle_services.
--                  → iba SELECT (žiadny INSERT/UPDATE/DELETE) na vehicles.
--
-- Bezpečnostný princíp: company_id sa NIKDY neprijíma od klienta. Každý
-- INSERT/UPDATE ho automaticky prepíše triggerom na company_id z aktívneho
-- membershipu volajúceho (INSERT), alebo ho ponechá nezmenený bez ohľadu na
-- to, čo klient pošle (UPDATE — company_id je po vytvorení riadku
-- nemenný). RLS policies sú druhá, nezávislá vrstva obrany (WITH CHECK), nie
-- jediná — aj keby RLS policy mala chybu, trigger už predtým vynútil správnu
-- hodnotu.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Pomocné funkcie — odvodenie identity výhradne z auth.uid(), žiadny
--    parameter od klienta.
-- -----------------------------------------------------------------------------

create or replace function public.esblu_my_active_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select cm.company_id
  from public.company_members cm
  where cm.user_id = auth.uid()
    and cm.status = 'active'
  limit 1;
$function$;

comment on function public.esblu_my_active_company_id() is
  'Company_id aktívneho membershipu prihláseného používateľa (NULL, ak žiadny). '
  'Jediný zdroj pravdy pre "moja firma" v RLS policies a triggeroch. '
  '1 user = max 1 active membership (company_members_one_active_per_user_idx), '
  'limit 1 je iba obranná poistka.';

revoke all on function public.esblu_my_active_company_id() from public;
grant execute on function public.esblu_my_active_company_id() to authenticated;

create or replace function public.esblu_my_active_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select cm.role
  from public.company_members cm
  where cm.user_id = auth.uid()
    and cm.status = 'active'
  limit 1;
$function$;

comment on function public.esblu_my_active_role() is
  'Rola (owner/admin/employee) aktívneho membershipu prihláseného '
  'používateľa (NULL, ak žiadny aktívny membership).';

revoke all on function public.esblu_my_active_role() from public;
grant execute on function public.esblu_my_active_role() to authenticated;

create or replace function public.esblu_company_plan(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan text;
begin
  select s.plan
  into v_plan
  from public.company_members cm
  join public.settings s on s.user_id = cm.user_id
  where cm.company_id = p_company_id
    and cm.role = 'owner'
    and cm.status = 'active'
  limit 1;

  return coalesce(v_plan, 'free');
end;
$function$;

comment on function public.esblu_company_plan(uuid) is
  'Efektívny plán firmy = plán aktívneho ownera danej company_id (settings.plan). '
  'Fallback na ''free'', ak sa aktívny owner alebo jeho settings riadok '
  'nenájde (nemalo by nastať, ale funkcia nesmie vyhodiť chybu).';

revoke all on function public.esblu_company_plan(uuid) from public;
grant execute on function public.esblu_company_plan(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 1. Trigger funkcie pre automatické, neobídateľné company_id
-- -----------------------------------------------------------------------------

-- BEFORE INSERT na 8 tabuliek bez plan limitu (ai_evidence/vehicles/
-- inventory_items/machines majú vlastnú, rozšírenú verziu nižšie v kroku 2,
-- pretože tam sa company_id priraďuje v tej istej funkcii ako plan-limit
-- kontrola, aby bolo poradie s advisory lockom jednoznačné).
create or replace function public.esblu_assign_company_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
begin
  select cm.company_id
  into v_company_id
  from public.company_members cm
  where cm.user_id = auth.uid()
    and cm.status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_NO_ACTIVE_COMPANY_MEMBERSHIP:' || tg_table_schema || '.' || tg_table_name,
      hint = 'Prihlásený používateľ nemá aktívne členstvo v žiadnej firme, záznam nie je možné vytvoriť.';
  end if;

  new.company_id := v_company_id;
  return new;
end;
$function$;

revoke all on function public.esblu_assign_company_id() from public;

-- BEFORE UPDATE na všetkých 12 tabuľkách — company_id je po vytvorení riadku
-- nemenný, bez ohľadu na to, čo klient v UPDATE payloade pošle. Toto je
-- nezávislá druhá poistka popri WITH CHECK v RLS policies nižšie.
create or replace function public.esblu_lock_company_id_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.company_id := old.company_id;
  return new;
end;
$function$;

revoke all on function public.esblu_lock_company_id_on_update() from public;


-- -----------------------------------------------------------------------------
-- 2. Prepis esblu_enforce_plan_limit() — počíta a vynucuje limity per
--    company_id (nie per user_id), plán sa odvodí od aktívneho ownera firmy.
--    Táto funkcia teraz AJ priraďuje company_id (pre ai_evidence/vehicles/
--    inventory_items/machines) — samostatný esblu_assign_company_id trigger
--    sa na tieto 4 tabuľky nepridáva, aby nevznikla dvojznačnosť poradia
--    dvoch BEFORE INSERT triggerov.
-- -----------------------------------------------------------------------------

create or replace function public.esblu_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  authenticated_user_id uuid := auth.uid();
  request_role text := coalesce(auth.role(), '');
  is_privileged boolean := false;
  v_company_id uuid;
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
    or session_user in (
      'postgres',
      'service_role',
      'supabase_admin',
      'supabase_auth_admin'
    );

  -- user_id ostáva audit/created_by údaj (nie autorizačný), ale integrita
  -- auditu sa stále vynucuje: neprivilegovaný klient nesmie vložiť riadok s
  -- cudzím user_id.
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

  if is_privileged and new.company_id is not null then
    -- Privilegovaná session (service_role/postgres a pod.) môže company_id
    -- poslať explicitne (napr. administratívny skript) — dôverujeme jej,
    -- rovnako ako pôvodná funkcia dôverovala jej new.user_id.
    v_company_id := new.company_id;
  else
    select cm.company_id
    into v_company_id
    from public.company_members cm
    where cm.user_id = authenticated_user_id
      and cm.status = 'active'
    limit 1;
  end if;

  if v_company_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_NO_ACTIVE_COMPANY_MEMBERSHIP:' || tg_table_schema || '.' || tg_table_name,
      hint = 'Prihlásený používateľ nemá aktívne členstvo v žiadnej firme, záznam nie je možné vytvoriť.';
  end if;

  new.company_id := v_company_id;

  -- Advisory lock teraz na company_id + tabuľka (nie user_id + tabuľka) —
  -- serializuje súbežné inserty viacerých členov tej istej firmy do tej
  -- istej tabuľky, čo je presne to, čo treba pre správne počítanie limitu
  -- na úrovni firmy.
  perform pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':' || tg_table_name, 0)
  );

  account_plan := public.esblu_company_plan(v_company_id);

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
    'select count(*) from public.%I where company_id = $1',
    tg_table_name
  )
  into current_usage
  using v_company_id;

  if current_usage >= resource_limit then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_LIMIT_REACHED:' || tg_table_name;
  end if;

  return new;
end
$function$;

revoke all on function public.esblu_enforce_plan_limit() from public;


-- -----------------------------------------------------------------------------
-- 3. Pre-flight: žiadny riadok v žiadnej z 12 tabuliek nesmie mať
--    company_id IS NULL. Company-based RLS by taký riadok urobilo
--    neviditeľným pre všetkých (aj pre pôvodného majiteľa) — fail-closed,
--    nič sa nemení, ak sa nájde čo i len jeden.
-- -----------------------------------------------------------------------------

do $preflight$
declare
  table_name text;
  null_count integer;
  null_ids text;
begin
  foreach table_name in array array[
    'ai_evidence', 'documents', 'document_links', 'document_attachments',
    'document_review_log', 'vehicles', 'vehicle_services', 'machines',
    'machine_services', 'machine_photos', 'inventory_items', 'inventory_photos'
  ]
  loop
    execute format(
      'select count(*), string_agg(id::text, '', '' order by id::text) from public.%I where company_id is null',
      table_name
    )
    into null_count, null_ids;

    if null_count > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'COMPANY_RLS_NULL_COMPANY_ID:' || table_name || ':count=' || null_count::text || ':ids=' || coalesce(null_ids, ''),
        hint = 'Tabuľka obsahuje riadky bez company_id. Company-based RLS by ich urobilo neviditeľnými pre všetkých. Priraď company_id ručne (napr. znova spustiť backfill z 20260814120000 pre tieto riadky) pred touto migráciou.';
    end if;
  end loop;
end
$preflight$;


-- -----------------------------------------------------------------------------
-- 4. company_id → NOT NULL na všetkých 12 tabuľkách (bezpečné až po kroku 3)
-- -----------------------------------------------------------------------------

do $notnull$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_evidence', 'documents', 'document_links', 'document_attachments',
    'document_review_log', 'vehicles', 'vehicle_services', 'machines',
    'machine_services', 'machine_photos', 'inventory_items', 'inventory_photos'
  ]
  loop
    execute format('alter table public.%I alter column company_id set not null', table_name);
  end loop;
end
$notnull$;


-- -----------------------------------------------------------------------------
-- 5. Triggery — company_id sa vždy priradí/zamkne, nezávisle od RLS
-- -----------------------------------------------------------------------------

-- 5a. Tabuľky s plan limitom — jedna trigger funkcia rieši company_id AJ
--     limit (kvôli atomickosti advisory locku).
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

-- 5b. Zvyšných 8 tabuliek bez plan limitu — company_id priradí
--     esblu_assign_company_id.
do $insert_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'documents', 'document_links', 'document_attachments',
    'document_review_log', 'vehicle_services', 'machine_services',
    'machine_photos', 'inventory_photos'
  ]
  loop
    execute format('drop trigger if exists esblu_assign_company_id_before_insert on public.%I', table_name);
    execute format(
      'create trigger esblu_assign_company_id_before_insert before insert on public.%I for each row execute function public.esblu_assign_company_id()',
      table_name
    );
  end loop;
end
$insert_triggers$;

-- 5c. company_id je nemenný po vytvorení — na všetkých 12 tabuľkách.
do $lock_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_evidence', 'documents', 'document_links', 'document_attachments',
    'document_review_log', 'vehicles', 'vehicle_services', 'machines',
    'machine_services', 'machine_photos', 'inventory_items', 'inventory_photos'
  ]
  loop
    execute format('drop trigger if exists esblu_lock_company_id_before_update on public.%I', table_name);
    execute format(
      'create trigger esblu_lock_company_id_before_update before update on public.%I for each row execute function public.esblu_lock_company_id_on_update()',
      table_name
    );
  end loop;
end
$lock_triggers$;


-- -----------------------------------------------------------------------------
-- 6. Zrušenie starých user_id-based RLS policies
-- -----------------------------------------------------------------------------

drop policy if exists "Users can manage own ai evidence" on public.ai_evidence;
drop policy if exists "Users can manage own vehicles" on public.vehicles;
drop policy if exists "Users can manage own vehicle services" on public.vehicle_services;
drop policy if exists "Users can manage own machines" on public.machines;
drop policy if exists "Users can manage own machine services" on public.machine_services;
drop policy if exists "Users can manage own machine photos" on public.machine_photos;
drop policy if exists "Users can manage own inventory items" on public.inventory_items;

drop policy if exists documents_select_own on public.documents;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;
drop policy if exists documents_delete_own on public.documents;

drop policy if exists document_links_select_own on public.document_links;
drop policy if exists document_links_insert_own on public.document_links;
drop policy if exists document_links_update_own on public.document_links;
drop policy if exists document_links_delete_own on public.document_links;

drop policy if exists document_attachments_select_own on public.document_attachments;
drop policy if exists document_attachments_insert_own on public.document_attachments;
drop policy if exists document_attachments_update_own on public.document_attachments;
drop policy if exists document_attachments_delete_own on public.document_attachments;

drop policy if exists document_review_log_select_own on public.document_review_log;
drop policy if exists document_review_log_insert_own on public.document_review_log;

-- inventory_photos: pôvodné 3 policy vznikli mimo verziovaných migrácií,
-- presné mená nie sú známe (pozri docs/db/schema-baseline-2026-08-12.md §5).
-- Dynamicky nájdeme a zrušíme každú policy na public.inventory_photos, ktorá
-- odkazuje na user_id, rovnaký vzor ako v
-- 20260814140000_harden_legacy_storage_buckets.sql.
do $drop_inventory_photos$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inventory_photos'
      and (
        coalesce(qual, '') ilike '%user_id%'
        or coalesce(with_check, '') ilike '%user_id%'
      )
  loop
    execute format('drop policy if exists %I on public.inventory_photos', pol.policyname);
    raise notice 'COMPANY_RLS_MIGRATION: zrušená pôvodná policy % (inventory_photos)', pol.policyname;
  end loop;
end
$drop_inventory_photos$;


-- -----------------------------------------------------------------------------
-- 7. Nové company-based RLS policies
-- -----------------------------------------------------------------------------

-- 7a. Plný prístup (owner/admin/employee): machines, machine_services,
--     machine_photos, inventory_items, inventory_photos.
do $full_access_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'machines', 'machine_services', 'machine_photos',
    'inventory_items', 'inventory_photos'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (company_id = public.esblu_my_active_company_id())',
      table_name || '_select_company', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (company_id = public.esblu_my_active_company_id())',
      table_name || '_insert_company', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (company_id = public.esblu_my_active_company_id()) with check (company_id = public.esblu_my_active_company_id())',
      table_name || '_update_company', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (company_id = public.esblu_my_active_company_id())',
      table_name || '_delete_company', table_name
    );
  end loop;
end
$full_access_policies$;

-- 7b. vehicles — SELECT pre všetky role, INSERT/UPDATE/DELETE iba owner/admin.
create policy vehicles_select_company
  on public.vehicles
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy vehicles_insert_owner_admin
  on public.vehicles
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

create policy vehicles_update_owner_admin
  on public.vehicles
  for update
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  )
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

create policy vehicles_delete_owner_admin
  on public.vehicles
  for delete
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

-- 7c. vehicle_services — SELECT/INSERT/UPDATE pre všetky role, DELETE iba
--     owner/admin (zadanie explicitne povoľuje employee iba "pridávať/
--     upravovať", nie mazať).
create policy vehicle_services_select_company
  on public.vehicle_services
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy vehicle_services_insert_company
  on public.vehicle_services
  for insert
  to authenticated
  with check (company_id = public.esblu_my_active_company_id());

create policy vehicle_services_update_company
  on public.vehicle_services
  for update
  to authenticated
  using (company_id = public.esblu_my_active_company_id())
  with check (company_id = public.esblu_my_active_company_id());

create policy vehicle_services_delete_owner_admin
  on public.vehicle_services
  for delete
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

-- 7d. ai_evidence — SELECT/INSERT pre všetky role, UPDATE/DELETE iba
--     owner/admin (employee smie vytvoriť dokument, nesmie upraviť/zmazať už
--     uložený).
create policy ai_evidence_select_company
  on public.ai_evidence
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy ai_evidence_insert_company
  on public.ai_evidence
  for insert
  to authenticated
  with check (company_id = public.esblu_my_active_company_id());

create policy ai_evidence_update_owner_admin
  on public.ai_evidence
  for update
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  )
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

create policy ai_evidence_delete_owner_admin
  on public.ai_evidence
  for delete
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

-- 7e. documents — rovnaký vzor ako ai_evidence.
create policy documents_select_company
  on public.documents
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy documents_insert_company
  on public.documents
  for insert
  to authenticated
  with check (company_id = public.esblu_my_active_company_id());

create policy documents_update_owner_admin
  on public.documents
  for update
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  )
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

create policy documents_delete_owner_admin
  on public.documents
  for delete
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

-- 7f. document_attachments — SELECT/INSERT pre všetky role (príloha sa smie
--     pridať aj zamestnancom v rámci ukladacieho flow), UPDATE/DELETE iba
--     owner/admin. INSERT navyše overuje, že nadradený dokument patrí do tej
--     istej firmy (nahrádza pôvodnú kontrolu d.user_id = auth.uid()).
create policy document_attachments_select_company
  on public.document_attachments
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy document_attachments_insert_company
  on public.document_attachments
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and exists (
      select 1
      from public.documents d
      where d.id = document_attachments.document_id
        and d.company_id = public.esblu_my_active_company_id()
        and d.deleted_at is null
    )
  );

create policy document_attachments_update_owner_admin
  on public.document_attachments
  for update
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  )
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
    and exists (
      select 1
      from public.documents d
      where d.id = document_attachments.document_id
        and d.company_id = public.esblu_my_active_company_id()
    )
  );

create policy document_attachments_delete_owner_admin
  on public.document_attachments
  for delete
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

-- 7g. document_links — SELECT/INSERT pre všetky role, UPDATE/DELETE iba
--     owner/admin. INSERT/UPDATE naďalej overuje presne-jedna-entita pravidlo
--     (vynútené aj CHECK constraintom na tabuľke) AJ to, že nadradený
--     dokument aj cieľová entita patria do tej istej firmy ako volajúci —
--     nahrádza pôvodné user_id porovnania company_id porovnaniami.
create policy document_links_select_company
  on public.document_links
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy document_links_insert_company
  on public.document_links
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and exists (
      select 1
      from public.documents d
      where d.id = document_links.document_id
        and d.company_id = public.esblu_my_active_company_id()
        and d.deleted_at is null
    )
    and (
      (
        vehicle_id is not null
        and exists (
          select 1
          from public.vehicles v
          where v.id = document_links.vehicle_id
            and v.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        machine_id is not null
        and exists (
          select 1
          from public.machines m
          where m.id = document_links.machine_id
            and m.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        inventory_item_id is not null
        and exists (
          select 1
          from public.inventory_items i
          where i.id = document_links.inventory_item_id
            and i.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        vehicle_service_id is not null
        and exists (
          select 1
          from public.vehicle_services vs
          where vs.id = document_links.vehicle_service_id
            and vs.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        machine_service_id is not null
        and exists (
          select 1
          from public.machine_services ms
          where ms.id = document_links.machine_service_id
            and ms.company_id = public.esblu_my_active_company_id()
        )
      )
    )
  );

create policy document_links_update_owner_admin
  on public.document_links
  for update
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  )
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
    and exists (
      select 1
      from public.documents d
      where d.id = document_links.document_id
        and d.company_id = public.esblu_my_active_company_id()
        and d.deleted_at is null
    )
    and (
      (
        vehicle_id is not null
        and exists (
          select 1 from public.vehicles v
          where v.id = document_links.vehicle_id
            and v.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        machine_id is not null
        and exists (
          select 1 from public.machines m
          where m.id = document_links.machine_id
            and m.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        inventory_item_id is not null
        and exists (
          select 1 from public.inventory_items i
          where i.id = document_links.inventory_item_id
            and i.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        vehicle_service_id is not null
        and exists (
          select 1 from public.vehicle_services vs
          where vs.id = document_links.vehicle_service_id
            and vs.company_id = public.esblu_my_active_company_id()
        )
      )
      or (
        machine_service_id is not null
        and exists (
          select 1 from public.machine_services ms
          where ms.id = document_links.machine_service_id
            and ms.company_id = public.esblu_my_active_company_id()
        )
      )
    )
  );

create policy document_links_delete_owner_admin
  on public.document_links
  for delete
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
  );

-- 7h. document_review_log — SELECT/INSERT pre všetky role (nezmenené,
--     zámerne žiadny UPDATE/DELETE pre nikoho — append-only). INSERT
--     nahrádza d.user_id = auth.uid() za d.company_id kontrolu.
create policy document_review_log_select_company
  on public.document_review_log
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy document_review_log_insert_company
  on public.document_review_log
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and document_id is not null
    and document_ref = document_id
    and exists (
      select 1
      from public.documents d
      where d.id = document_review_log.document_id
        and d.company_id = public.esblu_my_active_company_id()
    )
  );

commit;
