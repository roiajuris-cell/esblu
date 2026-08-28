begin;

-- =============================================================================
-- Oprava: DELETE autorizácia pre storage.objects (bucket machine-photos) cez
-- SECURITY DEFINER helper — rovnaký hardened vzor ako 20260827140000 /
-- 20260827150000 / 20260828100000. Táto migrácia mení VÝHRADNE machine-photos
-- DELETE. SELECT/INSERT/UPDATE sa nemenia — bucket je public, appka fotky
-- vždy číta cez getPublicUrl() (app/stroje/page.tsx, app/stroje/[id]/page.tsx,
-- app/components/Dashboard.tsx), čo storage.objects RLS úplne obchádza.
-- =============================================================================
-- BUSINESS PRAVIDLÁ machine_photos (overené v 20260814160000, NEMENIA SA):
--   Tabuľka public.machine_photos má "plný prístup" — SELECT/INSERT/UPDATE/
--   DELETE pre VŠETKY aktívne role (owner/admin/employee), scoped iba na
--   company_id = esblu_my_active_company_id() (7a., do $full_access_policies$
--   loop). NA ROZDIEL od vehicle_photos: DELETE tu NIE JE obmedzené na
--   owner/admin — ktorýkoľvek aktívny člen firmy smie zmazať ktorúkoľvek
--   fotku stroja svojej firmy, vrátane fotky nahranej iným zamestnancom.
--   → Storage DELETE pre REFERENCOVANÝ objekt musí kopírovať presne toto:
--   ktorýkoľvek aktívny člen firmy, ktorej machine_photos riadok patrí — NIE
--   iba owner/admin.
--
-- POTVRDENÝ ROOT CAUSE (rovnaká trieda chyby ako ostatné opravené buckety):
--   Aktuálna machine_photos_delete_company (storage.objects, 20260814170000):
--     bucket_id = 'machine-photos' and (
--       (storage.foldername(name))[1] = auth.uid()::text
--       or exists (
--         select 1 from company_members caller_cm
--         join company_members owner_cm
--           on owner_cm.company_id = caller_cm.company_id and owner_cm.status='active'
--         where caller_cm.user_id = auth.uid() and caller_cm.status='active'
--           and caller_cm.role in ('owner','admin')
--           and owner_cm.user_id::text = (storage.foldername(name))[1]
--       )
--     )
--   Má dve chyby súčasne:
--   (1) cross-user vetva koliduje s company_members_select_own presne ako
--       pri ostatných bucketoch — owner_cm sa vždy vyhodnotí ako vlastný
--       riadok callera, takže EXISTS je pravdivé iba keď caller == pôvodný
--       nahrávateľ. Owner/admin preto dnes NEVIE zmazať fotku nahranú iným
--       členom (potvrdené aj v appkóde — app/stroje/[id]/page.tsx, komentár
--       "Databázový záznam fotografie bol vymazaný, ale Storage cleanup
--       zlyhal").
--   (2) aj keby cross-user join fungoval, je navyše príliš reštriktívny
--       oproti DB pravidlu — obmedzuje cross-user DELETE na "caller_cm.role
--       in ('owner','admin')", zatiaľ čo DB tabuľka machine_photos dovoľuje
--       DELETE ktoréhokoľvek aktívneho člena (aj employee).
--   Vlastný upload ((storage.foldername(name))[1] = auth.uid()::text) je
--   dnes už funkčný bez ohľadu na rolu — táto vetva je logicky správna a
--   zostáva zachovaná (presunutá do helperu).
--   KLASIFIKÁCIA: functionality/integrity bug (nie confidentiality — bucket
--   je verejný) — cross-user DELETE zlyháva vždy, aj pre role, ktoré ho DB
--   tabuľka explicitne povoľuje.
--
-- OPRAVA: SECURITY DEFINER helper beží mimo RLS machine_photos/
-- company_members. Referencovaný objekt sa autorizuje podľa autoritatívneho
-- machine_photos.company_id — KTORÝKOĽVEK aktívny člen tej firmy (nie iba
-- owner/admin), presne podľa DB pravidla. Nereferencovaný (draft, zlyhaný
-- INSERT) — iba pôvodný nahrávateľ, bez ohľadu na rolu (rovnaké ako doteraz).
-- Fail-closed pri nekonzistentných dátach (NULL company_id — pridaný ako
-- NULLABLE v 20260814120000, na NOT NULL zmenený v 20260814160000 — dnes
-- teda NOT NULL, ale žiadny unique constraint na file_path neexistuje, preto
-- rovnaká defenzívna agregácia ako pri ai_evidence/vehicle_photos).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helper
-- -----------------------------------------------------------------------------

create or replace function public.esblu_can_delete_machine_photo_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_uploader_uid text;
  v_referenced_row_count integer;
  v_null_company_count integer;
  v_distinct_company_count integer;
  v_company_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  v_uploader_uid := (storage.foldername(p_object_name))[1];

  -- SECURITY DEFINER, beží MIMO machine_photos_select_company RLS —
  -- výsledok je autoritatívny bez ohľadu na to, čo by caller bežne videl.
  -- Zámerne bez MAX(uuid) — iba count-based agregáty.
  select
    count(*),
    count(*) filter (where mp.company_id is null),
    count(distinct mp.company_id)
  into
    v_referenced_row_count,
    v_null_company_count,
    v_distinct_company_count
  from public.machine_photos mp
  where mp.file_path = p_object_name;

  if v_referenced_row_count = 0 then
    -- Draft/nereferencovaný upload (zlyhaný INSERT) — iba pôvodný
    -- nahrávateľ, bez ohľadu na rolu.
    return v_uploader_uid = v_uid::text;
  end if;

  if v_null_company_count > 0 or v_distinct_company_count <> 1 then
    -- Objekt JE referencovaný, ale dáta sú nekonzistentné — fail-closed.
    return false;
  end if;

  -- Až TERAZ, keď je autoritatívne potvrdené (žiadny NULL, presne 1
  -- distinct), je bezpečné načítať tú jednu hodnotu samostatným SELECTom.
  -- LIMIT 1 tu nerozhoduje o tenant ownership — iba číta už jednoznačne
  -- potvrdenú hodnotu.
  select mp.company_id
  into v_company_id
  from public.machine_photos mp
  where mp.file_path = p_object_name
    and mp.company_id is not null
  limit 1;

  -- Presne jedna jednoznačná company_id → DELETE pre KTORÉHOKOĽVEK
  -- aktívneho člena tej firmy (zrkadlí machine_photos_delete_company na DB
  -- tabuľke — plný prístup, nie iba owner/admin).
  return exists (
    select 1
    from public.company_members cm
    where cm.user_id = v_uid
      and cm.status = 'active'
      and cm.company_id = v_company_id
  );
end;
$function$;

comment on function public.esblu_can_delete_machine_photo_object(text) is
  'Autoritatívne (mimo RLS machine_photos/company_members) rozhodne, či '
  'prihlásený používateľ (auth.uid()) smie DELETE storage objekt v bucket '
  'machine-photos na danej ceste. Referencovaný (machine_photos.file_path = '
  'p_object_name, presne 1 jednoznačná non-null company_id) -> ktorýkoľvek '
  'aktívny member tej company (DB tabuľka má plný prístup, nie iba '
  'owner/admin); nereferencovaný draft -> iba pôvodný nahrávateľ; NULL '
  'company_id alebo >1 distinct company_id na tom istom path -> fail-closed '
  'false.';

revoke all on function public.esblu_can_delete_machine_photo_object(text) from public;
revoke all on function public.esblu_can_delete_machine_photo_object(text) from anon;
grant execute on function public.esblu_can_delete_machine_photo_object(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Policy — nahradenie DELETE pre machine-photos. SELECT/INSERT/UPDATE sa
--    NEMENIA.
-- -----------------------------------------------------------------------------

drop policy if exists machine_photos_delete_company on storage.objects;

create policy machine_photos_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'machine-photos'
    and public.esblu_can_delete_machine_photo_object(name)
  );

commit;
