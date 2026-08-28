begin;

-- =============================================================================
-- Oprava: DELETE autorizácia pre storage.objects (bucket inventory-photos)
-- cez SECURITY DEFINER helper — rovnaký hardened vzor ako 20260827140000 /
-- 20260827150000 / 20260828100000 / 20260828110000. Táto migrácia mení
-- VÝHRADNE inventory-photos DELETE. SELECT/INSERT/UPDATE sa nemenia — bucket
-- je public, appka fotky vždy číta cez getPublicUrl() (app/sklad/page.tsx),
-- čo storage.objects RLS úplne obchádza.
-- =============================================================================
-- BUSINESS PRAVIDLÁ inventory_photos (overené v 20260814160000, NEMENIA SA):
--   Tabuľka public.inventory_photos má "plný prístup" — SELECT/INSERT/
--   UPDATE/DELETE pre VŠETKY aktívne role (owner/admin/employee), scoped iba
--   na company_id = esblu_my_active_company_id() (rovnaký
--   do $full_access_policies$ loop ako machine_photos). Ktorýkoľvek aktívny
--   člen firmy smie zmazať ktorúkoľvek fotku skladovej položky svojej firmy,
--   vrátane fotky nahranej iným zamestnancom.
--   → Storage DELETE pre REFERENCOVANÝ objekt musí kopírovať presne toto:
--   ktorýkoľvek aktívny člen firmy, ktorej inventory_photos riadok patrí.
--
-- POTVRDENÝ ROOT CAUSE + FUNKČNÝ DOPAD (overené priamo v app/sklad/page.tsx,
-- funkcia deleteItem()):
--   Poradie operácií: appka najprv načíta všetky inventory_photos.file_path
--   pre danú položku, POTOM zavolá supabase.storage.from("inventory-photos")
--   .remove(photoPaths) — AK toto zlyhá, funkcia okamžite `return`-uje BEZ
--   toho, aby vôbec skúsila zmazať DB riadok inventory_items. Potvrdené
--   presne v aktuálnom kóde (žiadna zmena poradia touto migráciou):
--     if (storageError) { ...; alert(...); return; }
--     // DB delete inventory_items nasleduje AŽ PO úspešnom storage removal
--
--   Aktuálna inventory_photos_delete_company (storage.objects,
--   20260814170000) má identickú chybu ako machine_photos_delete_company:
--     bucket_id = 'inventory-photos' and (
--       (storage.foldername(name))[1] = auth.uid()::text
--       or exists (... caller_cm.role in ('owner','admin') ... owner_cm cross-user ...)
--     )
--   (1) cross-user vetva koliduje s company_members_select_own — owner_cm sa
--       vždy vyhodnotí ako vlastný riadok callera, EXISTS je pravdivé iba
--       keď caller == pôvodný nahrávateľ.
--   (2) aj keby fungovala, je zbytočne obmedzená na owner/admin, zatiaľ čo
--       DB tabuľka inventory_photos dovoľuje DELETE ktoréhokoľvek aktívneho
--       člena (aj employee).
--   DÔSLEDOK (najzávažnejší funkčný dopad zo všetkých 4 bucketov v tomto
--   kole): ak má skladová položka čo i len jednu fotku nahranú INÝM členom
--   firmy než tým, kto položku maže, storage.remove() zlyhá → celé mazanie
--   POLOŽKY (nielen fotky) sa dnes zastaví, DB riadok inventory_items sa
--   NEZMAŽE VÔBEC. Táto migrácia poradie operácií v app kóde NEMENÍ (nie je
--   to nevyhnutné) — opravou Storage autorizácie storage.remove() prestane
--   zlyhávať v cross-user prípade, takže celý existujúci flow (storage-first,
--   potom DB) začne fungovať bez akéhokoľvek zásahu do frontendu.
--   KLASIFIKÁCIA: functionality/integrity bug (nie confidentiality — bucket
--   je verejný), s najvyšším viditeľným UX dopadom (blokuje mazanie celej
--   položky, nie iba fotky).
--
-- OPRAVA: SECURITY DEFINER helper beží mimo RLS inventory_photos/
-- company_members. Referencovaný objekt → KTORÝKOĽVEK aktívny člen tej
-- firmy (nie iba owner/admin), presne podľa DB pravidla. Nereferencovaný
-- (draft, zlyhaný INSERT) → iba pôvodný nahrávateľ. Fail-closed pri
-- nekonzistentných dátach (inventory_photos.company_id je dnes NOT NULL,
-- file_path nemá unique constraint, preto rovnaká defenzívna agregácia ako
-- pri ostatných opravených bucketoch).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helper
-- -----------------------------------------------------------------------------

create or replace function public.esblu_can_delete_inventory_photo_object(p_object_name text)
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

  -- SECURITY DEFINER, beží MIMO inventory_photos_select_company RLS —
  -- výsledok je autoritatívny bez ohľadu na to, čo by caller bežne videl.
  -- Zámerne bez MAX(uuid) — iba count-based agregáty.
  select
    count(*),
    count(*) filter (where ip.company_id is null),
    count(distinct ip.company_id)
  into
    v_referenced_row_count,
    v_null_company_count,
    v_distinct_company_count
  from public.inventory_photos ip
  where ip.file_path = p_object_name;

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
  select ip.company_id
  into v_company_id
  from public.inventory_photos ip
  where ip.file_path = p_object_name
    and ip.company_id is not null
  limit 1;

  -- Presne jedna jednoznačná company_id → DELETE pre KTORÉHOKOĽVEK
  -- aktívneho člena tej firmy (zrkadlí inventory_photos_delete_company na
  -- DB tabuľke — plný prístup, nie iba owner/admin).
  return exists (
    select 1
    from public.company_members cm
    where cm.user_id = v_uid
      and cm.status = 'active'
      and cm.company_id = v_company_id
  );
end;
$function$;

comment on function public.esblu_can_delete_inventory_photo_object(text) is
  'Autoritatívne (mimo RLS inventory_photos/company_members) rozhodne, či '
  'prihlásený používateľ (auth.uid()) smie DELETE storage objekt v bucket '
  'inventory-photos na danej ceste. Referencovaný (inventory_photos.file_path '
  '= p_object_name, presne 1 jednoznačná non-null company_id) -> ktorýkoľvek '
  'aktívny member tej company (DB tabuľka má plný prístup, nie iba '
  'owner/admin); nereferencovaný draft -> iba pôvodný nahrávateľ; NULL '
  'company_id alebo >1 distinct company_id na tom istom path -> fail-closed '
  'false.';

revoke all on function public.esblu_can_delete_inventory_photo_object(text) from public;
revoke all on function public.esblu_can_delete_inventory_photo_object(text) from anon;
grant execute on function public.esblu_can_delete_inventory_photo_object(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Policy — nahradenie DELETE pre inventory-photos. SELECT/INSERT/UPDATE
--    sa NEMENIA.
-- -----------------------------------------------------------------------------

drop policy if exists inventory_photos_delete_company on storage.objects;

create policy inventory_photos_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'inventory-photos'
    and public.esblu_can_delete_inventory_photo_object(name)
  );

commit;
