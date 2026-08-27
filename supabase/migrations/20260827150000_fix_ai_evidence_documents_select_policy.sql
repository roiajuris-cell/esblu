begin;

-- =============================================================================
-- Oprava: SELECT/DELETE autorizácia pre storage.objects (bucket
-- ai-evidence-documents) cez SECURITY DEFINER helper funkcie — rovnaký
-- hardened vzor, aký sme práve nasadili pre ai-inbox-documents
-- (20260827140000). Táto migrácia mení VÝHRADNE ai-evidence-documents.
-- vehicle-photos / machine-photos / inventory-photos / company-logos sa
-- touto migráciou vôbec nedotýkajú (samostatný audit, samostatná migrácia).
-- =============================================================================
-- POTVRDENÝ ROOT CAUSE (rovnaká trieda chyby ako pri ai-inbox-documents):
--
-- (1) SELECT — ai_evidence_documents_select_company (20260814170000) READ
--     odvodzuje cez join DVOCH company_members riadkov (caller_cm/owner_cm),
--     kde owner_cm má reprezentovať PÔVODNÉHO NAHRÁVATEĽA (iný používateľ
--     než caller). company_members_select_own (20260814110000: using
--     (user_id = auth.uid())) sa vynucuje AJ vnútri tejto subquery, takže
--     owner_cm sa pri reálnom "authenticated" vykonaní vyhodnotí VÝHRADNE
--     ako vlastný riadok callera. Pre employee/admin != pôvodný nahrávateľ
--     preto EXISTS vždy vyjde false, aj keď obaja sú aktívni v tej istej
--     firme. KLASIFIKÁCIA: authorization/availability bug.
--
-- (2) DELETE — draft/finalized rozlíšenie (`NOT EXISTS (select 1 from
--     public.ai_evidence ae where ae.photo_url = name)`) je samo osebe pod
--     bežnou RLS public.ai_evidence (ai_evidence_select_company: using
--     (company_id = esblu_my_active_company_id())). Ak je objekt v
--     skutočnosti FINALIZOVANÝ a patrí firme A, ale caller (napr. bývalý
--     nahrávateľ, ktorý medzičasom odišiel z firmy A) už nemá aktívny
--     membership vo firme A, cez RLS ai_evidence tento riadok vôbec nevidí
--     → NOT EXISTS chybne vyjde TRUE → objekt sa nesprávne vyhodnotí ako
--     "draft" → dostal by DELETE na finalizovaný objekt firmy, ktorej už
--     nie je členom. KLASIFIKÁCIA: závažnejší security aspekt (cross-company
--     DELETE risk pre bývalého nahrávateľa).
--
-- BUSINESS PRAVIDLÁ AI EVIDENCIA (overené v 20260814160000, NEMENIA SA):
--   ai_evidence_select_company     — SELECT pre všetky role (owner/admin/employee)
--   ai_evidence_insert_company     — INSERT pre všetky role
--   ai_evidence_update_owner_admin — UPDATE iba owner/admin
--   ai_evidence_delete_owner_admin — DELETE iba owner/admin (komentár v
--     migrácii explicitne: "employee smie vytvoriť dokument, nesmie
--     upraviť/zmazať už uložený")
--   → DELETE helper nižšie preto pre REFERENCOVANÝ (finalizovaný) objekt
--     autorizuje výhradne aktívneho owner/admin firmy, ktorej ai_evidence
--     riadok patrí — employee nikdy, ani na vlastný upload po finalizácii.
--     Toto NIE JE zmena business pravidla, iba prenesenie existujúceho
--     pravidla z DB tabuľky na zodpovedajúci Storage objekt.
--
-- UNIQUE GARANCIA photo_url (potvrdené — NEEXISTUJE):
--   public.ai_evidence.photo_url NEMÁ databázový UNIQUE constraint ani
--   unique index (docs/db/schema-baseline-2026-08-12.md §2 + grep cez
--   všetky verziované migrácie). Preto helper funkcie nepoužívajú
--   arbitrárny LIMIT 1 na výber "prvého" riadku.
--
-- NULL company_id (potvrdené — dnes NOT NULL, ale helper zostáva fail-closed
--   aj tak): `public.ai_evidence.company_id` bol pridaný ako NULLABLE v
--   20260814120000 (zámerne, kvôli dobovému frontendu bez backfillu), ale
--   20260814160000 krok 3-4 najprv pre-flight overil, že žiadny riadok nemá
--   company_id NULL (inak by celá migrácia zlyhala s
--   COMPANY_RLS_NULL_COMPANY_ID), a následne vykonal
--   `alter table public.ai_evidence alter column company_id set not null`.
--   Podľa dnešnej verziovanej schémy je teda `ai_evidence.company_id`
--   NOT NULL. Napriek tomu — na explicitnú žiadosť a ako obrana proti
--   budúcemu schema driftu / ručným DB zásahom / nekonzistentným dátam —
--   helper funkcie NIKDY nepredpokladajú NOT NULL a namiesto
--   `count(distinct company_id) = 0 → draft` explicitne rozlišujú:
--     A) referenced_row_count = 0
--        → žiadny ai_evidence riadok pre photo_url → skutočný draft →
--          iba pôvodný nahrávateľ.
--     B) referenced_row_count > 0 A (null_company_count > 0 ALEBO
--        distinct_company_count <> 1)
--        → existuje aspoň 1 riadok, ale dáta sú nekonzistentné (niektorý
--          riadok má company_id IS NULL, alebo existuje viac než jeden
--          distinct non-null company_id) → FAIL-CLOSED, vždy false, bez
--          ohľadu na rolu callera. Objekt JE referencovaný, preto sa NIKDY
--          nesmie spadnúť do uploader/draft fallbacku.
--     C) referenced_row_count > 0 A null_company_count = 0 A
--        distinct_company_count = 1
--        → presne jedna, jednoznačná non-null company_id → autorizácia
--          podľa tej company (READ = aktívny member, DELETE = aktívny
--          owner/admin).
--   `count(distinct ...)` ignoruje NULL hodnoty (bežná Postgres sémantika)
--   — preto sa null_company_count počíta OSOBITNE (`count(*) filter (where
--   company_id is null)`) a nikdy sa nespolieha na to, že "distinct = 0"
--   automaticky znamená draft.
--
-- OPRAVA (táto migrácia, rovnaký vzor ako 20260827140000):
--   Draft/finalizovaný rozlíšenie AJ finálna autorizácia sa presúvajú do
--   dvoch SECURITY DEFINER helper funkcií, ktoré bežia MIMO
--   ai_evidence_select_company/company_members_select_own RLS.
--
-- INSERT (jediná ďalšia policy na tomto buckete) sa NEMENÍ — zostáva
-- pôvodná "vlastný priečinok = auth.uid()" (dashboard-era, zdokumentovaná v
-- docs/db/schema-baseline-2026-08-12.md §9), s AI Evidencia upload/scan
-- flow nesúvisí táto oprava vôbec.
--
-- DROP — iba explicitné, idempotentné mená. Produkčný pg_policies audit
-- potvrdil presné aktuálne mená (ai_evidence_documents_select_company,
-- ai_evidence_documents_delete_company) — žiadny dynamický "nájdi a zruš
-- čokoľvek, čoho qual obsahuje názov bucketu" blok.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helper funkcie
-- -----------------------------------------------------------------------------

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
  -- preto sa počítajú explicitné agregáty namiesto LIMIT 1.
  select
    count(*),
    count(*) filter (where ae.company_id is null),
    count(distinct ae.company_id),
    max(ae.company_id)
  into
    v_referenced_row_count,
    v_null_company_count,
    v_distinct_company_count,
    v_company_id
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

  -- C) Presne jedna, jednoznačná non-null company_id → READ pre
  -- ktoréhokoľvek aktívneho člena tej firmy, bez rozlíšenia role (rovnaké
  -- pravidlo ako ai_evidence_select_company).
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
  'jednoznačná non-null company_id -> aktívny member tej company.';

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

  select
    count(*),
    count(*) filter (where ae.company_id is null),
    count(distinct ae.company_id),
    max(ae.company_id)
  into
    v_referenced_row_count,
    v_null_company_count,
    v_distinct_company_count,
    v_company_id
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

  -- C) DELETE pre finalizovaný objekt s jednoznačnou company_id: iba
  -- aktívny owner/admin tej firmy — zrkadlí ai_evidence_delete_owner_admin
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
  'pôvodný nahrávateľ.';

revoke all on function public.esblu_can_delete_ai_evidence_object(text) from public;
revoke all on function public.esblu_can_delete_ai_evidence_object(text) from anon;
grant execute on function public.esblu_can_delete_ai_evidence_object(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Policies — nahradenie SELECT + DELETE pre ai-evidence-documents.
--    INSERT sa NEDOTÝKA (zostáva pôvodná "vlastný priečinok = auth.uid()").
--    Iba explicitné, idempotentné DROP — presné aktuálne mená potvrdené
--    produkčným pg_policies auditom.
-- -----------------------------------------------------------------------------

drop policy if exists ai_evidence_documents_select_own on storage.objects;
drop policy if exists ai_evidence_documents_select_company on storage.objects;
drop policy if exists ai_evidence_documents_delete_own on storage.objects;
drop policy if exists ai_evidence_documents_delete_company on storage.objects;

create policy ai_evidence_documents_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ai-evidence-documents'
    and public.esblu_can_read_ai_evidence_object(name)
  );

create policy ai_evidence_documents_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ai-evidence-documents'
    and public.esblu_can_delete_ai_evidence_object(name)
  );

commit;
