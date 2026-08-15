begin;

-- =============================================================================
-- Esblu — legal_documents + user_legal_acceptances (GDPR compliance fáza)
-- =============================================================================
-- Kontext: pred produkčným spustením Esblu potrebuje appka vedieť DOKÁZAŤ,
-- ktorý používateľ akú VERZIU ktorého právneho dokumentu a KEDY akceptoval.
-- Doteraz existovala iba textová zmienka na registračnej stránke ("Registráciou
-- potvrdzujete...") bez akéhokoľvek DB záznamu — nedostatočné pre reálny audit.
--
-- Táto migrácia NEPRIDÁVA jeden všeobecný "súhlas so všetkým" checkbox.
-- Rozlišuje:
--   - "terms"           — akceptácia Podmienok používania (zmluvný vzťah),
--   - "privacy_policy"  — potvrdenie OBOZNÁMENIA SA so Zásadami ochrany
--                          osobných údajov (informačná povinnosť, nie súhlas
--                          v zmysle čl. 6 ods. 1 písm. a — spracúvanie na
--                          základe zmluvy/oprávneného záujmu nevyžaduje
--                          consent, iba transparentnosť),
--   - "dpa"              — Zmluva o spracúvaní osobných údajov (informačný
--                          dokument pre firemných zákazníkov, required=false
--                          pre bežnú osobnú acceptance),
--   - "cookie_policy"    — informačný dokument (required=false), keďže Esblu
--                          nepoužíva žiadne cookies vyžadujúce súhlas.
-- Skutočný voliteľný marketing consent (ak bude v budúcnosti pridaný) NIE JE
-- súčasťou tohto modelu — musí byť samostatný, default OFF, mimo tejto
-- povinnej dvojice terms/privacy_policy.
--
-- REVÍZIA (druhé kolo, pred aplikovaním): opravené na základe pripomienok —
--   1. user_legal_acceptances je teraz SKUTOČNE append-only — zápisová RPC
--      používa ON CONFLICT DO NOTHING (nikdy DO UPDATE), accepted_at sa pri
--      opakovanom volaní (retry) NIKDY nemení.
--   2. acceptance_method už nie je ľubovoľný klientsky text — jeden spoločný
--      parameter bol nahradený DVOMA samostatnými RPC funkciami (podľa
--      presne toho flow, z ktorého sa volajú), plus CHECK whitelist na
--      úrovni stĺpca ako druhá poistka (defense in depth), keby v budúcnosti
--      pribudla ďalšia zapisovacia cesta.
--   3. effective_at dátumy boli prehodnotené: "terms" v1.0 ostáva na
--      2026-07-21, pretože ide o OBSAHOVO NEZMENENÝ dokument, ktorý je na
--      /podmienky-pouzivania reálne publikovaný od toho dátumu už dnes
--      (pred touto migráciou) — nejde o backdating, ale o presný historický
--      záznam. Naproti tomu "privacy_policy" v1.1, "dpa" v1.0 a
--      "cookie_policy" v1.0 sú dokumenty, ktorých obsah sa stane reálne
--      verejným až spolu s nasadením tejto fázy (kód doteraz nebol
--      pushnutý/nasadený) — ich effective_at preto NIE JE natvrdo vpísaný
--      dátum písania tejto migrácie, ale `now()` vyhodnotené v momente
--      reálnej aplikácie tejto migrácie (t. j. v momente, keď sa spolu s
--      ňou nasadí aj zodpovedajúci kód/stránky) — tak effective_at vždy
--      presne zodpovedá skutočnému dátumu zverejnenia, nech sa migrácia
--      spustí ktorýkoľvek deň.
--   4. esblu_get_my_pending_required_acceptances() má teraz jednoznačný
--      deterministický výber najnovšej verzie pri zhode effective_at
--      (sekundárne created_at desc, terciárne version desc).
--
-- REVÍZIA (tretie kolo, pred aplikovaním): opravené na základe ďalších
-- pripomienok —
--   5. content_hash sa už NEPOČÍTA z .tsx komponentu verejnej stránky.
--      Presný právny text každej verzie žije v samostatnom nemennom
--      súbore pod legal/ (napr. legal/terms/1.0.md,
--      legal/privacy/1.1.md — pozri lib/legal-content.ts pre presné
--      mapovanie typu dokumentu na priečinok). Verejné stránky
--      (app/podmienky-pouzivania/page.tsx a pod.) sú teraz iba tenké
--      rendering shelly, ktoré tento .md súbor načítajú a vykreslia
--      (app/components/LegalMarkdown.tsx) — .tsx súbor sa smie meniť
--      (layout, štýly, verzovacia poznámka v hlavičke) bez toho, aby to
--      čokoľvek menilo na content_hash danej verzie, pretože hash sa
--      počíta výhradne z .md súboru.
--   6. canonical_path už neidentifikuje zdrojový súbor s obsahom, ale
--      VEREJNÚ URL, na ktorej je daná verzia sprístupnená (napr.
--      '/podmienky-pouzivania'). Samotný právny OBSAH reprezentuje
--      content_hash (hash príslušného legal/<typ>/<verzia>.md súboru) —
--      dvojica (canonical_path, content_hash) teda oddeľuje "kde je to
--      vidieť" od "čo to presne je".
--   7. Doplnené/spresnené komentáre pri acceptance_method a RPC funkciách:
--      acceptance_method opisuje IBA to, KTORÝM aplikačným flow bol zápis
--      vyvolaný (registračný formulár vs. blokujúci modal) — NIE je to
--      samostatný kryptografický ani iný nezávislý dôkaz fyzického
--      kliknutia používateľa. Skutočným dôkazom AKCEPTÁCIE je existencia
--      riadku v user_legal_acceptances (kto, akú presnú verziu s daným
--      content_hash, kedy — accepted_at generované DB) — acceptance_method
--      je iba doplnkové metadáta o pôvode zápisu.
-- =============================================================================

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('terms', 'privacy_policy', 'dpa', 'cookie_policy')),
  version text not null,
  effective_at timestamptz not null,
  required boolean not null default true,
  -- Nemenný dôkaz PRÁVNEHO OBSAHU tejto konkrétnej verzie — SHA-256 hex
  -- digest (64 hexadecimálnych znakov) presných bajtov nemenného content
  -- súboru legal/<typ>/<verzia>.md (NIE .tsx komponentu verejnej stránky —
  -- tá je iba rendering shell a smie sa meniť bez vplyvu na tento hash).
  -- Umožňuje kedykoľvek nezávisle overiť ("bol tento text naozaj to, čo
  -- bolo publikované ako verzia X?") tak, že sa vezme príslušný git
  -- commit/checkout, prepočíta sa sha256 súboru legal/<typ>/<verzia>.md a
  -- porovná s touto hodnotou. Presné mapovanie typu dokumentu na priečinok
  -- je v lib/legal-content.ts. Pozri metodiku v komentári pri INSERT-e
  -- nižšie.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- VEREJNÁ URL, na ktorej je táto verzia dokumentu sprístupnená (napr.
  -- '/podmienky-pouzivania') — NIE cesta k zdrojovému content súboru (tú
  -- reprezentuje dvojica typ+verzia podľa konvencie v lib/legal-content.ts,
  -- nie samostatný stĺpec). Rovnaká URL sa v čase používa pre viacero verzií
  -- za sebou (nová verzia dokumentu sa publikuje na tej istej URL) — sama
  -- osebe preto NIE JE jednoznačným odkazom na konkrétnu verziu; tým je až
  -- content_hash, ktorý reprezentuje samotný právny obsah.
  canonical_path text not null,
  created_at timestamptz not null default now(),
  unique (type, version)
);

comment on table public.legal_documents is
  'Zoznam publikovaných verzií právnych dokumentov Esblu. Riadky sa NIKDY '
  'neupravujú ani nemažú po publikovaní (append-only, vynútené aj DB '
  'triggerom esblu_legal_documents_no_update/no_delete nižšie — platí aj '
  'pre service_role, nielen pre bežného klienta). required=true iba pre '
  'terms/privacy_policy (dokumenty, ktoré musí aktívne akceptovať/potvrdiť '
  'každý používateľ). Plný text dokumentu je v nemennom súbore '
  'legal/<typ>/<verzia>.md (pozri lib/legal-content.ts) — canonical_path je '
  'VEREJNÁ URL, kde sa dokument zobrazuje (rendering shell v app/), '
  'content_hash je SHA-256 samotného .md súboru a je nemenný dôkaz PRESNE '
  'TOHO právneho obsahu, ktorý bol pod touto verziou publikovaný.';

alter table public.legal_documents enable row level security;

-- Metadáta o dokumentoch neobsahujú osobné údaje — čítanie je verejné
-- (potrebné aj pre neprihláseného používateľa/registráciu, kde appka musí
-- vedieť, akú AKTUÁLNU verziu dať odsúhlasiť).
create policy legal_documents_select_all
  on public.legal_documents
  for select
  to anon, authenticated
  using (true);

-- Žiadny INSERT/UPDATE/DELETE grant pre anon/authenticated — nové verzie
-- pridáva výhradne ďalšia migrácia (service role), nikdy klient.
revoke all on public.legal_documents from anon, authenticated;
grant select on public.legal_documents to anon, authenticated;

-- =============================================================================
-- Skutočná (nielen grantmi vynútená) nemennosť: raz publikovaný riadok sa
-- NESMIE nikdy prepísať ani zmazať — ani klientom (ten už aj tak nemá grant),
-- ani budúcou migráciou/service_role rolou omylom spusteným UPDATE/DELETE.
-- Jediný spôsob "opravy" je publikovanie NOVEJ verzie (nový riadok). Trigger
-- beží pre KAŽDÝ riadok bez ohľadu na volajúcu rolu.
-- =============================================================================
create or replace function public.esblu_block_legal_documents_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'ESBLU_LEGAL_DOCUMENTS_ARE_IMMUTABLE_ONCE_PUBLISHED';
end;
$function$;

comment on function public.esblu_block_legal_documents_mutation() is
  'Trigger funkcia: bezpodmienečne odmietne KAŽDÝ UPDATE aj DELETE na '
  'public.legal_documents, bez ohľadu na volajúcu rolu. Publikovaná verzia '
  'právneho dokumentu sa nesmie nikdy zmeniť ani zmazať — nová verzia = '
  'nový riadok (nová hodnota version), nikdy úprava existujúceho.';

create trigger esblu_legal_documents_no_update
  before update on public.legal_documents
  for each row execute function public.esblu_block_legal_documents_mutation();

create trigger esblu_legal_documents_no_delete
  before delete on public.legal_documents
  for each row execute function public.esblu_block_legal_documents_mutation();

create table public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  -- DÔLEŽITÉ: acceptance_method opisuje IBA to, KTORÝM aplikačným flow bol
  -- tento zápis vyvolaný (registračný formulár vs. blokujúci modal pre
  -- existujúceho používateľa) — je to metadáta o pôvode zápisu, NIE
  -- samostatný kryptografický ani iný nezávislý dôkaz fyzického kliknutia
  -- používateľa. Skutočným dôkazom AKCEPTÁCIE je samotná EXISTENCIA tohto
  -- riadku (kto — user_id, akú presnú verziu s daným content_hash —
  -- document_type+version cez FK na legal_documents, kedy — accepted_at
  -- generované DB, nikdy klientom). Whitelist na úrovni stĺpca je druhá
  -- poistka nad rámec toho, že klient dnes nemá k tejto hodnote priamy
  -- prístup vôbec (zapisuje sa výhradne cez dve nižšie RPC funkcie, každá s
  -- vlastnou pevne danou hodnotou) — ak by v budúcnosti pribudla ďalšia
  -- zapisovacia cesta, tento CHECK zabráni zápisu ľubovoľného auditného
  -- textu.
  acceptance_method text not null check (acceptance_method in ('registration', 'legal_gate')),
  metadata jsonb,
  foreign key (document_type, version) references public.legal_documents(type, version),
  unique (user_id, document_type, version)
);

comment on table public.user_legal_acceptances is
  'Dôkazný záznam, KTO (user_id), AKÚ VERZIU KTORÉHO dokumentu (a teda AKÝ '
  'PRESNE právny OBSAH — cez FK na legal_documents.content_hash) a KEDY '
  '(accepted_at) akceptoval/potvrdil. acceptance_method je iba doplnkové '
  'metadáta o TOM, KTORÝM aplikačným flow bol zápis vyvolaný (registrácia '
  'vs. blokujúci modal) — nie samostatný dôkaz fyzického kliknutia; '
  'skutočným dôkazom je existencia riadku samotného. SKUTOČNE append-only: '
  'žiadny INSERT/UPDATE/DELETE grant pre authenticated (jediná zapisovacia '
  'cesta je public.esblu_accept_legal_document_registration()/'
  '..._at_gate() nižšie), a aj tie zápisové RPC používajú výhradne '
  '"ON CONFLICT ... DO NOTHING" — accepted_at existujúceho riadku sa pri '
  'opakovanom volaní (retry na sieti a pod.) NIKDY neprepíše. Riadky sú po '
  'vytvorení nemenné (žiadny UPDATE grant vôbec neexistuje) — používateľ '
  'ani appka ich nemôže spätne upraviť.';

alter table public.user_legal_acceptances enable row level security;

-- Používateľ smie vidieť VÝHRADNE svoje vlastné acceptance záznamy (potrebné
-- pre Nastavenia → Súkromie a dáta, aby si vedel overiť, čo a kedy potvrdil).
create policy user_legal_acceptances_select_own
  on public.user_legal_acceptances
  for select
  to authenticated
  using (user_id = auth.uid());

-- Žiadny INSERT/UPDATE/DELETE grant pre authenticated vôbec — zápis iba cez
-- SECURITY DEFINER RPC nižšie. Toto je zámerne prísnejšie než bežná
-- "with check (user_id = auth.uid())" INSERT policy, pretože taká policy by
-- sama osebe nezabránila klientovi poslať vlastný accepted_at ani vlastný
-- acceptance_method text.
revoke all on public.user_legal_acceptances from anon, authenticated;
grant select on public.user_legal_acceptances to authenticated;

-- =============================================================================
-- esblu_accept_legal_document_registration() / esblu_accept_legal_document_at_gate()
-- =============================================================================
-- Dve samostatné RPC namiesto jednej s voľným "acceptance_method" textovým
-- parametrom — každá zodpovedá presne jednému, vopred známemu miestu
-- volania v appke (registračný formulár / blokujúci modal po prihlásení),
-- takže klient nemá žiadnu možnosť zapísať iný než tento presný, na strane
-- DB pevne daný auditný text. Zdieľajú takmer identickú logiku (zámerne
-- duplikovanú, nie cez zdieľanú "privátnu" pomocnú funkciu) — ide o krátku,
-- jednoducho prehľadnateľnú telá funkcií, kde duplikácia znižuje procedurálnu
-- komplexnosť a vyhýba sa otázkam okolo EXECUTE oprávnení pri vnorenom
-- volaní SECURITY DEFINER funkcie z inej SECURITY DEFINER funkcie.
--
-- Obe funkcie:
--   - vyžadujú platnú reláciu (auth.uid() nie null),
--   - overia, že (document_type, version) existuje medzi publikovanými
--     legal_documents — klient nemôže "akceptovať" nikdy nezverejnenú verziu,
--   - INSERT ... ON CONFLICT (user_id, document_type, version) DO NOTHING —
--     append-only, accepted_at existujúceho riadku sa nikdy neprepíše,
--   - vrátia (novo vytvorený ALEBO už existujúci) riadok, takže appka vždy
--     dostane platný výsledok bez ohľadu na to, či išlo o prvé volanie
--     alebo o neškodný retry.
-- =============================================================================

create or replace function public.esblu_accept_legal_document_registration(
  p_document_type text,
  p_version text
)
returns public.user_legal_acceptances
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.user_legal_acceptances;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.legal_documents ld
    where ld.type = p_document_type
      and ld.version = p_version
  ) then
    raise exception 'ESBLU_UNKNOWN_LEGAL_DOCUMENT_VERSION';
  end if;

  insert into public.user_legal_acceptances (
    user_id, document_type, version, acceptance_method
  )
  values (
    v_uid, p_document_type, p_version, 'registration'
  )
  on conflict (user_id, document_type, version) do nothing;

  select *
  into v_row
  from public.user_legal_acceptances
  where user_id = v_uid
    and document_type = p_document_type
    and version = p_version;

  return v_row;
end;
$function$;

comment on function public.esblu_accept_legal_document_registration(text, text) is
  'Zápis acceptance z registračného flow (app/login/page.tsx mode='
  '"register" pri okamžitej session, alebo app/onboarding/company/page.tsx '
  'po potvrdení e-mailu — obe volajú TÚTO istú RPC, pretože ide o '
  'pokračovanie toho istého registračného flow). acceptance_method je '
  'natvrdo "registration" — klient ho nemôže ovplyvniť. Ide o metadáta o '
  'ZDROJI zápisu (ktorý aplikačný flow), nie o samostatný dôkaz kliknutia — '
  'dôkazom je existencia výsledného riadku. Append-only: ON CONFLICT DO '
  'NOTHING, accepted_at existujúceho riadku sa nikdy neprepíše, bezpečné '
  'volať opakovane.';

revoke all on function public.esblu_accept_legal_document_registration(text, text) from public;
grant execute on function public.esblu_accept_legal_document_registration(text, text) to authenticated;

create or replace function public.esblu_accept_legal_document_at_gate(
  p_document_type text,
  p_version text
)
returns public.user_legal_acceptances
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.user_legal_acceptances;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.legal_documents ld
    where ld.type = p_document_type
      and ld.version = p_version
  ) then
    raise exception 'ESBLU_UNKNOWN_LEGAL_DOCUMENT_VERSION';
  end if;

  insert into public.user_legal_acceptances (
    user_id, document_type, version, acceptance_method
  )
  values (
    v_uid, p_document_type, p_version, 'legal_gate'
  )
  on conflict (user_id, document_type, version) do nothing;

  select *
  into v_row
  from public.user_legal_acceptances
  where user_id = v_uid
    and document_type = p_document_type
    and version = p_version;

  return v_row;
end;
$function$;

comment on function public.esblu_accept_legal_document_at_gate(text, text) is
  'Zápis acceptance z blokujúceho modalu po prihlásení '
  '(app/components/LegalAcceptanceGate.tsx) pre existujúcich používateľov, '
  'ktorí ešte nemajú aktuálnu required verziu potvrdenú (t. j. required '
  'verziu NEPOTVRDILI pri registrácii). acceptance_method je natvrdo '
  '"legal_gate" — klient ho nemôže ovplyvniť. Ide o metadáta o ZDROJI '
  'zápisu (ktorý aplikačný flow), nie o samostatný dôkaz kliknutia — '
  'dôkazom je existencia výsledného riadku. Append-only: ON CONFLICT DO '
  'NOTHING, accepted_at existujúceho riadku sa nikdy neprepíše, bezpečné '
  'volať opakovane.';

revoke all on function public.esblu_accept_legal_document_at_gate(text, text) from public;
grant execute on function public.esblu_accept_legal_document_at_gate(text, text) to authenticated;

-- =============================================================================
-- esblu_get_my_pending_required_acceptances(): čo ešte prihlásený používateľ
-- musí potvrdiť (required=true dokumenty bez zodpovedajúceho acceptance
-- záznamu na AKTUÁLNU publikovanú verziu). Používa blokujúci modal po
-- prihlásení.
-- =============================================================================
create or replace function public.esblu_get_my_pending_required_acceptances()
returns table (document_type text, version text, effective_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select ld.type, ld.version, ld.effective_at
  from public.legal_documents ld
  where ld.required = true
    and ld.id in (
      -- Najnovšia publikovaná required verzia pre daný typ. Deterministický
      -- výber aj pri zhode effective_at (napr. dve verzie publikované v
      -- tom istom momente/migrácii): sekundárne created_at desc (poradie
      -- vloženia), terciárne version desc ako posledná poistka, aby výber
      -- nikdy nezávisel od nedefinovaného poradia riadkov.
      select distinct on (type) id
      from public.legal_documents
      where required = true
      order by type, effective_at desc, created_at desc, version desc
    )
    and auth.uid() is not null
    and not exists (
      select 1
      from public.user_legal_acceptances ula
      where ula.user_id = auth.uid()
        and ula.document_type = ld.type
        and ula.version = ld.version
    );
$function$;

comment on function public.esblu_get_my_pending_required_acceptances() is
  'Read-only: zoznam required (terms/privacy_policy) dokumentov, ktorých '
  'NAJNOVŠIU publikovanú verziu prihlásený používateľ (auth.uid()) ešte '
  'nepotvrdil. Výber najnovšej verzie pri zhode effective_at je '
  'deterministický (created_at desc, potom version desc). Prázdny výsledok '
  '= používateľ môže appku plne používať. Vracia prázdny výsledok aj pre '
  'neprihláseného používateľa (auth.uid() is null), nikdy nechybí.';

revoke all on function public.esblu_get_my_pending_required_acceptances() from public;
grant execute on function public.esblu_get_my_pending_required_acceptances() to authenticated;

-- =============================================================================
-- Počiatočný seed publikovaných dokumentov — musí zodpovedať
-- lib/legal-config.ts.
--
-- METODIKA content_hash (revidovaná): SHA-256 hex digest (lowercase,
-- 64 znakov) presných bajtov NEMENNÉHO content súboru
-- legal/<typ>/<verzia>.md — NIE .tsx komponentu verejnej stránky.
-- Mapovanie typu dokumentu na priečinok (lib/legal-content.ts):
--   terms -> legal/terms, privacy_policy -> legal/privacy,
--   dpa -> legal/dpa, cookie_policy -> legal/cookies.
-- Vypočítané nástrojom `sha256sum legal/<typ>/<verzia>.md`. Kedykoľvek
-- nezávisle overiteľné: checkout repozitára, spustiť `sha256sum` na
-- príslušnom legal/*.md súbore, porovnať s content_hash nižšie.
--
-- canonical_path je VEREJNÁ URL (nie súborová cesta) — samotný právny
-- obsah reprezentuje content_hash.
--
-- "terms" v1.0: legal/terms/1.0.md je prepis obsahu, ktorý je na
-- /podmienky-pouzivania reálne publikovaný od 21. júla 2026 (overené proti
-- git HEAD verzii app/podmienky-pouzivania/page.tsx pred zavedením
-- rendering-shell architektúry) — fixný historický effective_at dátum je
-- preto presný záznam, nie backdating.
--
-- "privacy_policy" v1.1, "dpa" v1.0 a "cookie_policy" v1.0 sa stanú reálne
-- verejnými až spolu s nasadením tejto fázy (kód dosiaľ nebol
-- pushnutý/nasadený) — ich effective_at je preto now(), vyhodnotené v
-- momente skutočnej aplikácie tejto migrácie, nie vopred vymyslený
-- literál. Tak effective_at vždy presne zodpovedá reálnemu dátumu
-- zverejnenia bez ohľadu na to, kedy sa táto migrácia napokon spustí.
-- =============================================================================
insert into public.legal_documents (type, version, effective_at, required, content_hash, canonical_path)
values
  (
    'terms', '1.0', '2026-07-21T00:00:00Z', true,
    'b2d3d3e471dabb5d3bf577bbc44f58349615dd9c5edc483b0669b3a3234b35a8',
    '/podmienky-pouzivania'
  )
on conflict (type, version) do nothing;

insert into public.legal_documents (type, version, effective_at, required, content_hash, canonical_path)
values
  (
    'privacy_policy', '1.1', now(), true,
    '6c0085e42511a0c3ed2704024c224e7f7ffb90d904df2d428b768b56f903e50c',
    '/ochrana-osobnych-udajov'
  ),
  -- POZNÁMKA: legal/dpa/1.0.md bol pripravený v predchádzajúcom kole tejto
  -- migrácie, ale NIKDY nebol nasadený do produkcie (celá táto migrácia
  -- čaká na schválenie) — preto sa jeho riadok nižšie zámerne PONECHÁVA
  -- (append-only, história návrhu), ale appka od legalConfig.dpaVersion
  -- ("1.1") už odkazuje na DÔKLADNEJŠÍ text v legal/dpa/1.1.md (audit voči
  -- čl. 28 ods. 3-4 GDPR, informovaný EÚ štandardnými zmluvnými doložkami
  -- podľa rozhodnutia 2021/915 — pozri legal/dpa/1.1.md a
  -- docs/gdpr-compliance-review-2026-08-15.md). "required" ostáva false pre
  -- OBE DPA verzie — osobnú acceptance DPA nevyžaduje od bežného
  -- používateľa (employee), iba od aktívneho owner/admina danej firmy, cez
  -- samostatný company_dpa_acceptances model
  -- (supabase/migrations/20260816090000_add_company_dpa_acceptance.sql).
  (
    'dpa', '1.0', now(), false,
    'eb8384c696095629e4f8546718cfdf8f2e313e4ae9fe53b31dbb33ad056664f6',
    '/dpa'
  ),
  (
    'dpa', '1.1', now(), false,
    'b3ae23c219f6551e0b31ee5516b535ec5da93b63e0abd47d03ddfcb669b84fdb',
    '/dpa'
  ),
  (
    'cookie_policy', '1.0', now(), false,
    'a2a7bcad2c123ce3119484ef18f4883bd9252a862dfc2f34c73e71f8255c4426',
    '/cookies'
  )
on conflict (type, version) do nothing;

commit;
