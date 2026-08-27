begin;

-- =============================================================================
-- Oprava: SELECT/DELETE autorizácia pre storage.objects (bucket
-- ai-inbox-documents) cez SECURITY DEFINER helper funkcie — nie cez inline
-- EXISTS/NOT EXISTS subquery priamo v RLS policy.
-- =============================================================================
-- HISTÓRIA TEJTO OPRAVY (dve po sebe idúce, produkčne potvrdené zistenia):
--
-- (1) PÔVODNÝ ROOT CAUSE (potvrdené produkčne cez pg_policies + presný
--     read-only prepočet EXISTS podmienky pre konkrétny employee_uid/
--     uploader_uid): ai_inbox_documents_select_company (20260814170000)
--     odvodzoval READ pre finalizovaný objekt cez join DVOCH riadkov
--     company_members (caller_cm + owner_cm, kde owner_cm mal reprezentovať
--     PÔVODNÉHO NAHRÁVATEĽA, teda iného používateľa než caller). Pretože
--     public.company_members má vlastnú SELECT RLS company_members_select_own
--     (using (user_id = auth.uid())) a táto sa vynucuje AJ vnútri subquery
--     spustenej z inej (storage.objects) policy, owner_cm sa mohol pri
--     reálnom "authenticated" vykonaní vždy vyhodnotiť len ako VLASTNÝ riadok
--     callera — nikdy riadok iného používateľa. Pre employee (caller !=
--     nahrávateľ) preto EXISTS vždy vyšla false, aj keď obaja boli aktívni v
--     tej istej firme (owner testujúci seba samého to maskoval, lebo tam
--     caller == nahrávateľ). Presne pred týmto vzorom (cross-user join na
--     company_members mimo SECURITY DEFINER funkcie) varuje aj komentár pri
--     company_members_select_own v 20260814110000.
--
-- (2) DRUHÉ, NEZÁVISLÉ ZISTENIE (nájdené pri review OPRAVY (1), predtým než
--     bola nasadená): náhrada v (1) síce viazala READ finalizovaného objektu
--     na autoritatívny company_id z documents/document_attachments riadku
--     (namiesto membershipu nahrávateľa), ale draft/finalizovaný rozlíšenie
--     zostalo tvaru:
--       not exists (select 1 from public.documents d where ... )
--       and not exists (select 1 from public.document_attachments da where ...)
--     Tieto subquery sú SAMY osebe pod bežnou RLS týchto tabuliek —
--     documents_select_company: using (company_id = esblu_my_active_company_id())
--     document_attachments_select_company: using (company_id = esblu_my_active_company_id())
--     — teda presne ten istý druh obmedzenia ako v bode (1), len na inej
--     tabuľke. Ak je objekt v skutočnosti FINALIZOVANÝ a patrí firme A, ale
--     caller nemá aktívny membership vo firme A (napr. bývalý nahrávateľ,
--     ktorý medzičasom odišiel/zmenil firmu), caller cez RLS documents
--     tento riadok vôbec nevidí → NOT EXISTS chybne vyjde TRUE → objekt sa
--     nesprávne vyhodnotí ako "draft" → keďže (storage.foldername(name))[1]
--     sa zhoduje s jeho auth.uid() (bol pôvodný nahrávateľ), dostal by READ
--     (cross-company read) a v DELETE policy dokonca DELETE (cross-company
--     delete) na finalizovaný objekt firmy, ktorej už nie je členom. Fail-
--     closed tenant isolation to porušuje rovnako vážne ako bod (1).
--
-- OPRAVA (táto revízia): draft/finalizovaný rozlíšenie AJ finálna
-- autorizácia sa presúvajú do dvoch malých SECURITY DEFINER helper funkcií
-- (esblu_can_read_ai_inbox_object / esblu_can_delete_ai_inbox_object), ktoré
-- bežia mimo RLS ownera funkcie (rovnaký, už v projekte zavedený a overený
-- vzor ako esblu_my_active_company_id()/esblu_my_active_role(), ktoré sa
-- používajú PRIAMO vo vnútri documents_select_company a desiatok ďalších
-- policy naprieč projektom — teda dokázane bezpečný a bežný vzor, nie nový
-- experiment). Vo vnútri funkcie:
--   - auth.uid() sa číta explicitne na začiatku (v_uid) — nikdy sa
--     nespolieha na žiadny parameter od klienta pre identitu callera;
--     jediný parameter (p_object_name) je iba cesta v Storage, nie identita.
--   - SELECT proti documents/document_attachments beží ako SECURITY
--     DEFINER, teda BEZ orezania cez documents_select_company/
--     document_attachments_select_company RLS — existencia riadku (a jeho
--     company_id) sa tak zisťuje autoritatívne, nezávisle od toho, čo by
--     caller bežne videl.
--   - Ak je objekt referencovaný (documents ALEBO document_attachments),
--     READ/DELETE sa autorizuje výhradne cez aktívny membership (a pri
--     DELETE navyše rolu owner/admin) v company_members pre TEN istý
--     company_id, aký má DB riadok — opäť SECURITY DEFINER, takže ani tu
--     neplatí orezanie company_members_select_own.
--   - Iba ak objekt NIE JE referencovaný v žiadnej z oboch tabuliek
--     (autoritatívne, nie "caller ho nevidí"), ide o draft a READ/DELETE
--     smie iba pôvodný nahrávateľ ((storage.foldername(name))[1] = auth.uid()).
--
-- INSERT/UPDATE (ai_inbox_documents_insert_own / ..._update_own) sa touto
-- migráciou NEMENIA — tie riadia iba draft-upload flow do VLASTNÉHO
-- priečinka nahrávateľa (pred finalizáciou), s opravovaným bugom nesúvisia.
--
-- Migrácia je idempotentná a nezávislá od toho, ktorá presná kombinácia
-- policy dnes v produkcii existuje — explicitne dropne SELECT aj DELETE
-- policy pre ai-inbox-documents pod VŠETKÝMI doterajšími menami.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helper funkcie
-- -----------------------------------------------------------------------------

create or replace function public.esblu_can_read_ai_inbox_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_uploader_uid text;
  v_document_company_id uuid;
  v_attachment_company_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  v_uploader_uid := (storage.foldername(p_object_name))[1];

  -- Referencovaný cez documents — SECURITY DEFINER, beží MIMO
  -- documents_select_company RLS, takže company_id je autoritatívny bez
  -- ohľadu na to, čo by caller bežne videl.
  select d.company_id
  into v_document_company_id
  from public.documents d
  where d.storage_bucket = 'ai-inbox-documents'
    and d.storage_path = p_object_name
  limit 1;

  if v_document_company_id is not null then
    return exists (
      select 1
      from public.company_members cm
      where cm.user_id = v_uid
        and cm.status = 'active'
        and cm.company_id = v_document_company_id
    );
  end if;

  -- Referencovaný cez document_attachments (rovnaký princíp).
  select da.company_id
  into v_attachment_company_id
  from public.document_attachments da
  where da.storage_bucket = 'ai-inbox-documents'
    and da.storage_path = p_object_name
  limit 1;

  if v_attachment_company_id is not null then
    return exists (
      select 1
      from public.company_members cm
      where cm.user_id = v_uid
        and cm.status = 'active'
        and cm.company_id = v_attachment_company_id
    );
  end if;

  -- Nereferencovaný nikde = draft — iba pôvodný nahrávateľ.
  return v_uploader_uid = v_uid::text;
end;
$function$;

comment on function public.esblu_can_read_ai_inbox_object(text) is
  'Autoritatívne (mimo RLS documents/document_attachments/company_members) '
  'rozhodne, či prihlásený používateľ (auth.uid()) smie READ storage objekt '
  'v bucket ai-inbox-documents na danej ceste: referencovaný objekt -> '
  'aktívny member firmy, ktorej DB riadok patrí; nereferencovaný draft -> '
  'iba pôvodný nahrávateľ podľa prvého segmentu cesty.';

revoke all on function public.esblu_can_read_ai_inbox_object(text) from public;
grant execute on function public.esblu_can_read_ai_inbox_object(text) to authenticated;


create or replace function public.esblu_can_delete_ai_inbox_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_uploader_uid text;
  v_document_company_id uuid;
  v_attachment_company_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  v_uploader_uid := (storage.foldername(p_object_name))[1];

  select d.company_id
  into v_document_company_id
  from public.documents d
  where d.storage_bucket = 'ai-inbox-documents'
    and d.storage_path = p_object_name
  limit 1;

  if v_document_company_id is not null then
    return exists (
      select 1
      from public.company_members cm
      where cm.user_id = v_uid
        and cm.status = 'active'
        and cm.role in ('owner', 'admin')
        and cm.company_id = v_document_company_id
    );
  end if;

  select da.company_id
  into v_attachment_company_id
  from public.document_attachments da
  where da.storage_bucket = 'ai-inbox-documents'
    and da.storage_path = p_object_name
  limit 1;

  if v_attachment_company_id is not null then
    return exists (
      select 1
      from public.company_members cm
      where cm.user_id = v_uid
        and cm.status = 'active'
        and cm.role in ('owner', 'admin')
        and cm.company_id = v_attachment_company_id
    );
  end if;

  -- Nereferencovaný draft — iba pôvodný nahrávateľ smie zmazať.
  return v_uploader_uid = v_uid::text;
end;
$function$;

comment on function public.esblu_can_delete_ai_inbox_object(text) is
  'Autoritatívne (mimo RLS documents/document_attachments/company_members) '
  'rozhodne, či prihlásený používateľ (auth.uid()) smie DELETE storage '
  'objekt v bucket ai-inbox-documents na danej ceste: referencovaný objekt '
  '-> iba aktívny owner/admin firmy, ktorej DB riadok patrí; nereferencovaný '
  'draft -> iba pôvodný nahrávateľ podľa prvého segmentu cesty.';

revoke all on function public.esblu_can_delete_ai_inbox_object(text) from public;
grant execute on function public.esblu_can_delete_ai_inbox_object(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Policies — nahradenie všetkých doterajších verzií (pôvodné aj
--    company-aware mená), volajú výhradne helper funkcie vyššie.
-- -----------------------------------------------------------------------------

drop policy if exists ai_inbox_documents_select_own on storage.objects;
drop policy if exists ai_inbox_documents_select_company on storage.objects;
drop policy if exists ai_inbox_documents_delete_own on storage.objects;
drop policy if exists ai_inbox_documents_delete_company on storage.objects;

create policy ai_inbox_documents_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ai-inbox-documents'
    and public.esblu_can_read_ai_inbox_object(name)
  );

create policy ai_inbox_documents_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ai-inbox-documents'
    and public.esblu_can_delete_ai_inbox_object(name)
  );

commit;
