begin;

-- =============================================================================
-- Esblu — company-aware Storage policies (SELECT + DELETE), draft/finalized
-- rozlíšenie pre document/AI buckety, owner/admin-only company-logos
-- =============================================================================
-- Kontext: 20260814160000 urobila business tabuľky (documents, ai_evidence,
-- machine_photos, inventory_photos, ...) čitateľné celou firmou cez
-- company_id. Storage objekty samotné (fotky, originály dokumentov) ale
-- doteraz zostávajú prísne owner-scoped. Bez tejto migrácie by DB riadok
-- dokumentu/fotky bol pre celú firmu viditeľný, ale samotný súbor by vedel
-- načítať iba pôvodný nahrávateľ.
--
-- REVÍZIA (po ďalšom bezpečnostnom review, pred prvou aplikáciou):
--   Pôvodná verzia tejto migrácie dovoľovala DELETE pôvodnému nahrávateľovi
--   VŽDY, aj pre ai-inbox-documents/ai-evidence-documents. To by znamenalo,
--   že zamestnanec, ktorý dokument/fotku nahral, by mohol zmazať už
--   FINALIZOVANÝ (uložený) dokument iba preto, že je jeho nahrávateľ — v
--   rozpore s tým, že zamestnanec nesmie mazať/upravovať už uložené
--   dokumenty (business RLS v 20260814160000 mu to na úrovni DB riadku už
--   zakazuje, ale Storage vrstva to predtým nezrkadlila).
--
--   Overený existujúci frontend flow (app/ai-evidencia/page.tsx,
--   saveEvidence/saveOtherDocument/handleAttachmentUpload): upload do
--   Storage a zodpovedajúci INSERT do documents/document_attachments/
--   ai_evidence prebiehajú ATOMICKY v tej istej funkcii, jeden hneď po
--   druhom, s automatickým cleanupom osirotenej fotky, ak INSERT zlyhá.
--   Medzi AI extrakciou a finálnym uložením sa NIKDY nevolá Storage upload
--   ani žiadny UPDATE existujúceho riadku — korekcia AI polí prebieha
--   výhradne v React state (setResult/setOtherResult), objekt v Storage
--   dovtedy vôbec neexistuje. To znamená, že "draft" stav sa dá bezpečne a
--   presne definovať cez EXISTUJÚCI model, bez novej schémy/stĺpca:
--     DRAFT      = objekt v Storage, na ktorý sa v documents/
--                  document_attachments/ai_evidence (podľa storage_path/
--                  photo_url) EŠTE NEODKAZUJE žiadny riadok
--                  → zmazať smie iba pôvodný nahrávateľ (rieši presne ten
--                    prípad, kedy appka sama upratuje po zlyhanom INSERTe).
--     FINALIZOVANÝ = objekt, na ktorý JE odkaz z existujúceho riadku
--                  → zmazať smie iba aktívny owner/admin firmy, ktorej
--                    riadok patrí — nikdy iba "je to môj upload".
--
--   company-logos: pôvodná verzia dovoľovala INSERT/UPDATE/DELETE
--   ktorémukoľvek prihlásenému používateľovi do vlastného priečinka. Firemné
--   logo ale patrí pod "Nastavenia firmy", kam má podľa zadania zamestnanec
--   bez prístupu úplne — DB/Storage vrstva to teraz vynucuje nezávisle od
--   toho, že frontend tú sekciu zamestnancovi už skrýva. INSERT/UPDATE/
--   DELETE na company-logos teraz vyžadujú aktívnu rolu owner/admin,
--   UPDATE/DELETE navyše musia byť v tej istej firme ako pôvodný
--   nahrávateľ (cross-company ochrana).
--
--   machine-photos / inventory-photos: NEZMENENÉ oproti pôvodnej verzii —
--   zadanie explicitne vyžaduje zachovať zamestnancovi plný prístup (Stroje/
--   Sklad = plný prístup), takže "vlastný upload alebo owner/admin tej istej
--   firmy" ostáva správny model pre tieto 2 buckety.
--
-- Rozsah — SELECT a DELETE na 5 bucketoch (ai-inbox-documents,
-- ai-evidence-documents, machine-photos, inventory-photos, company-logos),
-- plus INSERT a UPDATE iba na company-logos (jediný bucket, kde sa mení aj
-- toto). Cesty súborov, public/private stav bucketov a MIME/size limity sa
-- nemenia.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Zrušenie starých policies
-- -----------------------------------------------------------------------------

-- Známe mená (verziované migrácie 20260812160000 / 20260814140000).
drop policy if exists ai_inbox_documents_select_own on storage.objects;
drop policy if exists ai_inbox_documents_delete_own on storage.objects;
drop policy if exists machine_photos_select_own on storage.objects;
drop policy if exists machine_photos_delete_own on storage.objects;
drop policy if exists company_logos_select_own on storage.objects;
drop policy if exists company_logos_insert_own on storage.objects;
drop policy if exists company_logos_update_own on storage.objects;
drop policy if exists company_logos_delete_own on storage.objects;

-- Táto migrácia sama seba prepisuje (bezpečné pred prvou aplikáciou) —
-- pre prípad, že by sa spustila opakovane počas vývoja, zruš aj vlastné,
-- už raz vytvorené company-aware policies pred ich znovu-vytvorením.
drop policy if exists ai_inbox_documents_select_company on storage.objects;
drop policy if exists ai_inbox_documents_delete_company on storage.objects;
drop policy if exists ai_evidence_documents_select_company on storage.objects;
drop policy if exists ai_evidence_documents_delete_company on storage.objects;
drop policy if exists machine_photos_select_company on storage.objects;
drop policy if exists machine_photos_delete_company on storage.objects;
drop policy if exists inventory_photos_select_company on storage.objects;
drop policy if exists inventory_photos_delete_company on storage.objects;
drop policy if exists company_logos_select_company on storage.objects;
drop policy if exists company_logos_insert_owner_admin on storage.objects;
drop policy if exists company_logos_update_owner_admin on storage.objects;
drop policy if exists company_logos_delete_owner_admin on storage.objects;

-- ai-evidence-documents a inventory-photos: SELECT/DELETE policies vznikli
-- mimo verziovaných migrácií (pozri docs/db/schema-baseline-2026-08-12.md
-- §8-9), presné mená nie sú známe. Dynamicky nájdeme a zrušíme iba SELECT a
-- DELETE policy pre tieto 2 buckety — INSERT/UPDATE necháme netknuté.
do $drop_unversioned$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('SELECT', 'DELETE')
      and (
        coalesce(qual, '') ilike '%ai-evidence-documents%'
        or coalesce(qual, '') ilike '%inventory-photos%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
    raise notice 'COMPANY_STORAGE_MIGRATION: zrušená pôvodná SELECT/DELETE policy %', pol.policyname;
  end loop;
end
$drop_unversioned$;


-- -----------------------------------------------------------------------------
-- 2. Nové company-aware SELECT policies (nezmenené oproti predošlej verzii)
-- -----------------------------------------------------------------------------

create policy ai_inbox_documents_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ai-inbox-documents'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );

create policy ai_evidence_documents_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ai-evidence-documents'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );

create policy machine_photos_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'machine-photos'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );

create policy inventory_photos_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'inventory-photos'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );

create policy company_logos_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );


-- -----------------------------------------------------------------------------
-- 3. DELETE — ai-inbox-documents a ai-evidence-documents: draft/finalized
-- -----------------------------------------------------------------------------

create policy ai_inbox_documents_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ai-inbox-documents'
    and (
      -- DRAFT: objekt ešte nie je referencovaný žiadnym uloženým
      -- dokumentom ani prílohou — zmazať smie iba pôvodný nahrávateľ
      -- (presne prípad, keď appka sama upratuje po zlyhanom INSERTe).
      (
        (storage.foldername(name))[1] = auth.uid()::text
        and not exists (
          select 1 from public.documents d
          where d.storage_bucket = 'ai-inbox-documents'
            and d.storage_path = name
        )
        and not exists (
          select 1 from public.document_attachments da
          where da.storage_bucket = 'ai-inbox-documents'
            and da.storage_path = name
        )
      )
      -- FINALIZOVANÝ: objekt je referencovaný uloženým dokumentom — zmazať
      -- smie iba aktívny owner/admin firmy, ktorej dokument patrí (nikdy
      -- iba preto, že je niekto pôvodný nahrávateľ).
      or exists (
        select 1
        from public.documents d
        join public.company_members cm
          on cm.company_id = d.company_id
          and cm.status = 'active'
          and cm.role in ('owner', 'admin')
        where d.storage_bucket = 'ai-inbox-documents'
          and d.storage_path = name
          and cm.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.document_attachments da
        join public.company_members cm
          on cm.company_id = da.company_id
          and cm.status = 'active'
          and cm.role in ('owner', 'admin')
        where da.storage_bucket = 'ai-inbox-documents'
          and da.storage_path = name
          and cm.user_id = auth.uid()
      )
    )
  );

create policy ai_evidence_documents_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ai-evidence-documents'
    and (
      -- DRAFT: photo_url ešte nie je referencovaný žiadnym ai_evidence
      -- riadkom.
      (
        (storage.foldername(name))[1] = auth.uid()::text
        and not exists (
          select 1 from public.ai_evidence ae
          where ae.photo_url = name
        )
      )
      -- FINALIZOVANÝ: photo_url patrí existujúcemu ai_evidence riadku —
      -- zmazať smie iba aktívny owner/admin firmy, ktorej riadok patrí.
      or exists (
        select 1
        from public.ai_evidence ae
        join public.company_members cm
          on cm.company_id = ae.company_id
          and cm.status = 'active'
          and cm.role in ('owner', 'admin')
        where ae.photo_url = name
          and cm.user_id = auth.uid()
      )
    )
  );


-- -----------------------------------------------------------------------------
-- 4. DELETE — machine-photos a inventory-photos: nezmenené (vlastný upload
--    ALEBO owner/admin tej istej firmy), zadanie explicitne vyžaduje
--    zachovať zamestnancovi plný prístup k týmto 2 bucketom.
-- -----------------------------------------------------------------------------

create policy machine_photos_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'machine-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.company_members caller_cm
        join public.company_members owner_cm
          on owner_cm.company_id = caller_cm.company_id
          and owner_cm.status = 'active'
        where caller_cm.user_id = auth.uid()
          and caller_cm.status = 'active'
          and caller_cm.role in ('owner', 'admin')
          and owner_cm.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy inventory_photos_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'inventory-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.company_members caller_cm
        join public.company_members owner_cm
          on owner_cm.company_id = caller_cm.company_id
          and owner_cm.status = 'active'
        where caller_cm.user_id = auth.uid()
          and caller_cm.status = 'active'
          and caller_cm.role in ('owner', 'admin')
          and owner_cm.user_id::text = (storage.foldername(name))[1]
      )
    )
  );


-- -----------------------------------------------------------------------------
-- 5. company-logos — INSERT/UPDATE/DELETE teraz vyžadujú aktívnu rolu
--    owner/admin (zamestnanec nesmie meniť/mazať firemné logo vôbec, aj keby
--    ho sám nahral). UPDATE/DELETE existujúceho objektu navyše vyžaduje, že
--    volajúci je owner/admin TEJ ISTEJ firmy ako pôvodný nahrávateľ
--    (cross-company ochrana).
-- -----------------------------------------------------------------------------

create policy company_logos_insert_owner_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.company_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.role in ('owner', 'admin')
    )
  );

create policy company_logos_update_owner_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and caller_cm.role in ('owner', 'admin')
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.company_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.role in ('owner', 'admin')
    )
  );

create policy company_logos_delete_owner_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and caller_cm.role in ('owner', 'admin')
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );

commit;
