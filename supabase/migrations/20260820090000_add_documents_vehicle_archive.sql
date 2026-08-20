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
--   2. Idempotentný audit log priradenia — partial unique expression index
--      na document_review_log (document_ref, action='linked', cieľové
--      vozidlo z new_value), pozri sekciu 2 nižšie. Rieši, že retry/
--      double-submit RPC z bodu 4 by inak pri každom volaní vložil ďalší
--      'linked' riadok pre ten istý dokument+vozidlo.
--   3. Invariant "najviac jeden primary vehicle link na jeden dokument" —
--      nový partial unique index na document_links(document_id) WHERE
--      link_type='primary' AND vehicle_id IS NOT NULL, pozri sekciu 3
--      nižšie. DRUHÁ REVÍZIA (pozri REVÍZIA 2 nižšie): existujúci partial
--      unique index document_links_unique_vehicle (document_id, link_type,
--      vehicle_id) bránil iba presnej duplicite (ten istý dokument NA TO
--      ISTÉ vozidlo dvakrát), nie stavu, keď by jeden dokument mal primary
--      link na DVE rôzne vozidlá súčasne — čo by pre PZP/TP archívny flow
--      (jeden canonical dokument = jedno vozidlo) bolo nekonzistentné.
--   4. public.esblu_finalize_vehicle_document(document_id, vehicle_id) —
--      SECURITY DEFINER funkcia, ktorá ATOMICKY (jedna DB transakcia):
--        a) overí, že dokument patrí do aktívnej firmy volajúceho, nie je
--           zmazaný a je typu 'insurance' alebo 'vehicle_registration',
--        b) overí, že vozidlo patrí do tej istej firmy,
--        c) AUTORIZÁCIA (pozri REVÍZIA nižšie) — employee: iba pre
--           dokument, ktorý SÁM vytvoril (documents.user_id = auth.uid())
--           a ktorý ešte nie je finalizovaný (archived_from_inbox_at is
--           null), ALEBO ide o bezpečný retry toho istého dokumentu na TO
--           ISTÉ vozidlo (existujúci primary document_links riadok na
--           p_vehicle_id). Employee nikdy nemôže finalizovať cudzí
--           dokument ani presunúť už finalizovaný dokument na iné vozidlo.
--        d) INVARIANT "jeden dokument = najviac jedno primary vozidlo"
--           (pozri REVÍZIA 2 nižšie) — PRE VŠETKY role vrátane owner/admin:
--           ak dokument už má primary vehicle link na INÉ vozidlo než
--           p_vehicle_id, funkcia zlyhá s
--           ESBLU_DOCUMENT_ALREADY_LINKED_TO_OTHER_VEHICLE a nič nezapíše.
--           Retry na TO ISTÉ vozidlo prejde (idempotentné). Táto RPC
--           zámerne nezavádza "presun dokumentu medzi vozidlami" — na to
--           by mal v budúcnosti slúžiť samostatný, explicitný edit/reassign
--           flow, nie táto finalization funkcia.
--        e) idempotentne upsertne primary document_links riadok
--           (ON CONFLICT na existujúci partial unique index — bezpečné pri
--           retry/double-submit, nikdy nevytvorí duplicitný link; obalené
--           v EXCEPTION bloku pre unique_violation z nového indexu zo
--           sekcie 3, ako race-condition poistka voči bodu (d)),
--        f) nastaví archived_from_inbox_at = coalesce(existujúca hodnota, now())
--           — idempotentné, pôvodný čas prvého vyradenia sa pri opakovanom
--           volaní nemení,
--        g) idempotentne vloží audit riadok do document_review_log (ON
--           CONFLICT DO NOTHING na index zo sekcie 2 — retry nikdy
--           nevytvorí druhý 'linked' záznam pre ten istý dokument+vozidlo).
--      DÔVOD SECURITY DEFINER: public.documents má UPDATE obmedzený iba na
--      owner/admin (documents_update_owner_admin, 20260814160000) — bežný
--      employee preto NEMÔŽE priamym UPDATE-om nastaviť
--      archived_from_inbox_at, hoci employee smie PZP flow v Inboxe
--      dokončiť (existujúce pravidlo, nemenené touto migráciou). Funkcia
--      preto beží so zvýšeným oprávnením, ale INTERNE vynucuje vlastnú,
--      užšiu autorizáciu popísanú v bode (c) vyššie — nejde o všeobecné
--      obídenie RLS, iba o úzko vymedzenú operáciu.
--      auth.uid()/esblu_my_active_company_id()/esblu_my_active_role() vo
--      funkcii vždy odkazujú na PÔVODNÉHO volajúceho (SECURITY DEFINER mení
--      iba vykonávacie oprávnenie, nie session/JWT kontext), takže funkcia
--      nemôže byť zneužitá na krížovo-firemný prístup.
--
--      REVÍZIA (bezpečnostná oprava pred prvým nasadením do produkcie —
--      táto migrácia ešte nebola aplikovaná, preto sa upravuje priamo tu,
--      nie samostatnou opravnou migráciou): pôvodná verzia funkcie overovala
--      iba firmu dokumentu/vozidla a typ dokumentu — akýkoľvek aktívny
--      employee firmy tak mohol zavolať RPC nad ĽUBOVOĽNÝM PZP/TP
--      dokumentom firmy (aj cudzím, aj už finalizovaným) iba na základe
--      znalosti jeho UUID, a teoreticky ho tak reklasifikovať/presunúť na
--      iné vozidlo. Existujúci dátový model už poskytuje presne to, čo je
--      na bezpečnú opravu treba — documents.user_id (kto dokument vytvoril,
--      nastavené appkou pri INSERTe, nemenné) a archived_from_inbox_at
--      (či je dokument už finalizovaný) — preto nebol pridaný žiadny nový
--      stĺpec ani stavový model, iba use-case-špecifická podmienka v RPC.
--      Documents.status (uploaded/processing/extracted/needs_review/
--      confirmed/failed) zámerne NIE JE súčasťou tejto podmienky — appka
--      vytvára documents riadok pre PZP/TP AŽ v momente, keď používateľ v
--      Inbox UI already recenzoval/opravil polia a klikol Uložiť (INSERT aj
--      finalize RPC idú v tom istom klientskom volaní), takže status v tomto
--      bode nerozlišuje "rozpracované" od "hotové" — jediné spoľahlivé
--      rozlíšenie je archived_from_inbox_at (finalizované RPC volaním) a
--      user_id (kto ho vytvoril).
--
--      REVÍZIA 2 (druhá bezpečnostná/dátová oprava pred prvým nasadením —
--      opäť priamo v tejto ešte neaplikovanej migrácii): existujúci partial
--      unique index document_links_unique_vehicle je (document_id,
--      link_type, vehicle_id) WHERE vehicle_id IS NOT NULL — bráni iba
--      DUPLICITE presne tej istej trojice, čiže nedovolí vložiť ten istý
--      (dokument, vozidlo) riadok dvakrát, ale VÔBEC nebráni tomu, aby ten
--      istý dokument mal DVA primary riadky na DVE rôzne vozidlá (dva rôzne
--      riadky, každý s iným vehicle_id, teda iným kľúčom v tomto indexe).
--      Pre PZP/TP archívny flow to je nekonzistentné — jeden canonical
--      insurance/vehicle_registration dokument smie mať najviac jeden
--      primary vehicle link. Audit ostatných document_links use-casov
--      (document_links_unique_machine/inventory_item/vehicle_service/
--      machine_service, všetky z 20260812150000): appka dnes vkladá
--      link_type='primary' aj pre priradenie k STROJU (plain document_links
--      insert v app/ai-evidencia/page.tsx, mimo tejto RPC), takže nový
--      invariant sa ZÁMERNE obmedzuje iba na riadky s vehicle_id IS NOT
--      NULL — nedotýka sa primary liniek na machine/inventory_item/
--      vehicle_service/machine_service, žiadna regresia týchto modulov.
--      V praxi navyše appka nikdy nevytvára viac než jeden primary link na
--      jeden dokument (document_id je vždy čerstvo vygenerované UUID tesne
--      pred prvým a jediným document_links insertom pre daný dokument —
--      pozri REVÍZIA vyššie), tento invariant je preto čisto preventívny
--      DB-level fail-safe, nie oprava reálne pozorovaného dátového stavu.
--
-- Táto migrácia je čisto ADITÍVNA:
--   - nový nullable stĺpec s default NULL (žiadny existujúci riadok sa
--     nemení, žiadny existujúci dopyt sa nesprávanie nezmení, pokiaľ ho
--     appka sama nezačne filtrovať podľa neho),
--   - nová funkcia, dva nové partial unique indexy (jeden na existujúcom
--     stĺpci document_review_log.new_value, druhý na existujúcom stĺpci
--     document_links.document_id) — žiadna existujúca RLS policy sa
--     nemení ani neoslabuje,
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
-- Riadok dokumentu sa vo funkcii navyše zamyká cez SELECT ... FOR UPDATE
-- (pozri sekciu 4), takže dva súbežné (paralelné) volania nad tým istým
-- document_id sa serializujú — druhé volanie vidí až commitnutý výsledok
-- prvého, nie medzi-stav, takže autorizačná podmienka aj upsert linku
-- ostávajú konzistentné aj pri skutočnom race condition, nielen pri
-- sekvenčnom retry.
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
-- 2. document_review_log — idempotentný audit log pre action='linked'
-- -----------------------------------------------------------------------------
-- Problém: pôvodná funkcia vkladala pri KAŽDOM volaní nový
-- document_review_log riadok s action='linked', takže retry/double-submit
-- vytváral duplicitné audit záznamy pre tú istú operáciu (dokument +
-- vozidlo). document_review_log v súčasnosti nemá samostatný vehicle_id
-- stĺpec (iba document_id/document_ref + generický new_value jsonb) —
-- pridávanie nového stĺpca preto nie je potrebné: cieľové vozidlo sa
-- ukladá do už existujúceho new_value ({"vehicle_id": "<uuid>"}) a
-- jedinečnosť sa vynúti expression indexom nad týmto poľom, obmedzeným
-- iba na action='linked' (partial index — ostatné action hodnoty, napr.
-- 'created', nie sú týmto pravidlom nijako dotknuté).
--
-- Prečo DB unique index (nie iba "insert ... where not exists" v appke
-- alebo v tele funkcie): "where not exists" kontrola a nasledujúci insert
-- nie sú v rámci jednej transakcie atomické voči INEJ súbežnej transakcii
-- so stejným document_id (obe môžu prejsť "not exists" kontrolou skôr, než
-- ktorákoľvek z nich commitne insert) — pri retry/double-submit z dvoch
-- paralelných HTTP requestov (napr. dvojklik / retry po timeoute, kde
-- odpoveď na prvý request v skutočnosti prišla) by tak mohol vzniknúť
-- duplicitný log riadok napriek "not exists" kontrole. Skutočne
-- race-safe a zároveň najjednoduchšie riešenie je DB-level unique
-- constraint (tu: partial unique expression index) + `insert ... on
-- conflict ... do nothing` vo funkcii (sekcia 3) — Postgres garantuje
-- atomicitu tejto kombinácie aj pri súbežných transakciách.
--
-- Pre-flight (bezpečné pridanie unique indexu): touto migráciou sa iba
-- ZAVÁDZA action='linked' insert do document_review_log (predchádzajúci
-- kód appky pri PZP/TP flow vkladal iba action='created', pozri
-- app/ai-evidencia/page.tsx) — v produkcii preto dnes neexistuje ŽIADEN
-- riadok s action='linked', a teda ani žiadny konflikt, ktorý by bránil
-- vytvoreniu tohto indexu. Nasledujúca kontrola to explicitne overí a
-- migráciu zastaví (fail-closed), ak by predsa len existovali duplicity —
-- v takom prípade by bolo treba najprv ručne vyriešiť/zlúčiť staré riadky.
do $preflight_linked_audit$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count
  from (
    select document_ref, (new_value ->> 'vehicle_id') as vehicle_id
    from public.document_review_log
    where action = 'linked'
      and (new_value ->> 'vehicle_id') is not null
    group by document_ref, (new_value ->> 'vehicle_id')
    having count(*) > 1
  ) as duplicates;

  if duplicate_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_DUPLICATE_LINKED_AUDIT_ROWS:' || duplicate_count::text,
      hint = 'Existujú duplicitné document_review_log riadky (action=linked) pre ten istý dokument+vozidlo — pred touto migráciou treba ručne zlúčiť/odstrániť duplicity.';
  end if;
end
$preflight_linked_audit$;

create unique index if not exists document_review_log_linked_document_vehicle_uidx
  on public.document_review_log (document_ref, (new_value ->> 'vehicle_id'))
  where action = 'linked';

comment on index public.document_review_log_linked_document_vehicle_uidx is
  'Zaručuje najviac jeden action=linked audit riadok na (document_ref, '
  'vehicle_id z new_value). Používa esblu_finalize_vehicle_document() cez '
  '"insert ... on conflict ... do nothing" pre race-safe idempotenciu pri '
  'retry/double-submit. Riadky s NULL new_value->>vehicle_id (iné, '
  'nesúvisiace action=linked zápisy, ak nejaké v budúcnosti vzniknú mimo '
  'tejto funkcie) nie sú týmto indexom nijako obmedzené — NULL sa v '
  'unique indexe nikdy nepovažuje za rovný inému NULL.';


-- -----------------------------------------------------------------------------
-- 3. document_links — najviac jeden primary vehicle link na dokument
-- -----------------------------------------------------------------------------
-- Pozri REVÍZIA 2 v hlavičke migrácie pre plné zdôvodnenie. Zámerne úzky
-- invariant: WHERE vehicle_id IS NOT NULL obmedzuje index výhradne na
-- vehicle-primary riadky — primary linky na machine/inventory_item/
-- vehicle_service/machine_service (existujúce use-casy tej istej
-- link_type='primary' hodnoty, pozri 20260812150000) majú vehicle_id vždy
-- NULL, takže do tohto indexu vôbec nespadajú a nie sú ním nijako
-- obmedzené — žiadna regresia iných modulov.
--
-- Pre-flight (bezpečné pridanie unique indexu): kontrola nižšie overí, či
-- v produkcii existuje dokument s VIAC než jedným primary vehicle linkom.
-- Keďže táto migrácia (vrátane samotnej esblu_finalize_vehicle_document,
-- jediného miesta, ktoré primary vehicle linky vytvára) ešte nebola v
-- produkcii aplikovaná, očakávaný počet takýchto dokumentov je 0. Ak by
-- kontrola napriek tomu niečo našla (napr. ručne vložené dáta mimo tejto
-- appky), migrácia sa fail-closed zastaví BEZ automatického mazania alebo
-- hádania, ktoré vozidlo je "správne" — také duplicity treba vyriešiť
-- ručne (rozhodnúť, ktorý link je platný) pred opätovným spustením tejto
-- migrácie.
do $preflight_primary_vehicle_link$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count
  from (
    select document_id
    from public.document_links
    where link_type = 'primary'
      and vehicle_id is not null
    group by document_id
    having count(*) > 1
  ) as duplicates;

  if duplicate_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_DUPLICATE_PRIMARY_VEHICLE_LINKS:' || duplicate_count::text,
      hint = 'Existujú dokumenty s viac než jedným primary vehicle document_links riadkom — pred touto migráciou treba ručne rozhodnúť a odstrániť nadbytočné linky.';
  end if;
end
$preflight_primary_vehicle_link$;

create unique index if not exists document_links_unique_primary_vehicle_per_document
  on public.document_links (document_id)
  where link_type = 'primary' and vehicle_id is not null;

comment on index public.document_links_unique_primary_vehicle_per_document is
  'Zaručuje najviac jeden primary vehicle document_links riadok na jeden '
  'document_id (naprieč všetkými vozidlami, nielen v rámci toho istého '
  'vehicle_id — na rozdiel od document_links_unique_vehicle). Zámerne '
  'obmedzené na vehicle_id IS NOT NULL, takže primary linky na '
  'machine/inventory_item/vehicle_service/machine_service nie sú týmto '
  'indexom nijako dotknuté. Používa '
  'esblu_finalize_vehicle_document() ako DB-level fail-safe pri race '
  'condition popri explicitnom pre-check v tele funkcie.';


-- -----------------------------------------------------------------------------
-- 4. esblu_finalize_vehicle_document(document_id, vehicle_id)
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
  v_role text;
  v_document_type text;
  v_document_deleted_at timestamptz;
  v_document_user_id uuid;
  v_archived_before timestamptz;
  v_existing_vehicle_id uuid;
  v_link_id uuid;
  v_archived_at timestamptz;
begin
  if p_document_id is null or p_vehicle_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_MISSING_ARGUMENT';
  end if;

  v_company_id := public.esblu_my_active_company_id();
  v_role := public.esblu_my_active_role();

  if v_company_id is null or v_role is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_NO_ACTIVE_COMPANY',
      hint = 'Volajúci nemá aktívny company_members riadok.';
  end if;

  -- SELECT ... FOR UPDATE — zamyká riadok dokumentu na dĺžku transakcie.
  -- Dve súbežné volania nad tým istým document_id sa tak serializujú:
  -- druhé volanie počká, kým prvé commitne/rollbackne, a až potom číta
  -- (už aktuálny) v_document_user_id/v_archived_before nižšie. Bez tohto
  -- zámku by dve naozaj paralelné volania mohli obe vyhodnotiť
  -- autorizáciu nad rovnakým (ešte nekomitnutým) "nefinalizovaný" stavom
  -- a teoreticky finalizovať dokument na dve rôzne vozidlá súčasne.
  select d.document_type, d.deleted_at, d.user_id, d.archived_from_inbox_at
    into v_document_type, v_document_deleted_at, v_document_user_id, v_archived_before
  from public.documents d
  where d.id = p_document_id
    and d.company_id = v_company_id
  for update;

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

  -- Existujúci primary vehicle link tohto dokumentu (ak nejaký) — najviac
  -- jeden takýto riadok môže existovať vďaka
  -- document_links_unique_primary_vehicle_per_document (sekcia 3), LIMIT 1
  -- je čisto obranná poistka.
  select dl.vehicle_id
    into v_existing_vehicle_id
  from public.document_links dl
  where dl.document_id = p_document_id
    and dl.link_type = 'primary'
    and dl.vehicle_id is not null
  limit 1;

  -- Autorizácia (fail-closed) — pozri REVÍZIA v hlavičke migrácie.
  --   owner/admin: bez dodatočného obmedzenia navyše (zhodné s ich
  --   existujúcim plným prístupom na documents/document_links priamym
  --   UPDATE-om), OKREM invariantu nižšie, ktorý platí pre všetkých.
  --   employee: iba na VLASTNÝ dokument (ktorý sám vytvoril), a to buď
  --   ešte nefinalizovaný, alebo bezpečný retry na TO ISTÉ vozidlo, na
  --   ktoré už bol raz finalizovaný. Employee nikdy nezíska právo
  --   finalizovať cudzí dokument ani presunúť už finalizovaný dokument na
  --   iné vozidlo, čo aj pri znalosti UUID dokumentu.
  if v_role in ('owner', 'admin') then
    null; -- bez dodatočného obmedzenia navyše (pozri invariant nižšie)
  elsif v_role = 'employee' then
    if v_document_user_id is distinct from auth.uid() then
      raise exception using
        errcode = 'P0001',
        message = 'ESBLU_FORBIDDEN_NOT_DOCUMENT_OWNER',
        hint = 'Employee smie finalizovať iba dokument, ktorý sám vytvoril.';
    end if;

    if v_archived_before is not null
      and not exists (
        select 1
        from public.document_links dl
        where dl.document_id = p_document_id
          and dl.link_type = 'primary'
          and dl.vehicle_id = p_vehicle_id
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'ESBLU_FORBIDDEN_ALREADY_FINALIZED',
        hint = 'Dokument je už finalizovaný na iné vozidlo — employee ho nemôže presunúť ani reklasifikovať opakovaným volaním.';
    end if;
  else
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_FORBIDDEN_UNKNOWN_ROLE';
  end if;

  -- INVARIANT "jeden dokument = najviac jedno primary vozidlo" — platí PRE
  -- VŠETKY role vrátane owner/admin (pozri REVÍZIA 2 v hlavičke migrácie).
  -- Táto RPC je finalization funkcia, nie "presun medzi vozidlami" — na
  -- to má v budúcnosti slúžiť samostatný explicitný edit/reassign flow.
  -- Retry na TO ISTÉ vozidlo (v_existing_vehicle_id = p_vehicle_id) prejde
  -- ďalej ako idempotentný upsert nižšie.
  if v_existing_vehicle_id is not null and v_existing_vehicle_id <> p_vehicle_id then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_DOCUMENT_ALREADY_LINKED_TO_OTHER_VEHICLE',
      hint = 'Dokument už má primary vehicle link na iné vozidlo — táto funkcia nepodporuje presun, iba prvotné priradenie alebo retry na to isté vozidlo.';
  end if;

  -- Idempotentný upsert primary linku — zodpovedá partial unique indexu
  -- document_links_unique_vehicle (document_id, link_type, vehicle_id) WHERE
  -- vehicle_id IS NOT NULL, definovanému v 20260812150000. Retry/double-submit
  -- teda nikdy nevytvorí druhý riadok, iba potvrdí ten istý. Obalené v
  -- nested BEGIN/EXCEPTION: pri skutočnom race condition (dve súbežné
  -- transakcie, ktoré obe prešli kontrolou vyššie ešte pred commitom tej
  -- druhej — teoreticky nemožné vďaka SELECT ... FOR UPDATE zámku na
  -- documents pre ten istý document_id, ale toto je nezávislá druhá
  -- poistka aj pre prípad budúceho INSERT-u do document_links mimo tejto
  -- RPC) DB-level unique index document_links_unique_primary_vehicle_per_
  -- document (sekcia 3) zabráni druhému primary vehicle linku a EXCEPTION
  -- blok to premení na rovnaký prehľadný chybový kód ako explicitná
  -- kontrola vyššie, namiesto surovej Postgres unique_violation chyby.
  begin
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
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'ESBLU_DOCUMENT_ALREADY_LINKED_TO_OTHER_VEHICLE',
        hint = 'Race condition: iná súbežná transakcia medzičasom priradila dokument na iné vozidlo.';
  end;

  update public.documents
  set archived_from_inbox_at = coalesce(archived_from_inbox_at, now())
  where id = p_document_id
  returning archived_from_inbox_at into v_archived_at;

  -- Idempotentný audit insert — ON CONFLICT DO NOTHING na partial unique
  -- indexe zo sekcie 2 (document_ref, new_value->>'vehicle_id' WHERE
  -- action='linked'). Retry/double-submit preto nikdy nevytvorí druhý
  -- 'linked' riadok pre ten istý dokument+vozidlo; race-safe aj bez
  -- riadkového zámku vďaka DB-level unique constraintu.
  insert into public.document_review_log (
    document_id, document_ref, user_id, action, new_value
  )
  values (
    p_document_id, p_document_id, auth.uid(), 'linked',
    jsonb_build_object('vehicle_id', p_vehicle_id)
  )
  on conflict (document_ref, (new_value ->> 'vehicle_id'))
    where action = 'linked'
  do nothing;

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
  'documents UPDATE (owner/admin only). Autorizácia (fail-closed): '
  'employee iba na vlastný (documents.user_id = auth.uid()) a ešte '
  'nefinalizovaný dokument, alebo bezpečný retry na to isté už-finalizované '
  'vozidlo — nikdy na cudzí dokument. Pre VŠETKY role (vrátane owner/admin) '
  'navyše platí invariant "najviac jedno primary vozidlo na dokument" — '
  'pokus finalizovať dokument s existujúcim primary vehicle linkom na INÉ '
  'vozidlo zlyhá s ESBLU_DOCUMENT_ALREADY_LINKED_TO_OTHER_VEHICLE (funkcia '
  'nie je "presun medzi vozidlami", na to slúži budúci samostatný '
  'reassign flow). Riadok dokumentu sa počas behu zamyká (SELECT ... FOR '
  'UPDATE), takže aj súbežné (paralelné) volania sú race-safe; DB-level '
  'partial unique index document_links_unique_primary_vehicle_per_document '
  'je nezávislá druhá poistka toho istého invariantu. Idempotentné — '
  'bezpečné pri retry/double-submit/refresh, vrátane audit záznamu v '
  'document_review_log (ON CONFLICT DO NOTHING).';

revoke all on function public.esblu_finalize_vehicle_document(uuid, uuid) from public;
revoke all on function public.esblu_finalize_vehicle_document(uuid, uuid) from anon;
grant execute on function public.esblu_finalize_vehicle_document(uuid, uuid) to authenticated;

commit;
