begin;

-- =============================================================================
-- Oprava: DELETE autorizácia pre storage.objects (bucket company-logos) cez
-- SECURITY DEFINER helper — rovnaký hardened vzor ako 20260827140000 /
-- 20260827150000 / 20260828100000 / 20260828110000 / 20260828120000. Táto
-- migrácia mení VÝHRADNE company-logos DELETE. SELECT (READ) a INSERT sa
-- nemenia — bucket je public, appka logo vždy číta cez getPublicUrl()
-- (app/nastavenia/page.tsx, app/components/Dashboard.tsx), čo storage.objects
-- RLS úplne obchádza; INSERT (company_logos_insert_owner_admin) nemá
-- cross-user pattern (vlastný priečinok + rola owner/admin, obe overené na
-- samotnom callerovi, žiadny lookup cudzieho company_members riadku).
-- =============================================================================
-- BUSINESS PRAVIDLÁ company-logos (overené v 20260814170000, NEMENIA SA):
--   Firemné logo patrí pod "Nastavenia firmy" — zamestnanec bez prístupu.
--   INSERT/UPDATE/DELETE vyžadujú aktívnu rolu owner/admin. Autoritatívny
--   DB záznam je public.companies.logo_path (potvrdené v app/nastavenia/
--   page.tsx — saveLogoPathToDatabase() zapisuje do companies.logo_path,
--   nie do žiadnej per-uploader tabuľky).
--
-- PREČO sa ownership NEODVODZUJE z companies.logo_path (na rozdiel od
-- ai_evidence.photo_url / vehicle_photos.storage_path / *_photos.file_path):
--   Reálny "replace logo" flow (app/nastavenia/page.tsx, uploadLogo()):
--     1. nahrá NOVÝ súbor do vlastného priečinka (INSERT, vždy funguje),
--     2. zapíše companies.logo_path = novaCesta (UPDATE DB riadku firmy),
--     3. AŽ POTOM zavolá storage.remove([previousLogoPath]) na STARÝ súbor.
--   V okamihu kroku 3 companies.logo_path UŽ NEUKAZUJE na previousLogoPath —
--   ukazuje na novaCesta. Mazaný objekt je teda vždy objekt, na ktorý DNES
--   NEODKAZUJE žiadny companies riadok (bol nahradený). Autorizácia cez
--   "existuje companies riadok s logo_path = tento path" by preto pri
--   bežnom replace-flow VŽDY vyhodnotila objekt ako "nereferencovaný" — aj
--   keď ide o legitímny, práve nahradený firemný artefakt, nie o skutočný
--   draft zlyhaného uploadu. Táto oprava preto zachováva PÔVODNE ZAMÝŠĽANÝ
--   model z 20260814170000 (jej vlastný komentár: "UPDATE/DELETE existujúceho
--   objektu navyše vyžaduje, že volajúci je owner/admin TEJ ISTEJ firmy ako
--   pôvodný nahrávateľ") — iba ho opravuje zo self-referenčne kolabujúcej
--   inline RLS na bezpečný SECURITY DEFINER lookup. Toto NIE JE nový model
--   ownershipu, iba správna implementácia toho istého, už zdokumentovaného
--   pravidla.
--
-- POTVRDENÝ ROOT CAUSE (rovnaká trieda chyby ako ostatné opravené buckety):
--   Aktuálna company_logos_delete_owner_admin (storage.objects,
--   20260814170000):
--     exists (
--       select 1 from company_members caller_cm
--       join company_members owner_cm
--         on owner_cm.company_id = caller_cm.company_id and owner_cm.status='active'
--       where caller_cm.user_id = auth.uid() and caller_cm.status='active'
--         and caller_cm.role in ('owner','admin')
--         and owner_cm.user_id::text = (storage.foldername(name))[1]
--     )
--   owner_cm má reprezentovať PÔVODNÉHO NAHRÁVATEĽA (iný admin/owner než
--   caller). company_members_select_own sa vynucuje aj vnútri tejto
--   subquery, takže owner_cm sa vždy vyhodnotí ako vlastný riadok callera —
--   admin B preto dnes NEVIE zmazať ani nahradiť logo, ktoré nahral admin A.
--   KLASIFIKÁCIA: functionality/integrity bug (nie confidentiality — bucket
--   je verejný).
--
-- OPRAVA: SECURITY DEFINER helper zistí AKTÍVNU company_members príslušnosť
-- PÔVODNÉHO NAHRÁVATEĽA (prvý segment cesty) mimo company_members_select_own
-- RLS, a autorizuje DELETE, ak je caller aktívny owner/admin TEJ ISTEJ
-- firmy. company_members má unikátny index najviac 1 aktívny membership na
-- používateľa (company_members_one_active_per_user_idx,
-- 20260814110000) — napriek tomu sa počíta explicitne (fail-closed), nie
-- LIMIT 1.
--
-- ZNÁMY REZIDUÁLNY LIMIT (zdokumentovaný, nie riešený touto migráciou —
-- vyžadoval by zmenu dátového modelu, mimo rozsahu "NEMEŇ business
-- pravidlá"): ak PÔVODNÝ nahrávateľ loga medzičasom odíde z firmy skôr, než
-- niekto logo nahradí/zmaže, staré osirotené logo už nevie zmazať NIKTO
-- (nahrávateľ nemá aktívny membership → fail-closed false; žiadny iný
-- používateľ nie je "prvý segment cesty", takže cross-user vetva sa naň
-- nevzťahuje). Dôsledok je iba orphaned súbor vo verejnom buckete (storage
-- hygiene), NIE cross-tenant confidentiality riziko — bucket je public,
-- objekt bol aj predtým verejne dostupný. Riešenie by vyžadovalo per-objekt
-- históriu (napr. samostatnú company_logos tabuľku s vlastným company_id
-- stĺpcom, analogicky k vehicle_photos), čo je zámerne mimo rozsahu tejto
-- opravy (žiadna schema/business zmena).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helper
-- -----------------------------------------------------------------------------

create or replace function public.esblu_can_manage_company_logo_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_uploader_uid text;
  v_uploader_active_company_count integer;
  v_uploader_company_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  v_uploader_uid := (storage.foldername(p_object_name))[1];

  -- Autoritatívna aktívna firma PÔVODNÉHO NAHRÁVATEĽA (prvý segment cesty),
  -- zistená SECURITY DEFINER (mimo company_members_select_own RLS).
  -- Porovnanie cez ::text, aby malformovaný/neuuid segment cesty nespôsobil
  -- cast chybu namiesto bezpečného "0 riadkov". Zámerne bez MAX(uuid) — iba
  -- count(*), company_id sa načíta samostatným SELECTom až po potvrdení.
  select count(*)
  into v_uploader_active_company_count
  from public.company_members cm
  where cm.user_id::text = v_uploader_uid
    and cm.status = 'active';

  if v_uploader_active_company_count <> 1 then
    -- Pôvodný nahrávateľ dnes nie je aktívny člen presne jednej firmy
    -- (0 = odišiel z firmy alebo neplatný segment cesty; >1 teoreticky
    -- nekonzistentné dáta, napriek unique indexu) -> fail-closed, nikdy
    -- neautorizovať. Rieši aj scenár "bývalý nahrávateľ po odchode z
    -- firmy" pre prípad, že by bol sám callerom.
    return false;
  end if;

  -- Až TERAZ, keď je potvrdené, že existuje presne 1 aktívny membership, je
  -- bezpečné načítať jeho company_id samostatným SELECTom — LIMIT 1 tu
  -- nerozhoduje o ownership, iba číta už jednoznačne potvrdenú hodnotu.
  select cm.company_id
  into v_uploader_company_id
  from public.company_members cm
  where cm.user_id::text = v_uploader_uid
    and cm.status = 'active'
  limit 1;

  -- Caller musí byť aktívny owner/admin TEJ ISTEJ firmy ako pôvodný
  -- nahrávateľ (zrkadlí pôvodne zamýšľaný, ale kolabujúci model z
  -- 20260814170000). Pokrýva aj self-cleanup vlastného draftu — v tom
  -- prípade je caller == uploader a podmienka je triviálne splnená, keďže
  -- INSERT do tohto bucketu už dnes vyžaduje rolu owner/admin.
  return exists (
    select 1
    from public.company_members cm
    where cm.user_id = v_uid
      and cm.status = 'active'
      and cm.role in ('owner', 'admin')
      and cm.company_id = v_uploader_company_id
  );
end;
$function$;

comment on function public.esblu_can_manage_company_logo_object(text) is
  'Autoritatívne (mimo RLS company_members) rozhodne, či prihlásený '
  'používateľ (auth.uid()) smie DELETE storage objekt v bucket '
  'company-logos na danej ceste. Ownership sa odvodzuje z AKTÍVNEJ '
  'company_members príslušnosti pôvodného nahrávateľa (prvý segment cesty), '
  'nie z companies.logo_path (ten pri replace-flow už ukazuje na nový '
  'súbor, nie na mazaný). Caller musí byť aktívny owner/admin tej istej '
  'firmy. Nahrávateľ, ktorý dnes nemá presne 1 aktívny membership (odišiel '
  'z firmy alebo neplatná cesta) -> fail-closed false.';

revoke all on function public.esblu_can_manage_company_logo_object(text) from public;
revoke all on function public.esblu_can_manage_company_logo_object(text) from anon;
grant execute on function public.esblu_can_manage_company_logo_object(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Policy — nahradenie DELETE pre company-logos. SELECT/INSERT/UPDATE sa
--    NEMENIA (UPDATE zdieľa rovnaký cross-user pattern, ale appka ho dnes
--    nepoužíva — zdokumentované v reporte ako samostatný TODO, mimo rozsahu
--    tejto migrácie).
-- -----------------------------------------------------------------------------

drop policy if exists company_logos_delete_owner_admin on storage.objects;

create policy company_logos_delete_owner_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'company-logos'
    and public.esblu_can_manage_company_logo_object(name)
  );

commit;
