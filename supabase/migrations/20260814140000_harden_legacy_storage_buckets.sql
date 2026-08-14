begin;

-- =============================================================================
-- Esblu — Storage hardening pre legacy buckety machine-photos / company-logos /
-- inventory-photos
-- =============================================================================
-- Kontext (zdroj: read-only security/privacy audit, docs/db/schema-baseline-
-- 2026-08-12.md §8-9): tieto 3 buckety boli doteraz vytvorené a spravované
-- výhradne cez Supabase Dashboard, mimo verziovaných migrácií. Zistené
-- medzery:
--   - machine-photos: INSERT aj DELETE policy kontrolujú iba bucket_id, NIE
--     vlastníctvo prvého priečinka cesty (auth.uid()). Bucket nemá
--     allowed_mime_types ani file_size_limit.
--   - company-logos: DELETE policy kontroluje iba bucket_id, NIE vlastníctvo.
--     Bucket nemá allowed_mime_types ani file_size_limit.
--   - inventory-photos: podľa auditu už má všetky 4 policy (SELECT/INSERT/
--     UPDATE/DELETE) správne obmedzené na (storage.foldername(name))[1] =
--     auth.uid()::text — táto migrácia jeho policy NEMENÍ, iba dopĺňa chýbajúce
--     MIME/size limity na bucket.
--
-- Vedomé rozhodnutie — buckety ZOSTÁVAJÚ public:
--   Prechod na private + signed URL by si vyžiadal prepísať synchrónne
--   `getPublicUrl()` volania v app/stroje/page.tsx, app/stroje/[id]/page.tsx,
--   app/sklad/page.tsx, app/nastavenia/page.tsx a app/components/Dashboard.tsx
--   (zoznamy fotiek renderované synchrónne v JSX) na asynchrónny signed-URL
--   flow naprieč viacerými stránkami — reálne riziko regresie, mimo rozsahu
--   tohto hardeningu ("bez zbytočného redesignu"). Skutočný exploitovateľný
--   nález (cross-tenant WRITE/DELETE do cudzieho priečinka) sa opravuje tu,
--   na úrovni Storage policy — to je nezávislé od public/private a rieši
--   podstatu problému. Zostávajúce reziduálne riziko (ktokoľvek so znalosťou
--   presnej cesty môže prečítať verejný súbor bez autentifikácie) je
--   zdokumentované ako samostatný, nižšie-prioritný nález na budúci refaktor.
--
-- Táto migrácia NEMENÍ: ai-inbox-documents, ai-evidence-documents, žiadnu
-- DB tabuľku, žiadnu RLS policy na public schéme, žiadny frontend kód.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Bucket konfigurácia — MIME allowlist + file size limit
-- -----------------------------------------------------------------------------
-- insert .. on conflict .. do update: funguje bezpečne bez ohľadu na to, či
-- bucket už existuje (produkcia) alebo nie (čisté prostredie). public = true
-- je explicitne nastavené na hodnotu zodpovedajúcu zdokumentovanému
-- súčasnému stavu (vedomé rozhodnutie vyššie), nie neúmyselná zmena.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'machine-photos',
  'machine-photos',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  5242880, -- 5 MB (appka klientsky kompresuje logo na max 2 MB, limit dáva rezervu)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-photos',
  'inventory-photos',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- 2. Odstránenie existujúcich (dashboard-vytvorených, neznáme mená) policies
--    pre machine-photos a company-logos
-- -----------------------------------------------------------------------------
-- Mená týchto policies nie sú v repozitári zdokumentované (vznikli mimo
-- migrácií). Namiesto DROP POLICY IF EXISTS <hardcoded meno> (riskantné —
-- mohlo by nezhodou mien nechať starú, slabšiu policy nažive vedľa novej)
-- dynamicky nájdeme a zrušíme každú existujúcu policy na storage.objects,
-- ktorej podmienka (qual / with_check) odkazuje na dané bucket_id, a
-- nahradíme ju nižšie novou, explicitne pomenovanou a auditovateľnou.
-- inventory-photos sa zámerne NEDOTÝKA — jeho existujúce policy sú podľa
-- auditu už správne, netreba ich rušiť a znova vytvárať.

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%machine-photos%'
        or coalesce(with_check, '') ilike '%machine-photos%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
    raise notice 'STORAGE_HARDENING: zrušená pôvodná policy % (machine-photos)', pol.policyname;
  end loop;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%company-logos%'
        or coalesce(with_check, '') ilike '%company-logos%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
    raise notice 'STORAGE_HARDENING: zrušená pôvodná policy % (company-logos)', pol.policyname;
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 3. Nové policies — machine-photos (SELECT/INSERT/UPDATE/DELETE, všetky
--    viazané na vlastníctvo prvého priečinka cesty = auth.uid())
-- -----------------------------------------------------------------------------
-- Path kontrakt zostáva nezmenený: {user_id}/{machine_id}/{filename}.

create policy machine_photos_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy machine_photos_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy machine_photos_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy machine_photos_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'machine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- -----------------------------------------------------------------------------
-- 4. Nové policies — company-logos (SELECT/INSERT/UPDATE/DELETE, všetky
--    viazané na vlastníctvo prvého priečinka cesty = auth.uid())
-- -----------------------------------------------------------------------------
-- Path kontrakt zostáva nezmenený: {user_id}/{timestamp}-company-logo.webp.
-- INSERT/UPDATE boli podľa auditu už správne owner-scoped predtým, ale keďže
-- boli zrušené v kroku 2 (dashboard-vytvorené, neznáme meno), vytvárajú sa tu
-- nanovo s rovnakou (bezpečnou) logikou — žiadna zmena správania oproti
-- pôvodnému stavu, iba pridané do verzie a doplnené o SELECT/DELETE.

create policy company_logos_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy company_logos_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy company_logos_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy company_logos_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
