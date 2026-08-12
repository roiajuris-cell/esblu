begin;

-- =============================================================================
-- Esblu 2.0 — AI Inbox Storage bucket + policies
-- =============================================================================
-- Táto migrácia je čisto ADITÍVNA a nadväzuje na
-- 20260812150000_add_ai_inbox_core_tables.sql (tabuľky documents,
-- document_links, document_review_log):
--   - vytvára iba nový privátny Storage bucket `ai-inbox-documents` a jeho
--     4 RLS policies na storage.objects (SELECT/INSERT/UPDATE/DELETE),
--   - NEMENÍ prvú AI Inbox migráciu, žiadnu existujúcu tabuľku, funkciu ani
--     policy,
--   - NEMENÍ ai_evidence ani jej Storage bucket (ai-evidence-documents),
--   - NEMENÍ plan_limits ani esblu_enforce_plan_limit().
--
-- Vedomé rozhodnutie (zmena oproti predchádzajúcemu návrhu):
--   - plan_limits.documents, esblu_enforce_documents_plan_limit() a
--     akékoľvek plan-limit triggery na public.documents sa TERAZ
--     ZÁMERNE NEVYTVÁRAJÚ. Počet uložených dokumentov nie je vhodný proxy
--     údaj pre reálne náklady Esblu (AI náklad vzniká pri AI spracovaní,
--     nie pri existencii DB riadku; Storage náklad vzniká podľa veľkosti
--     súborov). Mesačné AI limity budú neskôr riešené samostatným
--     ai_usage mechanizmom; Storage náklady samostatne. Toto je jediný
--     rozsah tejto migrácie — nič plan-limit-ové sa tu nedotýka.
--
-- Storage path contract (dokumentačný komentár — appka sa touto migráciou
-- nemení, kód sa nevytvára):
--   {user_id}/{document_id}/{generated_filename}
--   - prvý priečinok cesty = auth.uid() prihláseného používateľa (text),
--   - druhý priečinok cesty = public.documents.id, ku ktorému súbor patrí,
--   - filename bude generovaný (napr. timestamp + random UUID), nie
--     pôvodný názov súboru nahraný používateľom,
--   - pôvodný názov súboru zostáva iba v public.documents.original_filename
--     (metadáta na zobrazenie v UI, nikdy súčasť Storage cesty),
--   - bucket je privátny (public = false); náhľad/download originálu iba
--     cez createSignedUrl, nikdy cez verejnú/public URL.
--
-- HEIC/HEIF poznámka:
--   HEIC/HEIF NIE JE v Phase 1 povolené (nie je v allowed_mime_types nižšie).
--   Budúca appka musí HEIC buď bezpečne skonvertovať na podporovaný formát
--   (JPEG/PNG/WebP) pred uploadom, alebo používateľovi zobraziť zrozumiteľnú
--   chybu, že HEIC zatiaľ nie je podporovaný.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Bucket ai-inbox-documents
-- -----------------------------------------------------------------------------

-- ON CONFLICT (id) DO NOTHING: ak by bucket s týmto id už z akéhokoľvek
-- dôvodu existoval, táto migrácia jeho konfiguráciu (public/file_size_limit/
-- allowed_mime_types) NEPREPÍŠE. Zmena existujúceho bucketu je zámerne mimo
-- rozsahu tejto migrácie — vyžadovala by samostatnú, explicitne odôvodnenú
-- migráciu s vlastným UPDATE.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ai-inbox-documents',
  'ai-inbox-documents',
  false,
  15728640, -- 15 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. storage.objects policies — iba pre bucket ai-inbox-documents
-- -----------------------------------------------------------------------------
-- Každá policy overuje bucket_id AJ vlastníctvo prvého priečinka cesty
-- (storage.foldername(name))[1] = auth.uid()::text — rovnako prísne na
-- SELECT/INSERT/UPDATE/DELETE, bez výnimky (na rozdiel od dnešných
-- machine-photos/company-logos, kde je INSERT/DELETE menej striktné).

create policy ai_inbox_documents_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ai-inbox-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy ai_inbox_documents_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ai-inbox-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- USING aj WITH CHECK sú zámerne identické: USING overuje, že objekt, ktorý
-- sa mení, je dnes vo vlastnom priečinku (zdroj); WITH CHECK overuje, že
-- výsledná cesta po zmene je stále vo vlastnom priečinku (cieľ). Bez WITH
-- CHECK by sa dal súbor jedným UPDATE premenovať/presunúť do cudzieho
-- user priečinka.
create policy ai_inbox_documents_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'ai-inbox-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'ai-inbox-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy ai_inbox_documents_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ai-inbox-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
