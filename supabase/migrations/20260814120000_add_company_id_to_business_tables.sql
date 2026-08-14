begin;

-- =============================================================================
-- Esblu — company_id základ v business tabuľkách (fáza 2: dátová príprava)
-- =============================================================================
-- Nadväzuje na 20260814110000_add_companies_and_company_members.sql (aplikovaná
-- do produkcie, overené: settings users = companies = active owner
-- memberships — každý dnešný používateľ má presne 1 company, presne 1
-- company_members riadok role='owner' status='active').
--
-- Cieľ tejto migrácie: pridať `company_id` ako DRUHÚ, paralelnú ownership
-- informáciu popri `user_id` do business tabuliek, a bezpečne ju backfillnúť
-- pre existujúce dáta. NIČ VIAC.
--
-- Kritická zásada: po tejto migrácii sa aplikácia musí správať úplne rovnako
-- ako dnes. Preto táto migrácia:
--   - NEMENÍ žiadnu existujúcu business RLS policy — `auth.uid() = user_id`
--     zostáva jedinou reálnou security hranicou pre všetky tabuľky nižšie,
--   - NEPRIDÁVA company_members-based RLS ani žiadny iný nový prístup,
--   - NEROBÍ `company_id` NOT NULL — dnešný frontend pri INSERTe posiela iba
--     `user_id`, o `company_id` nevie; keby bol NOT NULL bez DEFAULT, každý
--     nový INSERT z dnešnej appky by zlyhal,
--   - NEVYTVÁRA žiadny trigger, ktorý by `company_id` automaticky odvodzoval
--     z `user_id` pri INSERTe — budúci employee/admin nebude nutne owner,
--     aktívnu company budeme určovať explicitne v ďalšej fáze,
--   - NEMENÍ Storage (buckets, cesty, policies) ani žiadny `.tsx`/`.ts` súbor,
--   - NEODSTRAŇUJE ani nemení `user_id` na žiadnej tabuľke.
--
-- Rozsah — presne tých 12 tabuliek, ktoré audit identifikoval ako business
-- dáta vlastnené cez `user_id` (potvrdené aj krížovou kontrolou všetkých
-- `supabase.from("...")` volaní vo frontende — žiadna ďalšia business
-- tabuľka s ownershipom cez `user_id` nebola nájdená):
--   ai_evidence, documents, document_links, document_attachments,
--   document_review_log, vehicles, vehicle_services, machines,
--   machine_services, machine_photos, inventory_items, inventory_photos.
--
-- Vedome VYNECHANÉ: `settings` a `plan_limits`. `plan_limits` nemá
-- ownership vôbec (globálny číselník). `settings` je zámerne vynechaná —
-- bola už samotným ZDROJOM pre companies/company_members backfill v
-- predchádzajúcej migrácii (1 settings.user_id = 1 companies.owner_id), takže
-- pridávanie company_id do settings by bolo redundantné a mimo zadania tejto
-- úlohy (zadanie explicitne vymenúva presne tých 12 tabuliek vyššie).
--
-- Známy, NEOPRAVOVANÝ nález (mimo rozsahu tejto migrácie, iba zdokumentovaný):
-- `vehicles` stĺpce nie sú v docs/db/schema-baseline-2026-08-12.md kompletne
-- potvrdené (audit sa vtedy zastavil pri stĺpci `palivo`), takže nullable
-- stav `vehicles.user_id` nie je zo zdrojovej dokumentácie 100% istý. Táto
-- migrácia to nepotrebuje vedieť vopred — pre-flight/backfill/post-flight
-- nižšie fungujú bezpečne bez ohľadu na to, či je `vehicles.user_id`
-- nullable alebo NOT NULL.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. company_id stĺpec + FK + index na všetkých 12 tabuľkách
-- -----------------------------------------------------------------------------
-- Každý stĺpec: `uuid null references public.companies(id) on delete
-- restrict`. NULL zámerne (bod 3 zadania — dnešný frontend company_id
-- neposiela, INSERT nesmie zlyhať). ON DELETE RESTRICT zámerne namiesto
-- CASCADE (bod 4 zadania) — firma je (budúci) nadradený tenant pre všetky
-- tieto dáta a nesmie sa dať omylom zmazať spolu s cascade zlikvidovaním
-- dokumentov/vozidiel/strojov/skladu; zmazanie company so zvyšnými business
-- riadkami DB odmietne (foreign key violation), kým sa dáta explicitne
-- nepreradia alebo nezmažú. Index je partial (`where company_id is not
-- null`) — rovnaký vzor ako existujúce partial indexy v projekte
-- (napr. ai_evidence_machine_id_idx, document_links_vehicle_idx), keďže
-- veľká časť riadkov bude mať company_id NULL až do ďalšej fázy.

alter table public.ai_evidence
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists ai_evidence_company_id_idx
  on public.ai_evidence (company_id)
  where company_id is not null;

alter table public.documents
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists documents_company_id_idx
  on public.documents (company_id)
  where company_id is not null;

alter table public.document_links
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists document_links_company_id_idx
  on public.document_links (company_id)
  where company_id is not null;

alter table public.document_attachments
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists document_attachments_company_id_idx
  on public.document_attachments (company_id)
  where company_id is not null;

alter table public.document_review_log
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists document_review_log_company_id_idx
  on public.document_review_log (company_id)
  where company_id is not null;

alter table public.vehicles
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists vehicles_company_id_idx
  on public.vehicles (company_id)
  where company_id is not null;

alter table public.vehicle_services
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists vehicle_services_company_id_idx
  on public.vehicle_services (company_id)
  where company_id is not null;

alter table public.machines
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists machines_company_id_idx
  on public.machines (company_id)
  where company_id is not null;

alter table public.machine_services
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists machine_services_company_id_idx
  on public.machine_services (company_id)
  where company_id is not null;

alter table public.machine_photos
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists machine_photos_company_id_idx
  on public.machine_photos (company_id)
  where company_id is not null;

alter table public.inventory_items
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists inventory_items_company_id_idx
  on public.inventory_items (company_id)
  where company_id is not null;

alter table public.inventory_photos
  add column if not exists company_id uuid null references public.companies(id) on delete restrict;
create index if not exists inventory_photos_company_id_idx
  on public.inventory_photos (company_id)
  where company_id is not null;


-- -----------------------------------------------------------------------------
-- 2. Pre-flight — osirelé business user_id (bez zodpovedajúceho auth.users)
-- -----------------------------------------------------------------------------
-- Pre každú z 12 tabuliek: existuje NENULOVÝ user_id, ktorý nemá zodpoveda-
-- júci riadok v auth.users? Niektoré z týchto stĺpcov majú dnes reálny FK na
-- auth.users (documents, document_links, document_attachments,
-- document_review_log, inventory_photos — orphan tu nie je ani teoreticky
-- možný), iné nemajú žiadny FK na auth.users vôbec (ai_evidence, vehicles,
-- vehicle_services, machines, machine_services, machine_photos,
-- inventory_items — potvrdené v docs/db/schema-baseline-2026-08-12.md).
-- Kontrola beží nad všetkými 12 rovnako, defenzívne. Nič sa nevynecháva ani
-- nepriraďuje inému userovi — pri náleze migrácia explicitne zlyhá.

do $preflight_orphans$
declare
  table_name text;
  orphan_count bigint;
  orphan_ids text;
begin
  foreach table_name in array array[
    'ai_evidence', 'documents', 'document_links', 'document_attachments',
    'document_review_log', 'vehicles', 'vehicle_services', 'machines',
    'machine_services', 'machine_photos', 'inventory_items', 'inventory_photos'
  ]
  loop
    execute format(
      $q$
        select count(*), string_agg(x.user_id::text, ', ' order by x.user_id::text)
        from (
          select distinct t.user_id
          from public.%I t
          where t.user_id is not null
            and not exists (select 1 from auth.users u where u.id = t.user_id)
        ) x
      $q$,
      table_name
    ) into orphan_count, orphan_ids;

    if orphan_count > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'COMPANY_ID_BACKFILL_ORPHANED_USER_ID:' || table_name || ':' || coalesce(orphan_ids, ''),
        hint = format('%I obsahuje user_id, ktorý neexistuje v auth.users. Preveruj ručne pred spustením tejto migrácie — nič sa nevynecháva ani nepriraďuje automaticky.', table_name);
    end if;
  end loop;
end
$preflight_orphans$;


-- -----------------------------------------------------------------------------
-- 3. Pre-flight — jednoznačné company mapovanie pre každý business user_id
-- -----------------------------------------------------------------------------
-- Pre KAŽDÝ nenulový user_id vyskytujúci sa v ktorejkoľvek z 12 tabuliek:
-- musí existovať PRESNE JEDEN company_members riadok s role='owner' a
-- status='active'. `company neexistuje` nie je samostatná kontrola — je to
-- štrukturálne nemožné, keďže company_members.company_id má reálny FK na
-- companies(id) (viď 20260814110000), takže mapovanie na neexistujúcu
-- company nemôže v DB vzniknúť.

do $preflight_mapping$
declare
  missing_count bigint;
  missing_ids text;
  ambiguous_count bigint;
  ambiguous_ids text;
begin
  -- 3a. Chýbajúci membership.
  with business_user_ids as (
    select distinct user_id from public.ai_evidence where user_id is not null
    union
    select distinct user_id from public.documents where user_id is not null
    union
    select distinct user_id from public.document_links where user_id is not null
    union
    select distinct user_id from public.document_attachments where user_id is not null
    union
    select distinct user_id from public.document_review_log where user_id is not null
    union
    select distinct user_id from public.vehicles where user_id is not null
    union
    select distinct user_id from public.vehicle_services where user_id is not null
    union
    select distinct user_id from public.machines where user_id is not null
    union
    select distinct user_id from public.machine_services where user_id is not null
    union
    select distinct user_id from public.machine_photos where user_id is not null
    union
    select distinct user_id from public.inventory_items where user_id is not null
    union
    select distinct user_id from public.inventory_photos where user_id is not null
  )
  select count(*), string_agg(b.user_id::text, ', ' order by b.user_id::text)
  into missing_count, missing_ids
  from business_user_ids b
  where not exists (
    select 1
    from public.company_members m
    where m.user_id = b.user_id
      and m.role = 'owner'
      and m.status = 'active'
  );

  if missing_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_MISSING_OWNER_MEMBERSHIP:' || coalesce(missing_ids, ''),
      hint = 'Tieto user_id sa vyskytujú v business dátach, ale nemajú žiadny aktívny owner company_members riadok. Preveruj ručne pred spustením tejto migrácie.';
  end if;

  -- 3b. Nejednoznačný (viacnásobný) membership.
  with business_user_ids as (
    select distinct user_id from public.ai_evidence where user_id is not null
    union
    select distinct user_id from public.documents where user_id is not null
    union
    select distinct user_id from public.document_links where user_id is not null
    union
    select distinct user_id from public.document_attachments where user_id is not null
    union
    select distinct user_id from public.document_review_log where user_id is not null
    union
    select distinct user_id from public.vehicles where user_id is not null
    union
    select distinct user_id from public.vehicle_services where user_id is not null
    union
    select distinct user_id from public.machines where user_id is not null
    union
    select distinct user_id from public.machine_services where user_id is not null
    union
    select distinct user_id from public.machine_photos where user_id is not null
    union
    select distinct user_id from public.inventory_items where user_id is not null
    union
    select distinct user_id from public.inventory_photos where user_id is not null
  )
  select count(*), string_agg(b.user_id::text, ', ' order by b.user_id::text)
  into ambiguous_count, ambiguous_ids
  from business_user_ids b
  where (
    select count(*)
    from public.company_members m
    where m.user_id = b.user_id
      and m.role = 'owner'
      and m.status = 'active'
  ) > 1;

  if ambiguous_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_AMBIGUOUS_OWNER_MEMBERSHIP:' || coalesce(ambiguous_ids, ''),
      hint = 'Tieto user_id majú viac než jeden aktívny owner company_members riadok. Preveruj ručne pred spustením tejto migrácie.';
  end if;
end
$preflight_mapping$;


-- -----------------------------------------------------------------------------
-- 4. Backfill — company_id z company_members podľa VLASTNÉHO user_id tabuľky
-- -----------------------------------------------------------------------------
-- Rovnaký mechanizmus na všetkých 12 tabuľkách: company_id = company_id
-- toho company_members riadku, kde m.user_id = t.user_id, role='owner',
-- status='active'. Pre-flight vyššie (2, 3) už zaručil, že toto mapovanie je
-- pre každý relevantný user_id jednoznačné a bezpečné — preto je táto
-- UPDATE deterministická. `t.company_id is null` robí backfill idempotentným
-- (bezpečne opakovateľné spustenie by nič nezmenilo na už vyplnených
-- riadkoch). Riadky s `user_id is null` sa zámerne nedotýkajú — company_id
-- pre ne nie je možné jednoznačne odvodiť (pozri sekciu 5, informational
-- report, nie chyba).

do $backfill_company_id$
declare
  table_name text;
  updated_count bigint;
begin
  foreach table_name in array array[
    'ai_evidence', 'documents', 'document_links', 'document_attachments',
    'document_review_log', 'vehicles', 'vehicle_services', 'machines',
    'machine_services', 'machine_photos', 'inventory_items', 'inventory_photos'
  ]
  loop
    execute format(
      $q$
        update public.%I as t
        set company_id = m.company_id
        from public.company_members m
        where m.user_id = t.user_id
          and m.role = 'owner'
          and m.status = 'active'
          and t.user_id is not null
          and t.company_id is null
      $q$,
      table_name
    );

    get diagnostics updated_count = row_count;
    raise notice 'company_id backfill: % -> % riadkov aktualizovaných.', table_name, updated_count;
  end loop;
end
$backfill_company_id$;


-- -----------------------------------------------------------------------------
-- 5. Post-flight — úplnosť backfillu + NULL user_id report
-- -----------------------------------------------------------------------------
-- "Existing rows": pre každú tabuľku musí platiť, že NEEXISTUJE riadok s
-- vyplneným user_id a NULL company_id po backfille — ak pre-flight (2, 3)
-- prešiel, toto je vždy 0; nenulová hodnota by znamenala chybu v backfill
-- logike vyššie, nie problém v dátach — fail-closed namiesto tichého
-- ponechania medzery. Samostatne (informational, nie chyba): koľko riadkov
-- má NULL user_id — tie boli nedosiahnuteľné cez dnešnú RLS (auth.uid() =
-- user_id) už pred touto migráciou a company_id pre ne ostáva NULL, čo je
-- očakávané a bezpečné (company_id je nullable).

do $postflight_completeness$
declare
  table_name text;
  incomplete_count bigint;
  null_user_count bigint;
begin
  foreach table_name in array array[
    'ai_evidence', 'documents', 'document_links', 'document_attachments',
    'document_review_log', 'vehicles', 'vehicle_services', 'machines',
    'machine_services', 'machine_photos', 'inventory_items', 'inventory_photos'
  ]
  loop
    execute format(
      'select count(*) from public.%I where user_id is not null and company_id is null',
      table_name
    ) into incomplete_count;

    if incomplete_count > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'COMPANY_ID_BACKFILL_INCOMPLETE:' || table_name || ':' || incomplete_count::text,
        hint = 'Existujúci riadok s vyplneným user_id ostal po backfille bez company_id. Po úspešnom pre-flighte by toto nemalo nastať — zastav sa a preveruj ručne pred ďalším pokusom.';
    end if;

    execute format(
      'select count(*) from public.%I where user_id is null',
      table_name
    ) into null_user_count;

    if null_user_count > 0 then
      raise notice '%: % riadkov s NULL user_id ostáva bez company_id (pred-existujúci stav, nesúvisí s touto migráciou, company_id je nullable).',
        table_name, null_user_count;
    end if;
  end loop;
end
$postflight_completeness$;


-- -----------------------------------------------------------------------------
-- 6. Post-flight — parent/child company_id konzistencia
-- -----------------------------------------------------------------------------
-- Pre child tabuľky s neformálnym alebo reálnym vzťahom na parent entitu:
-- child.company_id musí sedieť s parent.company_id VŠADE, kde sa parent dá
-- vôbec nájsť. Skutočný nesúlad (obe strany existujú, company_id sa líši) =
-- RAISE EXCEPTION, celá migrácia sa vráti späť — presne podľa zadania.
--
-- Osobitne riešené "visiace" referencie (parent sa vôbec nenájde): pri
-- vehicle_services.vehicle_id, machine_services.machine_id,
-- machine_photos.machine_id a ai_evidence.vehicle_id NEEXISTUJE dnes v DB
-- reálny FK na vehicles/machines (potvrdené v docs/db/schema-baseline) — ide
-- teda o PRED-EXISTUJÚCI, touto migráciou nespôsobený integritný nález.
-- Napriek tomu je aj toto FAIL-CLOSED, nie iba informačný nález: kým takýto
-- riadok nie je ručne skontrolovaný, nechceme ho ticho preniesť do
-- pripravovaného multi-tenant modelu. Migrácia preto pri každom náleze
-- vykoná RAISE EXCEPTION s jasným identifikátorom vzťahu, počtom a (ak je to
-- prakticky únosné) zoznamom ID dangling riadkov — nič sa pritom automaticky
-- nemaže, neopravuje ani nepriraďuje; iba sa to zastaví na ručnú kontrolu.

-- 6.1 ai_evidence vs vehicles (vehicle_id, FK v DB dnes neexistuje)
do $postflight_ai_evidence_vehicles$
declare
  mismatch_count bigint;
  mismatch_ids text;
  dangling_count bigint;
  dangling_ids text;
begin
  with joined as (
    select ae.id, ae.company_id as child_company_id, v.company_id as parent_company_id
    from public.ai_evidence ae
    join public.vehicles v on v.id = ae.vehicle_id
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from joined
  where child_company_id is distinct from parent_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_PARENT_CHILD_MISMATCH:ai_evidence_vs_vehicles:' || coalesce(mismatch_ids, ''),
      hint = 'ai_evidence.company_id nesedí s company_id priradeného vehicles riadku (cez vehicle_id). Preveruj ručne, nevyberaj hodnotu automaticky.';
  end if;

  select count(*), string_agg(ae.id::text, ', ' order by ae.id::text)
  into dangling_count, dangling_ids
  from public.ai_evidence ae
  where ae.vehicle_id is not null
    and not exists (select 1 from public.vehicles v where v.id = ae.vehicle_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_DANGLING_PARENT_REFERENCE:ai_evidence_vehicle_id_vs_vehicles:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'ai_evidence obsahuje vehicle_id, ktorý v tabuľke vehicles neexistuje (pred-existujúci integritný nález, FK na vehicles.id dnes v DB chýba). Nič sa nemaže ani nepriraďuje automaticky — preveruj tieto riadky ručne pred ďalším pokusom o migráciu.';
  end if;
end
$postflight_ai_evidence_vehicles$;

-- 6.2 vehicle_services vs vehicles (vehicle_id, FK v DB dnes neexistuje)
do $postflight_vehicle_services_vehicles$
declare
  mismatch_count bigint;
  mismatch_ids text;
  dangling_count bigint;
  dangling_ids text;
begin
  with joined as (
    select vs.id, vs.company_id as child_company_id, v.company_id as parent_company_id
    from public.vehicle_services vs
    join public.vehicles v on v.id = vs.vehicle_id
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from joined
  where child_company_id is distinct from parent_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_PARENT_CHILD_MISMATCH:vehicle_services_vs_vehicles:' || coalesce(mismatch_ids, ''),
      hint = 'vehicle_services.company_id nesedí s company_id priradeného vehicles riadku (cez vehicle_id). Preveruj ručne, nevyberaj hodnotu automaticky.';
  end if;

  select count(*), string_agg(vs.id::text, ', ' order by vs.id::text)
  into dangling_count, dangling_ids
  from public.vehicle_services vs
  where vs.vehicle_id is not null
    and not exists (select 1 from public.vehicles v where v.id = vs.vehicle_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_DANGLING_PARENT_REFERENCE:vehicle_services_vehicle_id_vs_vehicles:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'vehicle_services obsahuje vehicle_id, ktorý v tabuľke vehicles neexistuje (pred-existujúci integritný nález, FK na vehicles.id dnes v DB chýba). Nič sa nemaže ani nepriraďuje automaticky — preveruj tieto riadky ručne pred ďalším pokusom o migráciu.';
  end if;
end
$postflight_vehicle_services_vehicles$;

-- 6.3 machine_services vs machines (machine_id, FK v DB dnes neexistuje)
do $postflight_machine_services_machines$
declare
  mismatch_count bigint;
  mismatch_ids text;
  dangling_count bigint;
  dangling_ids text;
begin
  with joined as (
    select ms.id, ms.company_id as child_company_id, m.company_id as parent_company_id
    from public.machine_services ms
    join public.machines m on m.id = ms.machine_id
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from joined
  where child_company_id is distinct from parent_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_PARENT_CHILD_MISMATCH:machine_services_vs_machines:' || coalesce(mismatch_ids, ''),
      hint = 'machine_services.company_id nesedí s company_id priradeného machines riadku (cez machine_id). Preveruj ručne, nevyberaj hodnotu automaticky.';
  end if;

  select count(*), string_agg(ms.id::text, ', ' order by ms.id::text)
  into dangling_count, dangling_ids
  from public.machine_services ms
  where ms.machine_id is not null
    and not exists (select 1 from public.machines m where m.id = ms.machine_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_DANGLING_PARENT_REFERENCE:machine_services_machine_id_vs_machines:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'machine_services obsahuje machine_id, ktorý v tabuľke machines neexistuje (pred-existujúci integritný nález, FK na machines.id dnes v DB chýba). Nič sa nemaže ani nepriraďuje automaticky — preveruj tieto riadky ručne pred ďalším pokusom o migráciu.';
  end if;
end
$postflight_machine_services_machines$;

-- 6.4 machine_photos vs machines (machine_id, FK v DB dnes neexistuje)
do $postflight_machine_photos_machines$
declare
  mismatch_count bigint;
  mismatch_ids text;
  dangling_count bigint;
  dangling_ids text;
begin
  with joined as (
    select mp.id, mp.company_id as child_company_id, m.company_id as parent_company_id
    from public.machine_photos mp
    join public.machines m on m.id = mp.machine_id
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from joined
  where child_company_id is distinct from parent_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_PARENT_CHILD_MISMATCH:machine_photos_vs_machines:' || coalesce(mismatch_ids, ''),
      hint = 'machine_photos.company_id nesedí s company_id priradeného machines riadku (cez machine_id). Preveruj ručne, nevyberaj hodnotu automaticky.';
  end if;

  select count(*), string_agg(mp.id::text, ', ' order by mp.id::text)
  into dangling_count, dangling_ids
  from public.machine_photos mp
  where mp.machine_id is not null
    and not exists (select 1 from public.machines m where m.id = mp.machine_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_DANGLING_PARENT_REFERENCE:machine_photos_machine_id_vs_machines:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'machine_photos obsahuje machine_id, ktorý v tabuľke machines neexistuje (pred-existujúci integritný nález, FK na machines.id dnes v DB chýba). Nič sa nemaže ani nepriraďuje automaticky — preveruj tieto riadky ručne pred ďalším pokusom o migráciu.';
  end if;
end
$postflight_machine_photos_machines$;

-- 6.5 inventory_photos vs inventory_items (inventory_item_id, reálny FK)
do $postflight_inventory_photos_items$
declare
  mismatch_count bigint;
  mismatch_ids text;
begin
  -- inventory_photos.inventory_item_id má reálny FK (ON DELETE CASCADE) na
  -- inventory_items.id — parent tu vždy existuje, INNER JOIN je bezpečný,
  -- žiadna "visiaca referencia" tu nie je možná.
  with joined as (
    select ip.id, ip.company_id as child_company_id, i.company_id as parent_company_id
    from public.inventory_photos ip
    join public.inventory_items i on i.id = ip.inventory_item_id
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from joined
  where child_company_id is distinct from parent_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_PARENT_CHILD_MISMATCH:inventory_photos_vs_inventory_items:' || coalesce(mismatch_ids, ''),
      hint = 'inventory_photos.company_id nesedí s company_id priradeného inventory_items riadku. Preveruj ručne, nevyberaj hodnotu automaticky.';
  end if;
end
$postflight_inventory_photos_items$;

-- 6.6 document_attachments vs documents (document_id, reálny FK)
do $postflight_document_attachments$
declare
  mismatch_count bigint;
  mismatch_ids text;
begin
  with joined as (
    select da.id, da.company_id as child_company_id, d.company_id as parent_company_id
    from public.document_attachments da
    join public.documents d on d.id = da.document_id
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from joined
  where child_company_id is distinct from parent_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_PARENT_CHILD_MISMATCH:document_attachments_vs_documents:' || coalesce(mismatch_ids, ''),
      hint = 'document_attachments.company_id nesedí s company_id nadradeného documents riadku. Preveruj ručne, nevyberaj hodnotu automaticky.';
  end if;
end
$postflight_document_attachments$;

-- 6.7 document_review_log vs documents (document_id, reálny FK, ale
-- nullable/ON DELETE SET NULL — porovnávame iba tam, kde document_id nie je
-- NULL; NULL document_id je legitímny budúci stav po hard delete, nie chyba)
do $postflight_document_review_log$
declare
  mismatch_count bigint;
  mismatch_ids text;
begin
  with joined as (
    select drl.id, drl.company_id as child_company_id, d.company_id as parent_company_id
    from public.document_review_log drl
    join public.documents d on d.id = drl.document_id
    where drl.document_id is not null
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from joined
  where child_company_id is distinct from parent_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_PARENT_CHILD_MISMATCH:document_review_log_vs_documents:' || coalesce(mismatch_ids, ''),
      hint = 'document_review_log.company_id nesedí s company_id nadradeného documents riadku. Preveruj ručne, nevyberaj hodnotu automaticky.';
  end if;
end
$postflight_document_review_log$;


-- -----------------------------------------------------------------------------
-- 7. Post-flight — document_links: dokument vs. cieľová entita (kritické)
-- -----------------------------------------------------------------------------
-- document_links.company_id musí byť zhodné SÚČASNE s:
--   1. company_id vlastniaceho dokumentu (cez document_id — reálny FK),
--   2. company_id cieľovej entity (presne jedno z vehicle_id / machine_id /
--      inventory_item_id / vehicle_service_id / machine_service_id — všetky
--      majú reálny FK na svoju tabuľku, exactly-one-entity check constraint
--      garantuje, že práve jedno je vyplnené, takže tu nie je možná žiadna
--      "visiaca referencia").
-- Ak dokument a cieľová entita skončia v rôznych companies (alebo hociktorá
-- z nich nesedí s company_id samotného linku), migrácia zlyhá — nevyrába sa
-- cross-company link.

do $postflight_document_links$
declare
  mismatch_count bigint;
  mismatch_ids text;
begin
  with target_company as (
    select
      dl.id,
      dl.company_id as link_company_id,
      d.company_id as document_company_id,
      coalesce(
        v.company_id,
        mc.company_id,
        i.company_id,
        vs.company_id,
        ms.company_id
      ) as target_company_id
    from public.document_links dl
    join public.documents d on d.id = dl.document_id
    left join public.vehicles v on v.id = dl.vehicle_id
    left join public.machines mc on mc.id = dl.machine_id
    left join public.inventory_items i on i.id = dl.inventory_item_id
    left join public.vehicle_services vs on vs.id = dl.vehicle_service_id
    left join public.machine_services ms on ms.id = dl.machine_service_id
  )
  select count(*), string_agg(id::text, ', ' order by id::text)
  into mismatch_count, mismatch_ids
  from target_company
  where link_company_id is distinct from document_company_id
     or link_company_id is distinct from target_company_id
     or document_company_id is distinct from target_company_id;

  if mismatch_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_ID_BACKFILL_DOCUMENT_LINKS_CROSS_COMPANY_MISMATCH:' || coalesce(mismatch_ids, ''),
      hint = 'document_links, jeho dokument a/alebo cieľová entita majú rôzny company_id. Nevytváraj cross-company link automaticky — preveruj ručne pred ďalším pokusom.';
  end if;
end
$postflight_document_links$;


commit;
