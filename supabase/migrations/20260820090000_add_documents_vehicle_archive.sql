begin;

-- =============================================================================
-- Esblu — PZP/TP: dátovo definované vyradenie z Inbox listingu (nie iba
-- frontendový filter)
-- =============================================================================
-- Kontext (revízia predchádzajúceho riešenia): PZP a technický preukaz sa po
-- potvrdení a priradení k vozidlu naďalej zobrazovali aj ako samostatná
-- položka v Inboxe — pôvodná oprava to riešila iba klientským filtrom
-- (otherDocumentsFlatList v app/ai-evidencia/page.tsx), čo NIE JE dátovo
-- definovaný výsledný stav, iba kozmetické skrytie v jednom mieste UI.
--
-- Táto migrácia pridáva:
--   1. public.documents.archived_from_inbox_at (nullable timestamptz) —
--      NULL = dokument je bežná Inbox položka (default pre VŠETKY typy
--      dokumentov vrátane insurance/vehicle_registration pred priradením).
--      NOT NULL = dokument bol reklasifikovaný ako vlastníctvo vozidla
--      (PZP/TP po potvrdení) a nemá sa zobrazovať vo všeobecnom Inbox
--      zozname — zostáva JEDEN canonical riadok v public.documents (žiadna
--      duplicita, žiadny nový Storage objekt), naďalej dostupný cez
--      public.document_links z detailu vozidla. Hodnota timestampu je audit
--      informácia "kedy bol dokument vyradený z Inboxu".
--   2. public.esblu_finalize_vehicle_document(document_id, vehicle_id) —
--      SECURITY DEFINER funkcia, ktorá ATOMICKY (jedna DB transakcia):
--        a) overí, že dokument patrí do aktívnej firmy volajúceho, nie je
--           zmazaný a je typu 'insurance' alebo 'vehicle_registration',
--        b) overí, že vozidlo patrí do tej istej firmy,
--        c) idempotentne upsertne primary document_links riadok
--           (ON CONFLICT na existujúci partial unique index — bezpečné pri
--           retry/double-submit, nikdy nevytvorí duplicitný link),
--        d) nastaví archived_from_inbox_at = coalesce(existujúca hodnota, now())
--           — idempotentné, pôvodný čas prvého vyradenia sa pri opakovanom
--           volaní nemení.
--      DÔVOD SECURITY DEFINER: public.documents má UPDATE obmedzený iba na
--      owner/admin (documents_update_owner_admin, 20260814160000) — bežný
--      employee preto NEMÔŽE priamym UPDATE-om nastaviť
--      archived_from_inbox_at, hoci employee smie PZP flow v Inboxe
--      dokončiť (existujúce pravidlo, nemenené touto migráciou). Funkcia
--      preto beží so zvýšeným oprávnením, ale INTERNE vynucuje presne tie
--      isté autorizačné pravidlá, aké dnes platia pre document_links INSERT
--      (ktorýkoľvek aktívny člen firmy, žiadna zmena rozsahu oprávnení) —
--      nejde o všeobecné obídenie RLS, iba o úzko vymedzenú operáciu.
--      auth.uid()/esblu_my_active_company_id() vo funkcii vždy odkazujú na
--      PÔVODNÉHO volajúceho (SECURITY DEFINER mení iba vykonávacie
--      oprávnenie, nie session/JWT kontext), takže funkcia nemôže byť
--      zneužitá na krížovo-firemný prístup.
--
-- Táto migrácia je čisto ADITÍVNA:
--   - nový nullable stĺpec s default NULL (žiadny existujúci riadok sa
--     nemení, žiadny existujúci dopyt sa nesprávanie nezmení, pokiaľ ho
--     appka sama nezačne filtrovať podľa neho),
--   - nová funkcia, žiadna existujúca RLS policy sa nemení ani neoslabuje,
--   - NEMENÍ documents_update_owner_admin ani žiadnu inú policy — bežný
--     klientský UPDATE na documents zostáva rovnako obmedzený ako doteraz,
--     jediná cesta k nastaveniu archived_from_inbox_at je táto funkcia.
--
-- Transakčná bezpečnosť (double-submit/retry/refresh/DB chyba/Storage
-- chyba): Storage upload a INSERT do documents prebiehajú v appke PRED
-- volaním tejto funkcie (nezmenené, existujúci vzor) — funkcia sa volá AŽ
-- PO úspešnom uložení dokumentu, takže nikdy nehrozí destruktívny cleanup
-- zdroja pred potvrdením linku. Ak volanie funkcie zlyhá (napr. výpadok
-- siete), dokument aj tak existuje s archived_from_inbox_at = NULL, teda
-- bezpečne zostáva viditeľný v Inboxe a používateľ môže priradenie
-- zopakovať bez rizika duplicitného/nekonzistentného stavu (ON CONFLICT
-- upsert nižšie zaručuje, že opakované volanie nikdy nevytvorí druhý link).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. documents.archived_from_inbox_at
-- -----------------------------------------------------------------------------

alter table public.documents
  add column if not exists archived_from_inbox_at timestamptz null;

comment on column public.documents.archived_from_inbox_at is
  'NULL = dokument sa zobrazuje vo všeobecnom Inbox zozname (predvolené pre '
  'všetky typy). NOT NULL = dokument bol reklasifikovaný ako vlastníctvo '
  'cieľovej entity (dnes iba PZP/TP priradené k vozidlu, cez '
  'esblu_finalize_vehicle_document) a v Inbox zozname sa nemá zobrazovať — '
  'zostáva jediný canonical riadok, prístupný cez document_links z detailu '
  'vozidla. Hodnota je audit informácia (kedy k vyradeniu došlo), nikdy sa '
  'nemení priamym klientským UPDATE (documents UPDATE je owner/admin '
  'only) — nastavuje ju výhradne esblu_finalize_vehicle_document().';

-- Partial index presne pre dopyt "moje aktívne Inbox dokumenty" (rovnaký
-- vzor ako documents_user_active_created_idx) — dokumenty vyradené do
-- archívu vozidla sa doň nezapočítavajú, takže ostáva malý aj pri raste
-- počtu priradených PZP/TP.
create index if not exists documents_company_inbox_visible_idx
  on public.documents (company_id, created_at desc)
  where deleted_at is null and archived_from_inbox_at is null;


-- -----------------------------------------------------------------------------
-- 2. esblu_finalize_vehicle_document(document_id, vehicle_id)
-- -----------------------------------------------------------------------------

create or replace function public.esblu_finalize_vehicle_document(
  p_document_id uuid,
  p_vehicle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_document_type text;
  v_document_deleted_at timestamptz;
  v_link_id uuid;
  v_archived_at timestamptz;
begin
  if p_document_id is null or p_vehicle_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_MISSING_ARGUMENT';
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_NO_ACTIVE_COMPANY',
      hint = 'Volajúci nemá aktívny company_members riadok.';
  end if;

  select d.document_type, d.deleted_at
    into v_document_type, v_document_deleted_at
  from public.documents d
  where d.id = p_document_id
    and d.company_id = v_company_id;

  if v_document_type is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_DOCUMENT_NOT_FOUND',
      hint = 'Dokument neexistuje alebo nepatrí do aktívnej firmy volajúceho.';
  end if;

  if v_document_deleted_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_DOCUMENT_DELETED';
  end if;

  if v_document_type not in ('insurance', 'vehicle_registration') then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_UNSUPPORTED_DOCUMENT_TYPE',
      hint = 'Funkcia je vymedzená iba pre PZP a technický preukaz — iné typy dokumentov ňou nemožno reklasifikovať.';
  end if;

  if not exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.company_id = v_company_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_VEHICLE_NOT_FOUND',
      hint = 'Vozidlo neexistuje alebo nepatrí do aktívnej firmy volajúceho.';
  end if;

  -- Idempotentný upsert primary linku — zodpovedá partial unique indexu
  -- document_links_unique_vehicle (document_id, link_type, vehicle_id) WHERE
  -- vehicle_id IS NOT NULL, definovanému v 20260812150000. Retry/double-submit
  -- teda nikdy nevytvorí druhý riadok, iba potvrdí ten istý.
  insert into public.document_links (
    user_id, company_id, document_id, vehicle_id, link_type, confirmed_by_user
  )
  values (
    auth.uid(), v_company_id, p_document_id, p_vehicle_id, 'primary', true
  )
  on conflict (document_id, link_type, vehicle_id)
    where vehicle_id is not null
  do update set confirmed_by_user = true
  returning id into v_link_id;

  update public.documents
  set archived_from_inbox_at = coalesce(archived_from_inbox_at, now())
  where id = p_document_id
  returning archived_from_inbox_at into v_archived_at;

  insert into public.document_review_log (
    document_id, document_ref, user_id, action
  )
  values (p_document_id, p_document_id, auth.uid(), 'linked');

  return jsonb_build_object(
    'document_link_id', v_link_id,
    'archived_from_inbox_at', v_archived_at
  );
end;
$function$;

comment on function public.esblu_finalize_vehicle_document(uuid, uuid) is
  'Atomicky priradí potvrdený PZP/TP dokument (public.documents, typ '
  'insurance alebo vehicle_registration) k vozidlu (upsert primary '
  'document_links riadok) a reklasifikuje ho mimo Inbox listingu '
  '(documents.archived_from_inbox_at). SECURITY DEFINER iba kvôli '
  'documents UPDATE (owner/admin only) — autorizácia dnu je rovnaká ako pri '
  'document_links INSERT (ktorýkoľvek aktívny člen firmy dokumentu aj '
  'vozidla). Idempotentné — bezpečné pri retry/double-submit/refresh.';

revoke all on function public.esblu_finalize_vehicle_document(uuid, uuid) from public;
revoke all on function public.esblu_finalize_vehicle_document(uuid, uuid) from anon;
grant execute on function public.esblu_finalize_vehicle_document(uuid, uuid) to authenticated;

commit;
