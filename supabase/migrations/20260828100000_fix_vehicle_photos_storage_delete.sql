begin;

-- =============================================================================
-- Oprava: DELETE autorizácia pre storage.objects (bucket vehicle-photos) cez
-- SECURITY DEFINER helper — rovnaký hardened vzor ako 20260827140000
-- (ai-inbox-documents) a 20260827150000 (ai-evidence-documents). Táto
-- migrácia mení VÝHRADNE vehicle-photos DELETE. SELECT (READ) sa nemení —
-- bucket je public (public.buckets.vehicle-photos.public = true), appka číta
-- fotky výhradne cez getPublicUrl() (app/vozidla/[id]/page.tsx), ktorý
-- storage.objects RLS úplne obchádza — chybný cross-user SELECT pattern tu
-- teda nepridáva žiadne confidentiality riziko nad rámec už akceptovaného,
-- zdokumentovaného kompromisu verejného bucketu (20260814140000). INSERT
-- (vehicle_photos_insert_active_member) sa nemení — nemá cross-user pattern,
-- je vlastníctvo-scoped priamo na auth.uid() + FK na vehicles/company_members.
-- =============================================================================
-- BUSINESS PRAVIDLÁ vehicle_photos (overené v 20260816110000, NEMENIA SA):
--   vehicle_photos_select_company    — SELECT pre všetky role
--   vehicle_photos_insert_active_member — INSERT pre všetky role (owner/admin/employee)
--   vehicle_photos_update_owner_admin — UPDATE iba owner/admin (appka dnes UPDATE nepoužíva)
--   vehicle_photos_delete_owner_admin — DELETE iba owner/admin (DB tabuľka)
-- → Storage DELETE pre REFERENCOVANÝ objekt musí kopírovať presne toto:
--   iba aktívny owner/admin firmy, ktorej vehicle_photos riadok patrí.
--
-- POTVRDENÝ ROOT CAUSE (rovnaká trieda chyby ako ai-inbox/ai-evidence):
--   Aktuálna vehicle_photos_delete_owner_admin (storage.objects,
--   20260816110000) autorizuje DELETE cez:
--     exists (
--       select 1 from company_members caller_cm
--       join company_members owner_cm
--         on owner_cm.company_id = caller_cm.company_id and owner_cm.status='active'
--       where caller_cm.user_id = auth.uid() and caller_cm.status='active'
--         and caller_cm.role in ('owner','admin')
--         and owner_cm.user_id::text = (storage.foldername(name))[1]
--     )
--   owner_cm má reprezentovať PÔVODNÉHO NAHRÁVATEĽA (iný používateľ než
--   caller). company_members_select_own (20260814110000: using (user_id =
--   auth.uid())) sa vynucuje aj vnútri tejto subquery, takže owner_cm sa pri
--   reálnom "authenticated" vykonaní vyhodnotí VÝHRADNE ako vlastný riadok
--   callera — pre owner/admin != pôvodný nahrávateľ (napr. employee) preto
--   EXISTS vždy vyjde false. DÔSLEDOK (potvrdené aj v samotnom appkódu —
--   app/vozidla/[id]/page.tsx, komentár "Databázový záznam fotografie bol
--   vymazaný, ale Storage cleanup zlyhal"): owner/admin zmaže DB riadok
--   vehicle_photos úspešne (DB RLS to povoľuje), ale zodpovedajúci Storage
--   objekt sa nedá zmazať, ak fotku nahral iný člen firmy — silent orphan.
--   KLASIFIKÁCIA: functionality/integrity bug (nie confidentiality — bucket
--   je verejný), storage cleanup zlyháva presne v cross-user prípade.
--
-- DODATOČNÝ NÁLEZ — chýbajúci draft/self-cleanup branch: aktuálna policy
--   NEMÁ žiadnu vetvu pre nereferencovaný (draft) objekt. Upload flow
--   (app/vozidla/[id]/page.tsx, uploadPhotos()) pri zlyhaní INSERTu do
--   vehicle_photos okamžite volá storage.remove([filePath]) — vlastný
--   cleanup PÔVODNÝM nahrávateľom, v tej istej požiadavke. Keďže INSERT do
--   vehicle_photos smie ktokoľvek aktívny (owner/admin/employee), ale
--   aktuálna DELETE policy vyžaduje rolu owner/admin, EMPLOYEE dnes nevie
--   vyčistiť ani VLASTNÝ zlyhaný upload. Toto je priamo v scope "DB
--   oprávnenie a Storage oprávnenie musia byť konzistentné" — INSERT
--   povoľuje employee, cleanup vlastného zlyhania preto musí byť rovnako
--   dostupný, bez ohľadu na rolu (nový helper nižšie to rieši draft-vetvou,
--   analogicky k ai-inbox/ai-evidence).
--
-- OPRAVA: SECURITY DEFINER helper beží mimo RLS vehicle_photos/
-- company_members — referencovaný objekt sa autorizuje podľa autoritatívneho
-- vehicle_photos.company_id (owner/admin), nereferencovaný (draft) podľa
-- prvého segmentu cesty (ktorýkoľvek uploader, bez ohľadu na rolu).
-- Fail-closed pri nekonzistentných dátach (NULL company_id alebo viac než
-- 1 distinct company_id pre ten istý storage_path — vehicle_photos.company_id
-- je dnes NOT NULL priamo od vytvorenia tabuľky, žiadny unique constraint na
-- storage_path však neexistuje, preto rovnaká defenzívna agregácia ako pri
-- ai_evidence).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helper
-- -----------------------------------------------------------------------------

create or replace function public.esblu_can_delete_vehicle_photo_object(p_object_name text)
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

  -- SECURITY DEFINER, beží MIMO vehicle_photos_select_company RLS — výsledok
  -- je autoritatívny bez ohľadu na to, čo by caller bežne videl. Zámerne bez
  -- MAX(uuid) — iba count-based agregáty (COUNT je nad uuid vždy podporovaný
  -- bez závislosti na existencii operátorovej triedy/aggregate pre MAX).
  select
    count(*),
    count(*) filter (where vp.company_id is null),
    count(distinct vp.company_id)
  into
    v_referenced_row_count,
    v_null_company_count,
    v_distinct_company_count
  from public.vehicle_photos vp
  where vp.storage_bucket = 'vehicle-photos'
    and vp.storage_path = p_object_name;

  if v_referenced_row_count = 0 then
    -- Draft/nereferencovaný upload (zlyhaný INSERT) — iba pôvodný
    -- nahrávateľ, bez ohľadu na rolu (INSERT smie ktokoľvek aktívny).
    return v_uploader_uid = v_uid::text;
  end if;

  if v_null_company_count > 0 or v_distinct_company_count <> 1 then
    -- Objekt JE referencovaný, ale dáta sú nekonzistentné — fail-closed,
    -- nikdy nespadnúť do draft/uploader fallbacku.
    return false;
  end if;

  -- Až TERAZ, keď je autoritatívne potvrdené (žiadny NULL, presne 1
  -- distinct), je bezpečné načítať tú jednu hodnotu samostatným SELECTom.
  -- LIMIT 1 tu nerozhoduje o tenant ownership — iba číta už jednoznačne
  -- potvrdenú hodnotu.
  select vp.company_id
  into v_company_id
  from public.vehicle_photos vp
  where vp.storage_bucket = 'vehicle-photos'
    and vp.storage_path = p_object_name
    and vp.company_id is not null
  limit 1;

  -- Presne jedna jednoznačná company_id → DELETE iba pre aktívneho
  -- owner/admin tej firmy (zrkadlí vehicle_photos_delete_owner_admin).
  return exists (
    select 1
    from public.company_members cm
    where cm.user_id = v_uid
      and cm.status = 'active'
      and cm.role in ('owner', 'admin')
      and cm.company_id = v_company_id
  );
end;
$function$;

comment on function public.esblu_can_delete_vehicle_photo_object(text) is
  'Autoritatívne (mimo RLS vehicle_photos/company_members) rozhodne, či '
  'prihlásený používateľ (auth.uid()) smie DELETE storage objekt v bucket '
  'vehicle-photos na danej ceste. Referencovaný (vehicle_photos.storage_path '
  '= p_object_name, presne 1 jednoznačná non-null company_id) -> iba aktívny '
  'owner/admin tej company; nereferencovaný draft -> iba pôvodný nahrávateľ; '
  'NULL company_id alebo >1 distinct company_id na tom istom path -> '
  'fail-closed false.';

revoke all on function public.esblu_can_delete_vehicle_photo_object(text) from public;
revoke all on function public.esblu_can_delete_vehicle_photo_object(text) from anon;
grant execute on function public.esblu_can_delete_vehicle_photo_object(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Policy — nahradenie DELETE pre vehicle-photos. SELECT/INSERT sa NEMENIA.
-- -----------------------------------------------------------------------------

drop policy if exists vehicle_photos_delete_owner_admin on storage.objects;

create policy vehicle_photos_delete_owner_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and public.esblu_can_delete_vehicle_photo_object(name)
  );

commit;
