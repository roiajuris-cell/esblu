begin;

-- =============================================================================
-- Esblu 2.0 — AI Inbox core tables (documents, document_links, document_review_log)
-- =============================================================================
-- Táto migrácia je čisto ADITÍVNA:
--   - vytvára iba tri nové tabuľky (documents, document_links,
--     document_review_log), ich CHECK/UNIQUE/FK constrainty, indexy a RLS
--     policies,
--   - NEMENÍ žiadnu existujúcu tabuľku, funkciu ani policy,
--   - FK z nových tabuliek na existujúce tabuľky (vehicles, machines,
--     inventory_items, vehicle_services, machine_services, auth.users) iba
--     ODKAZUJÚ na existujúce tabuľky; nemenia ich vlastnú schému.
--
-- AI Inbox je zámerne paralelný k existujúcej AI Evidencii:
--   - ai_evidence, jej RLS, trigger ani Storage bucket
--     (ai-evidence-documents) sa touto migráciou vôbec nedotýkajú.
--   - Staré aj nové dáta môžu koexistovať bez akejkoľvek väzby medzi sebou.
--
-- Zámerne mimo rozsahu tejto migrácie (odložené na neskôr, vedomé rozhodnutie):
--   - Storage bucket pre AI Inbox dokumenty sa vytvorí neskôr samostatne,
--     mimo SQL migrácie (Supabase dashboard / Storage API).
--   - Plan limit pre `documents` sa zatiaľ nepridáva — esblu_enforce_plan_limit()
--     a plan_limits sa touto migráciou nemenia. Nová tabuľka documents preto
--     zatiaľ nemá vynútený DB-level limit počtu záznamov.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. documents
-- -----------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  storage_bucket text not null,
  storage_path text not null,
  original_filename text null,
  mime_type text null,
  file_size bigint null,

  document_type text not null default 'other',
  status text not null default 'uploaded',

  ai_model text null,
  ai_raw_output jsonb null,
  extracted_fields jsonb null,
  field_confidence jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  deleted_at timestamptz null,

  constraint documents_document_type_check check (
    document_type in (
      'weigh_ticket',
      'delivery_note',
      'invoice',
      'receipt',
      'service_document',
      'other'
    )
  ),
  constraint documents_status_check check (
    status in (
      'uploaded',
      'processing',
      'extracted',
      'needs_review',
      'confirmed',
      'failed'
    )
  ),
  constraint documents_file_size_check check (
    file_size is null or file_size >= 0
  ),
  constraint documents_storage_location_unique unique (storage_bucket, storage_path)
);

create index documents_user_id_idx
  on public.documents (user_id);

create index documents_user_status_idx
  on public.documents (user_id, status);

create index documents_user_document_type_idx
  on public.documents (user_id, document_type);

-- Partial index presne pre najčastejší dotaz ("moje aktívne dokumenty,
-- najnovšie prvé"); soft-deleted riadky (deleted_at is not null) sa doň
-- nezapočítavajú, takže ostáva malý a rýchly aj pri raste obsahu koša.
create index documents_user_active_created_idx
  on public.documents (user_id, created_at desc)
  where deleted_at is null;

alter table public.documents enable row level security;

create policy documents_select_own
  on public.documents
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy documents_insert_own
  on public.documents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy documents_update_own
  on public.documents
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy documents_delete_own
  on public.documents
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Zámerne žiadny deleted_at filter v SELECT policy — kôš vs. aktívne
-- dokumenty sa filtruje v query vrstve appky, nie v RLS.


-- -----------------------------------------------------------------------------
-- 2. document_links
-- -----------------------------------------------------------------------------

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,

  -- Reálne FK na presne jednu cieľovú entitu (nie polymorfný entity_type +
  -- entity_id) — umožňuje natívnu referenčnú integritu a automatický cleanup
  -- cez ON DELETE CASCADE pri zmazaní vozidla/stroja/položky/servisu, bez
  -- potreby akéhokoľvek triggeru na existujúcich tabuľkách.
  vehicle_id uuid null references public.vehicles(id) on delete cascade,
  machine_id uuid null references public.machines(id) on delete cascade,
  inventory_item_id uuid null references public.inventory_items(id) on delete cascade,
  vehicle_service_id uuid null references public.vehicle_services(id) on delete cascade,
  machine_service_id uuid null references public.machine_services(id) on delete cascade,

  link_type text not null default 'related',
  confidence numeric null,
  confirmed_by_user boolean not null default false,
  created_at timestamptz not null default now(),

  constraint document_links_link_type_check check (
    link_type in ('primary', 'related', 'cost')
  ),
  constraint document_links_confidence_check check (
    confidence is null or confidence between 0 and 1
  ),
  constraint document_links_exactly_one_entity_check check (
    num_nonnulls(
      vehicle_id,
      machine_id,
      inventory_item_id,
      vehicle_service_id,
      machine_service_id
    ) = 1
  )
);

create index document_links_document_id_idx
  on public.document_links (document_id);

create index document_links_user_id_idx
  on public.document_links (user_id);

-- Partial unique indexy proti duplicitným linkom. Obyčajný zložený UNIQUE
-- constraint by tu nefungoval správne: NULL sa v UNIQUE nikdy nepovažuje za
-- rovný inému NULL, a keďže 4 z 5 entity stĺpcov sú vždy NULL, bežný zložený
-- UNIQUE by duplicity nikdy nezachytil. Partial index (WHERE ... IS NOT NULL)
-- rieši presne tento problém, po jednom per entity stĺpec.
create unique index document_links_unique_vehicle
  on public.document_links (document_id, link_type, vehicle_id)
  where vehicle_id is not null;

create unique index document_links_unique_machine
  on public.document_links (document_id, link_type, machine_id)
  where machine_id is not null;

create unique index document_links_unique_inventory_item
  on public.document_links (document_id, link_type, inventory_item_id)
  where inventory_item_id is not null;

create unique index document_links_unique_vehicle_service
  on public.document_links (document_id, link_type, vehicle_service_id)
  where vehicle_service_id is not null;

create unique index document_links_unique_machine_service
  on public.document_links (document_id, link_type, machine_service_id)
  where machine_service_id is not null;

-- Partial lookup indexy pre dotaz "všetky dokumenty pre túto entitu"
-- (napr. detail vozidla/stroja/položky).
create index document_links_vehicle_idx
  on public.document_links (vehicle_id)
  where vehicle_id is not null;

create index document_links_machine_idx
  on public.document_links (machine_id)
  where machine_id is not null;

create index document_links_inventory_item_idx
  on public.document_links (inventory_item_id)
  where inventory_item_id is not null;

create index document_links_vehicle_service_idx
  on public.document_links (vehicle_service_id)
  where vehicle_service_id is not null;

create index document_links_machine_service_idx
  on public.document_links (machine_service_id)
  where machine_service_id is not null;

alter table public.document_links enable row level security;

create policy document_links_select_own
  on public.document_links
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy document_links_insert_own
  on public.document_links
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.documents d
      where d.id = document_links.document_id
        and d.user_id = auth.uid()
        and d.deleted_at is null
    )
    and (
      (
        vehicle_id is not null
        and exists (
          select 1
          from public.vehicles v
          where v.id = document_links.vehicle_id
            and v.user_id = auth.uid()
        )
      )
      or (
        machine_id is not null
        and exists (
          select 1
          from public.machines m
          where m.id = document_links.machine_id
            and m.user_id = auth.uid()
        )
      )
      or (
        inventory_item_id is not null
        and exists (
          select 1
          from public.inventory_items i
          where i.id = document_links.inventory_item_id
            and i.user_id = auth.uid()
        )
      )
      or (
        vehicle_service_id is not null
        and exists (
          select 1
          from public.vehicle_services vs
          where vs.id = document_links.vehicle_service_id
            and vs.user_id = auth.uid()
        )
      )
      or (
        machine_service_id is not null
        and exists (
          select 1
          from public.machine_services ms
          where ms.id = document_links.machine_service_id
            and ms.user_id = auth.uid()
        )
      )
    )
  );

create policy document_links_update_own
  on public.document_links
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.documents d
      where d.id = document_links.document_id
        and d.user_id = auth.uid()
        and d.deleted_at is null
    )
    and (
      (
        vehicle_id is not null
        and exists (
          select 1
          from public.vehicles v
          where v.id = document_links.vehicle_id
            and v.user_id = auth.uid()
        )
      )
      or (
        machine_id is not null
        and exists (
          select 1
          from public.machines m
          where m.id = document_links.machine_id
            and m.user_id = auth.uid()
        )
      )
      or (
        inventory_item_id is not null
        and exists (
          select 1
          from public.inventory_items i
          where i.id = document_links.inventory_item_id
            and i.user_id = auth.uid()
        )
      )
      or (
        vehicle_service_id is not null
        and exists (
          select 1
          from public.vehicle_services vs
          where vs.id = document_links.vehicle_service_id
            and vs.user_id = auth.uid()
        )
      )
      or (
        machine_service_id is not null
        and exists (
          select 1
          from public.machine_services ms
          where ms.id = document_links.machine_service_id
            and ms.user_id = auth.uid()
        )
      )
    )
  );

create policy document_links_delete_own
  on public.document_links
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Poznámka: presne-jedna-entita pravidlo vynucuje
-- document_links_exactly_one_entity_check na úrovni tabuľky (platí pre každý
-- zápis, nezávisle od RLS/role), takže OR-vetvy v policies vyššie sa navzájom
-- vylučujú. FK garantuje iba existenciu cieľového riadku, nie vlastníctvo —
-- preto každá vetva navyše overuje user_id cieľovej entity, nielen jej
-- existenciu; vlastníctvo sa teda nikdy nespolieha iba na FK.


-- -----------------------------------------------------------------------------
-- 3. document_review_log
-- -----------------------------------------------------------------------------

create table public.document_review_log (
  id uuid primary key default gen_random_uuid(),

  -- document_id je zámerne ON DELETE SET NULL (nie CASCADE): pri budúcom
  -- hard delete dokumentu má audit log prežiť, nie zaniknúť spolu s ním.
  document_id uuid null references public.documents(id) on delete set null,

  -- document_ref ostáva stabilný identifikátor pôvodného dokumentu bez FK —
  -- zostáva zachovaný aj po tom, čo document_id po hard delete zanikne na
  -- NULL. Dopyty na históriu konkrétneho dokumentu majú používať document_ref,
  -- nie document_id.
  document_ref uuid not null,

  user_id uuid not null references auth.users(id) on delete cascade,

  action text not null,
  field_name text null,
  old_value jsonb null,
  new_value jsonb null,
  document_snapshot jsonb null,

  created_at timestamptz not null default now(),

  constraint document_review_log_action_check check (
    action in (
      'created',
      'field_edited',
      'confirmed',
      'linked',
      'unlinked',
      'soft_deleted',
      'restored',
      'hard_deleted'
    )
  )
);

create index document_review_log_ref_created_idx
  on public.document_review_log (document_ref, created_at);

create index document_review_log_user_id_idx
  on public.document_review_log (user_id);

alter table public.document_review_log enable row level security;

create policy document_review_log_select_own
  on public.document_review_log
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy document_review_log_insert_own
  on public.document_review_log
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and document_id is not null
    and document_ref = document_id
    and exists (
      select 1
      from public.documents d
      where d.id = document_review_log.document_id
        and d.user_id = auth.uid()
    )
  );

-- Zámerne žiadna UPDATE ani DELETE policy — z pohľadu klienta je log
-- append-only. (Pre budúcnosť, mimo tejto migrácie: skutočne tamper-proof
-- audit log by tieto riadky mal generovať trigger, nie priamy klientsky
-- insert — pozri docs/db/schema-baseline-2026-08-12.md.)

commit;
