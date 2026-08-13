begin;

-- =============================================================================
-- Esblu — poznámka k dokumentu + jednoduché prílohy dokumentu (PZP a pod.)
-- =============================================================================
-- Kontext: AI Evidencia/AI Inbox dostáva plnohodnotnú správu uložených
-- dokumentov (mazanie, poznámka pri bločku/faktúre, prílohy pri PZP,
-- zložky Bločky/Faktúry). Táto migrácia rieši iba databázovú časť —
-- poznámku a prílohy — nadväzuje na 20260812150000_add_ai_inbox_core_tables.sql
-- a 20260814090000_add_insurance_document_type.sql.
--
-- Táto migrácia je čisto ADITÍVNA:
--   - pridáva jeden nullable stĺpec `note` do existujúcej tabuľky
--     public.documents (žiadna existujúca hodnota sa nemení, default je NULL,
--     takže všetky existujúce riadky ostávajú bezo zmeny),
--   - vytvára iba jednu novú tabuľku public.document_attachments s vlastnými
--     FK/CHECK/UNIQUE constraintami, indexmi a RLS policies,
--   - NEMENÍ žiadnu existujúcu tabuľku okrem pridania jedného stĺpca,
--     NEMENÍ žiadnu existujúcu RLS policy, trigger ani funkciu,
--   - NEMENÍ ai_evidence, jej Storage bucket ani vážny lístok / dodací list
--     flow (ten zostáva nedotknutý).
--
-- document_attachments je zámerne jednoduchý model (nie všeobecný DMS):
--   - každá príloha patrí presne jednému dokumentu (document_id, FK ON DELETE
--     CASCADE — pri zmazaní nadradeného dokumentu appka najprv odstráni
--     súbory zo Storage a až potom zmaže riadok dokumentu; DB cascade potom
--     už iba domazáva prípadné zvyšné riadky príloh, aby v DB nikdy
--     neostali osirotené záznamy príloh bez nadradeného dokumentu),
--   - attachment_type je uzavretý zoznam (biela karta / zelená karta /
--     záznam o poistnej udalosti / iné) — dostatočný pre PZP prílohy bez
--     potreby polymorfného typu prílohy,
--   - rovnaký Storage path/RLS vzor ako pri public.documents:
--     {user_id}/{document_id}/attachments/{generated_filename}, bucket
--     ai-inbox-documents (žiadny nový bucket, žiadna zmena bucket policy —
--     existujúce ai_inbox_documents_* policies na storage.objects už
--     pokrývajú akúkoľvek cestu v priečinku vlastného user_id).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. documents.note
-- -----------------------------------------------------------------------------

alter table public.documents
  add column if not exists note text null;

comment on column public.documents.note is
  'Voliteľná poznámka používateľa k dokumentu (typicky bloček/faktúra). Vypĺňa sa pred uložením, zobrazuje sa v detaile a je súčasťou dátového exportu.';


-- -----------------------------------------------------------------------------
-- 2. document_attachments
-- -----------------------------------------------------------------------------

create table public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,

  storage_bucket text not null default 'ai-inbox-documents',
  storage_path text not null,
  original_filename text null,
  mime_type text null,
  file_size bigint null,

  attachment_type text not null default 'other',

  created_at timestamptz not null default now(),

  constraint document_attachments_attachment_type_check check (
    attachment_type in (
      'white_card',
      'green_card',
      'insurance_event',
      'other'
    )
  ),
  constraint document_attachments_file_size_check check (
    file_size is null or file_size >= 0
  ),
  constraint document_attachments_storage_location_unique unique (storage_bucket, storage_path)
);

create index document_attachments_document_id_idx
  on public.document_attachments (document_id);

create index document_attachments_user_id_idx
  on public.document_attachments (user_id);

alter table public.document_attachments enable row level security;

create policy document_attachments_select_own
  on public.document_attachments
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy document_attachments_insert_own
  on public.document_attachments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.documents d
      where d.id = document_attachments.document_id
        and d.user_id = auth.uid()
        and d.deleted_at is null
    )
  );

create policy document_attachments_update_own
  on public.document_attachments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.documents d
      where d.id = document_attachments.document_id
        and d.user_id = auth.uid()
    )
  );

create policy document_attachments_delete_own
  on public.document_attachments
  for delete
  to authenticated
  using (auth.uid() = user_id);

commit;
