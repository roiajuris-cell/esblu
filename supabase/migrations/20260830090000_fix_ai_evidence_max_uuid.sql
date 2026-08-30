begin;

-- =============================================================================
-- Oprava: SQLSTATE 42883 (undefined_function — "function max(uuid) does not
-- exist") v public.esblu_can_read_ai_evidence_object(text) a
-- public.esblu_can_delete_ai_evidence_object(text), zavedených v
-- 20260827150000_fix_ai_evidence_documents_select_policy.sql.
-- =============================================================================
-- ROOT CAUSE (potvrdené read-only auditom, reálnym Android testom AI
-- Evidencia a manuálne už aplikované priamo v produkcii — táto migrácia iba
-- zachytáva rovnaký fix vo verziovanej histórii):
--
-- PostgreSQL nemá vstavaný agregát MAX/MIN pre typ `uuid` — na rozdiel od
-- COUNT (funguje nad ľubovoľným typom s rovnosťou/hashom), MAX/MIN vyžaduje
-- explicitne registrovaný aggregate pre daný typ, a `uuid` medzi nimi v
-- stock PostgreSQL nie je (napriek tomu, že má plnohodnotnú b-tree
-- operátorovú triedu, teda `<`/`=` fungujú bežne). Volanie `max(<uuid
-- stĺpec>)` preto zlyhá HNEĎ pri plánovaní dotazu (typová rezolúcia), úplne
-- nezávisle od počtu nájdených riadkov — teda pri KAŽDOM vyhodnotení tejto
-- funkcie, nie iba príležitostne.
--
-- Pôvodný kód (20260827150000) obsahoval presne toto vo vnútri jedného
-- kombinovaného agregačného SELECTu:
--   select
--     count(*),
--     count(*) filter (where ae.company_id is null),
--     count(distinct ae.company_id),
--     max(ae.company_id)                -- <<< SQLSTATE 42883
--   into ...
--   from public.ai_evidence ae
--   where ae.photo_url = p_object_name;
--
-- Dôsledok: `storage.createSignedUrl()` pre bucket `ai-evidence-documents`
-- (AI Evidencia — náhľad fotografie aj stiahnutie originálu) zlyhávalo pri
-- KAŽDOM pokuse (SELECT RLS policy na storage.objects volá tento helper),
-- pričom klient (app/ai-evidencia/page.tsx) chybu iba logoval do konzoly a
-- UI ostávalo trvalo na "Načítavam fotografiu...". Bug bol nezávislý od
-- platformy (rovnaká DB-level chyba na webe aj mobile), iba sa prejavil až
-- pri reálnom Android teste.
--
-- PRIAMA KOROBOÁCIA V REPOZITÁRI: o deň neskoršie migrácie pre iné buckety
-- (20260828100000_fix_vehicle_photos_storage_delete.sql,
-- 20260828110000_fix_machine_photos_storage_delete.sql,
-- 20260828120000_fix_inventory_photos_storage_delete.sql) použili PRESNE
-- ten istý fail-closed vzor (count-based agregáty + draft/finalizovaný
-- rozlíšenie), ale zámerne sa MAX(uuid) vyhli — explicitný komentár priamo
-- v kóde: "Zámerne bez MAX(uuid) — iba count-based agregáty (COUNT je nad
-- uuid vždy podporovaný bez závislosti na existencii operátorovej triedy/
-- aggregate pre MAX)." `ai-evidence-documents` (20260827150000) bol jediný
-- bucket vo verziovaných migráciách, ktorý tento už-poznaný problém
-- neobsahoval opravený, keďže bol napísaný o deň skôr.
--
-- OPRAVA (táto migrácia): presne ten istý, už overený vzor ako pri
-- vehicle-photos/machine-photos/inventory-photos — kombinovaný SELECT
-- ostáva iba pre COUNT agregáty (bez MAX), a hodnota `company_id` sa načíta
-- SAMOSTATNÝM, non-agregátnym SELECTom AŽ PO potvrdení
-- `distinct_company_count = 1` (teda až keď je už autoritatívne isté, že
-- existuje presne jedna jednoznačná hodnota — LIMIT 1 tam preto
-- nerozhoduje o tenant ownership, iba číta už jednoznačne potvrdenú
-- hodnotu).
--
-- BEZPEČNOSTNÁ EKVIVALENCIA: fail-closed logika sa NEMENÍ — 0 referencujúcich
-- riadkov → draft (iba pôvodný nahrávateľ); >=1 riadok s NULL company_id
-- alebo >1 distinct non-null company_id → fail-closed `false`; presne 1
-- jednoznačná non-null company_id → autorizácia podľa tej company (READ =
-- aktívny member, DELETE = aktívny owner/admin). SECURITY DEFINER, STABLE,
-- `set search_path = ''` a interné čítanie `auth.uid()` zostávajú nezmenené.
--
-- IDEMPOTENCIA: `create or replace function` na nezmenenú signatúru
-- (rovnaký názov, rovnaký `text` parameter, rovnaký `returns boolean`) —
-- žiadny DROP/CREATE POLICY nie je potrebný, keďže policies
-- (ai_evidence_documents_select_company / ..._delete_company,
-- 20260827150000) referencujú funkcie podľa mena, nie podľa tela, a
-- zostávajú bezo zmeny.
--
-- Produkčná DB už má tento fix manuálne aplikovaný (potvrdené: fotografia sa
-- po fixe načítava). Táto migrácia zachytáva presne ten istý stav vo
-- verziovanej histórii, aby bol reprodukovateľný pri budúcom obnovení/
-- inom prostredí (staging, lokálny dev DB a pod.).
-- =============================================================================

create or replace function public.esblu_can_read_ai_evidence_object(p_object_name text)
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

  -- Referencovaný cez ai_evidence.photo_url — SECURITY DEFINER, beží MIMO
  -- ai_evidence_select_company RLS, takže výsledok je autoritatívny bez
  -- ohľadu na to, čo by caller bežne videl. photo_url NEMÁ DB-level UNIQUE
  -- garanciu a company_id NEPREDPOKLADÁME ako NOT NULL (defense-in-depth),
  -- preto sa počítajú explicitné count-based agregáty. Zámerne BEZ
  -- MAX(uuid) — pozri hlavičku migrácie (SQLSTATE 42883).
  select
    count(*),
    count(*) filter (where ae.company_id is null),
    count(distinct ae.company_id)
  into
    v_referenced_row_count,
    v_null_company_count,
    v_distinct_company_count
  from public.ai_evidence ae
  where ae.photo_url = p_object_name;

  if v_referenced_row_count = 0 then
    -- A) Žiadny ai_evidence riadok pre tento path → skutočný draft — iba
    -- pôvodný nahrávateľ.
    return v_uploader_uid = v_uid::text;
  end if;

  if v_null_company_count > 0 or v_distinct_company_count <> 1 then
    -- B) Objekt JE referencovaný, ale dáta sú nekonzistentné (niektorý
    -- riadok má company_id IS NULL, alebo existuje viac než jeden distinct
    -- non-null company_id naprieč riadkami so zhodným photo_url) —
    -- fail-closed, nikdy nespadnúť do draft/uploader fallbacku.
    return false;
  end if;

  -- C) Až TERAZ, keď je autoritatívne potvrdené (žiadny NULL, presne 1
  -- distinct), je bezpečné načítať tú jednu hodnotu samostatným SELECTom
  -- (bez agregácie, teda bez MAX/MIN problému).
  select ae.company_id
  into v_company_id
  from public.ai_evidence ae
  where ae.photo_url = p_object_name
    and ae.company_id is not null
  limit 1;

  -- READ pre ktoréhokoľvek aktívneho člena tej firmy, bez rozlíšenia role
  -- (rovnaké pravidlo ako ai_evidence_select_company).
  return exists (
    select 1
    from public.company_members cm
    where cm.user_id = v_uid
      and cm.status = 'active'
      and cm.company_id = v_company_id
  );
end;
$function$;

comment on function public.esblu_can_read_ai_evidence_object(text) is
  'Autoritatívne (mimo RLS ai_evidence/company_members) rozhodne, či '
  'prihlásený používateľ (auth.uid()) smie READ storage objekt v bucket '
  'ai-evidence-documents na danej ceste. photo_url nemá DB unique '
  'garanciu a company_id sa nepredpokladá ako NOT NULL: 0 referencujúcich '
  'riadkov -> draft (iba pôvodný nahrávateľ); >=1 riadok s NULL company_id '
  'alebo >1 distinct non-null company_id -> fail-closed false; presne 1 '
  'jednoznačná non-null company_id -> aktívny member tej company. '
  'Zámerne bez MAX(uuid) agregátu (SQLSTATE 42883 — PostgreSQL nemá '
  'vstavaný MAX/MIN pre uuid), opravené v 20260830090000.';

revoke all on function public.esblu_can_read_ai_evidence_object(text) from public;
revoke all on function public.esblu_can_read_ai_evidence_object(text) from anon;
grant execute on function public.esblu_can_read_ai_evidence_object(text) to authenticated;


create or replace function public.esblu_can_delete_ai_evidence_object(p_object_name text)
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

  -- Rovnaký count-only vzor ako v esblu_can_read_ai_evidence_object vyššie
  -- — zámerne BEZ MAX(uuid).
  select
    count(*),
    count(*) filter (where ae.company_id is null),
    count(distinct ae.company_id)
  into
    v_referenced_row_count,
    v_null_company_count,
    v_distinct_company_count
  from public.ai_evidence ae
  where ae.photo_url = p_object_name;

  if v_referenced_row_count = 0 then
    -- A) Nereferencovaný draft — iba pôvodný nahrávateľ smie zmazať (rieši
    -- presne prípad, keď appka sama upratuje po zlyhanom INSERTe).
    return v_uploader_uid = v_uid::text;
  end if;

  if v_null_company_count > 0 or v_distinct_company_count <> 1 then
    -- B) Rovnaké fail-closed pravidlo ako pri READ — nekonzistentné dáta
    -- nikdy neautorizujú DELETE.
    return false;
  end if;

  -- C) Až TERAZ samostatný, non-agregátny SELECT tej jednej potvrdenej
  -- hodnoty.
  select ae.company_id
  into v_company_id
  from public.ai_evidence ae
  where ae.photo_url = p_object_name
    and ae.company_id is not null
  limit 1;

  -- DELETE pre finalizovaný objekt s jednoznačnou company_id: iba aktívny
  -- owner/admin tej firmy — zrkadlí ai_evidence_delete_owner_admin
  -- (20260814160000). Employee nikdy, ani na vlastný upload po
  -- finalizácii.
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

comment on function public.esblu_can_delete_ai_evidence_object(text) is
  'Autoritatívne (mimo RLS ai_evidence/company_members) rozhodne, či '
  'prihlásený používateľ (auth.uid()) smie DELETE storage objekt v bucket '
  'ai-evidence-documents na danej ceste. Rovnaká fail-closed agregačná '
  'logika ako esblu_can_read_ai_evidence_object (0 riadkov -> draft; NULL '
  'company_id alebo >1 distinct -> false; presne 1 jednoznačná company_id '
  '-> iba aktívny owner/admin tej company); nereferencovaný draft -> iba '
  'pôvodný nahrávateľ. Zámerne bez MAX(uuid) agregátu (SQLSTATE 42883), '
  'opravené v 20260830090000.';

revoke all on function public.esblu_can_delete_ai_evidence_object(text) from public;
revoke all on function public.esblu_can_delete_ai_evidence_object(text) from anon;
grant execute on function public.esblu_can_delete_ai_evidence_object(text) to authenticated;

commit;
