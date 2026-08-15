begin;

-- =============================================================================
-- Esblu — company-level DPA acceptance (čl. 28 GDPR)
-- =============================================================================
-- Kontext: user_legal_acceptances (20260815100000) rieši OSOBNÚ acceptance
-- Podmienok používania a potvrdenie oboznámenia sa so Zásadami ochrany
-- osobných údajov — každým jednotlivým používateľom (owner/admin/employee).
-- DPA (Zmluva o spracúvaní osobných údajov, /dpa) je iného druhu: je to
-- B2B dokument MEDZI ESBLU A FIRMOU, nie osobný súhlas zamestnanca. Bežný
-- employee ani admin ho nemá dôvod ani oprávnenie akceptovať za firmu —
-- smie ho prijať výhradne aktívny OWNER, teda jediná rola, ktorá v tejto
-- prvej verzii predstavuje osobu oprávnenú uzatvárať zmluvy v mene firmy
-- (pozri revíznu poznámku pri esblu_accept_company_dpa nižšie). Táto
-- migrácia zavádza samostatnú, company-scoped tabuľku
-- (company_dpa_acceptances) a samostatné RPC, ktoré sú štruktúrou zámerne
-- takmer identické s user_legal_acceptances (rovnaký append-only vzor), ale
-- NIE sú s ňou zlúčené — miešanie "kto ako fyzická osoba potvrdil dokument"
-- a "kto v mene firmy uzavrel spracovateľskú zmluvu" by boli dva rôzne
-- právne fakty v jednej tabuľke, čo by robilo audit nejednoznačným.
--
-- Rozhodujúci moment, odkedy je company-level DPA acceptance POVINNÁ, NIE
-- JE "platený" alebo "verejný B2B launch" — je to okamih, keď REÁLNA firma
-- (aj počas bezplatného testovania) nahrá do Esblu osobné údaje TRETÍCH
-- OSÔB, pretože práve vtedy Esblu voči tejto firme reálne vystupuje ako
-- processor podľa čl. 28. Preto táto migrácia obsahuje aj DB-level
-- enforcement (nielen UI gate) — pozri krok 4 nižšie.
-- =============================================================================

create table public.company_dpa_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- document_type je vždy 'dpa' — stĺpec (namiesto hardcoded literálu v FK)
  -- existuje kvôli symetrii s user_legal_acceptances a kvôli čitateľnému
  -- FK na legal_documents(type, version) nižšie.
  document_type text not null default 'dpa' check (document_type = 'dpa'),
  version text not null,
  -- Osoba, KTORÁ prijatie vykonala (musí byť aktívny OWNER danej firmy v
  -- momente prijatia — vynucuje RPC nižšie, nie tento stĺpec sám osebe).
  -- ON DELETE RESTRICT — rovnaký vzor ako
  -- public.companies.owner_id references auth.users(id) on delete restrict
  -- (20260814110000): DPA acceptance je právne významný záznam o tom, KTO
  -- konkrétne prijal zmluvu v mene firmy, a nemá sa nechať potichu
  -- "osirotieť" na NULL zmazaním jeho auth účtu. Ak si osoba, ktorá DPA
  -- prijala, neskôr želá zmazať svoj vlastný účet, musí najprv dôjsť k
  -- novému prijatiu iným aktívnym ownerom danej firmy (alebo k ukončeniu
  -- firemného účtu) — vlastné vymazanie účtu tejto konkrétnej
  -- osoby dovtedy RESTRICT odmietne. Toto je zámerný, nie náhodný dôsledok;
  -- ak sa v budúcnosti ukáže ako prevádzkovo problematický, treba ho zmeniť
  -- vedome (napr. na "on delete set null" + presun accepted_by mimo FK), nie
  -- obísť.
  accepted_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  -- Rovnaká whitelist logika ako user_legal_acceptances.acceptance_method —
  -- opisuje IBA zdroj zápisu (jediný existujúci flow), nie samostatný dôkaz
  -- kliknutia. Skutočným dôkazom je existencia riadku (kto, za ktorú firmu,
  -- akú presnú verziu s daným content_hash, kedy).
  acceptance_method text not null check (acceptance_method in ('company_dpa_gate')),
  foreign key (document_type, version) references public.legal_documents(type, version),
  unique (company_id, document_type, version)
);

comment on table public.company_dpa_acceptances is
  'Dôkazný záznam, že AKTÍVNY OWNER danej firmy (accepted_by) prijal '
  'AKTUÁLNU verziu DPA (document_type=''dpa'', version — FK na '
  'legal_documents, teda aj na jej nemenný content_hash) V MENE FIRMY '
  '(company_id), a KEDY (accepted_at, generované výhradne DB/RPC). '
  'append-only: žiadny INSERT/UPDATE/DELETE grant pre authenticated '
  '(jediná zapisovacia cesta je public.esblu_accept_company_dpa() nižšie), '
  'ktorá navyše používa ON CONFLICT DO NOTHING — accepted_at existujúceho '
  'riadku sa nikdy neprepíše. NIE je to osobná acceptance jednotlivého '
  'používateľa (tú rieši user_legal_acceptances, 20260815100000) — bežný '
  'employee toto NEMÁ potvrdzovať a ani nemôže (RPC to vynucuje).';

alter table public.company_dpa_acceptances enable row level security;

-- SELECT smie VYKONAŤ AKÝKOĽVEK aktívny člen danej firmy (owner, admin AJ
-- employee) — admin/employee potrebujú vedieť, či firma DPA už prijala,
-- aby im appka namiesto akceptačného formulára (ten je iba pre ownera)
-- zobrazila informačný "čaká sa na potvrdenie vlastníkom" stav.
create policy company_dpa_acceptances_select_member
  on public.company_dpa_acceptances
  for select
  to authenticated
  using (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- HARDENING (piate kolo): explicitný REVOKE ALL aj od public (nielen
-- anon/authenticated) — bez ohľadu na predvolené oprávnenia PostgreSQL
-- rolí, žiadna rola nemá na tejto tabuľke priamy INSERT/UPDATE/DELETE
-- ani implicitný SELECT. Jediný povolený prístup je explicitný SELECT
-- grant nižšie (cez RLS policy vyššie) a zápis výhradne cez SECURITY
-- DEFINER RPC (esblu_accept_company_dpa), ktorá navyše vynucuje presne
-- rolu owner.
revoke all on public.company_dpa_acceptances from public, anon, authenticated;
grant select on public.company_dpa_acceptances to authenticated;

-- =============================================================================
-- esblu_accept_company_dpa(): jediný spôsob zápisu. Smie ho úspešne zavolať
-- IBA aktívny OWNER danej firmy.
--
-- REVÍZIA (štvrté kolo, pred produkčným apply): pôvodne bola táto funkcia
-- otvorená pre owner AJ admin (rovnako ako esblu_create_company_invite).
-- Používateľ výslovne upozornil, že to nie je správne pre právny úkon
-- tejto povahy: aplikačná rola "admin" v Esblu znamená iba rozšírené
-- prevádzkové oprávnenia v appke (spravovať vozidlá/stroje/sklad,
-- pozývať ľudí a pod.), NIE právne oprávnenie uzatvárať zmluvy v mene
-- firmy navonok. DPA je zmluvný dokument medzi Esblu a firmou — kto ho
-- smie za firmu podpísať, je otázka štatutárneho/zmluvného zastúpenia,
-- nie appkovej role. Preto táto verzia vyžaduje striktne role='owner'.
-- Ak by v budúcnosti Esblu chcelo umožniť explicitnú delegáciu tohto
-- oprávnenia (napr. owner poverí konkrétneho admina), musí to byť nový,
-- samostatne navrhnutý mechanizmus (napr. osobitný "legal_representative"
-- príznak s vlastným auditným záznamom KTO KOHO poveril), nie tiché
-- rozšírenie tejto funkcie naspäť na "owner alebo admin".
--
-- Employee AJ admin dostanú ESBLU_NOT_ACTIVE_OWNER (nový, samostatný error
-- kód — zámerne ODLIŠNÝ od ESBLU_NOT_ACTIVE_OWNER_OR_ADMIN, ktorý appka
-- naďalej používa inde, napr. v esblu_create_company_invite, pozri
-- lib/company.ts getCreateInviteErrorMessage — tieto dve funkcie majú od
-- teraz zámerne rôzne autorizačné pravidlá, preto aj rôzne error kódy).
--
-- HARDENING (piate kolo, pred produkčným apply): p_version sa už
-- NEOVERUJE iba proti "existuje takáto verzia v legal_documents"
-- (to by dovolilo owner-ovi omylom alebo zámerne "prijať" starú,
-- historickú DPA verziu, ktorá už nie je účinná). Namiesto toho si DB
-- SAMA zistí aktuálnu ÚČINNÚ verziu (effective_at <= now(), tie-break
-- effective_at desc, created_at desc, version desc — rovnaké
-- deterministické poradie ako v esblu_get_my_company_dpa_status() a
-- esblu_require_company_dpa_current() nižšie) a p_version musí byť
-- PRESNE táto verzia — inak ESBLU_NOT_CURRENT_DPA_VERSION. Ak neexistuje
-- žiadna účinná DPA verzia vôbec, RPC zlyhá s ESBLU_NO_CURRENT_DPA
-- (rovnaký kód ako fail-closed vetva enforcement triggera nižšie —
-- konzistentné signalizovanie tej istej chýbajúcej konfigurácie).
-- =============================================================================
create or replace function public.esblu_accept_company_dpa(
  p_version text
)
returns public.company_dpa_acceptances
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_role text;
  v_current_version text;
  v_row public.company_dpa_acceptances;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- company_id AJ rola volajúceho sa odvodzujú VÝHRADNE z jeho vlastného
  -- aktívneho company_members riadku — nikdy z parametra poslaného
  -- klientom. Rovnaký bezpečnostný vzor ako vo zvyšku aplikácie (pozri
  -- lib/company.ts, esblu_create_company_invite a pod.).
  select cm.company_id, cm.role
  into v_company_id, v_role
  from public.company_members cm
  where cm.user_id = v_uid
    and cm.status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'ESBLU_NO_ACTIVE_MEMBERSHIP';
  end if;

  if v_role <> 'owner' then
    raise exception 'ESBLU_NOT_ACTIVE_OWNER';
  end if;

  -- Aktuálna ÚČINNÁ DPA verzia — iba tá smie byť prijatá. p_version je
  -- vstup od klienta iba na potvrdenie ("prijímam presne TÚTO verziu,
  -- ktorú mi appka zobrazila"), nikdy nie zdroj pravdy o tom, ČO je
  -- aktuálne.
  select ld.version
  into v_current_version
  from public.legal_documents ld
  where ld.type = 'dpa'
    and ld.effective_at <= now()
  order by ld.effective_at desc, ld.created_at desc, ld.version desc
  limit 1;

  if v_current_version is null then
    raise exception 'ESBLU_NO_CURRENT_DPA';
  end if;

  if p_version <> v_current_version then
    raise exception 'ESBLU_NOT_CURRENT_DPA_VERSION';
  end if;

  insert into public.company_dpa_acceptances (
    company_id, document_type, version, accepted_by, acceptance_method
  )
  values (
    v_company_id, 'dpa', v_current_version, v_uid, 'company_dpa_gate'
  )
  on conflict (company_id, document_type, version) do nothing;

  select *
  into v_row
  from public.company_dpa_acceptances
  where company_id = v_company_id
    and document_type = 'dpa'
    and version = v_current_version;

  return v_row;
end;
$function$;

comment on function public.esblu_accept_company_dpa(text) is
  'Zápis company-level DPA acceptance. company_id a rola volajúceho sa '
  'odvodzujú VÝHRADNE z jeho vlastného aktívneho company_members riadku '
  '(auth.uid()) — nikdy od klienta. Vyžaduje rolu owner (presne, nie '
  'owner/admin — appková rola admin nezakladá právne oprávnenie uzatvárať '
  'zmluvy za firmu), inak ESBLU_NOT_ACTIVE_OWNER. Aktuálnu účinnú DPA '
  'verziu (effective_at <= now(), tie-break effective_at desc, created_at '
  'desc, version desc) si funkcia zisťuje SAMA — p_version musí byť '
  'presne táto verzia, inak ESBLU_NOT_CURRENT_DPA_VERSION; ak žiadna '
  'účinná verzia neexistuje, ESBLU_NO_CURRENT_DPA. Nedovoľuje prijatie '
  'ľubovoľnej historickej DPA verzie. accepted_by/accepted_at generuje '
  'výhradne táto funkcia. Append-only: ON CONFLICT DO NOTHING, existujúci '
  'riadok sa nikdy neprepíše, bezpečné volať opakovane.';

revoke all on function public.esblu_accept_company_dpa(text) from public;
grant execute on function public.esblu_accept_company_dpa(text) to authenticated;

-- =============================================================================
-- esblu_get_my_company_dpa_status(): read-only stav pre AKTÍVNEHO ČLENA
-- (owner/admin/employee rovnako) — používa ho AJ owner gate (má zobraziť
-- akceptačný formulár? — iba pre owner, pozri CompanyDpaGate.tsx) AJ
-- admin/employee "čaká sa" obrazovka (má zobraziť informačný stav?).
-- Vracia najnovšiu ÚČINNÚ (effective_at <= now()) DPA verziu podľa
-- rovnakého deterministického poradia ako
-- esblu_get_my_pending_required_acceptances() (20260815100000): effective_at
-- desc, created_at desc, version desc.
--
-- HARDENING (piate kolo): pôvodne táto funkcia vracala najnovšiu
-- PUBLIKOVANÚ verziu bez ohľadu na effective_at — teda aj DPA verziu,
-- ktorá je už v legal_documents zapísaná, ale jej účinnosť ešte
-- nenastala (effective_at v budúcnosti). To by mohlo owner-ovi zobraziť
-- na podpis verziu, ktorá ešte právne nie je "aktuálna". current_dpa CTE
-- nižšie teraz filtruje na effective_at <= now() — rovnaká podmienka ako
-- v esblu_accept_company_dpa() a esblu_require_company_dpa_current().
-- =============================================================================
create or replace function public.esblu_get_my_company_dpa_status()
returns table (
  company_id uuid,
  current_dpa_version text,
  has_current_acceptance boolean,
  accepted_at timestamptz,
  my_role text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with my_membership as (
    select cm.company_id, cm.role
    from public.company_members cm
    where cm.user_id = auth.uid()
      and cm.status = 'active'
    limit 1
  ),
  current_dpa as (
    select ld.version
    from public.legal_documents ld
    where ld.type = 'dpa'
      and ld.effective_at <= now()
    order by ld.effective_at desc, ld.created_at desc, ld.version desc
    limit 1
  )
  select
    mm.company_id,
    cd.version,
    (cda.id is not null),
    cda.accepted_at,
    mm.role
  from my_membership mm
  cross join current_dpa cd
  left join public.company_dpa_acceptances cda
    on cda.company_id = mm.company_id
   and cda.document_type = 'dpa'
   and cda.version = cd.version;
$function$;

comment on function public.esblu_get_my_company_dpa_status() is
  'Read-only stav company-level DPA acceptance pre AKTÍVNEHO ČLENA volajúceho '
  '(owner/admin/employee rovnako) — company_id a rola sa odvodzujú z '
  'auth.uid(). current_dpa_version je najnovšia ÚČINNÁ DPA verzia '
  '(effective_at <= now(), deterministický výber: effective_at desc, '
  'created_at desc, version desc). has_current_acceptance=false znamená, '
  'že firma túto verziu ešte '
  'neprijala. Používa ho AJ owner gate (rozhoduje, či zobraziť akceptačný '
  'formulár — iba pre owner), AJ admin/employee čakací stav (rozhoduje, či '
  'zobraziť "čaká sa na potvrdenie vlastníkom účtu"). Vracia prázdny '
  'výsledok, ak volajúci nemá aktívny membership alebo nie je prihlásený.';

revoke all on function public.esblu_get_my_company_dpa_status() from public;
grant execute on function public.esblu_get_my_company_dpa_status() to authenticated;

-- =============================================================================
-- KROK 4 — ENFORCEMENT: nielen UI gate. Firma bez aktuálnej DPA acceptance
-- NESMIE vytvárať NOVÉ záznamy v moduloch, kde sa reálne spracúvajú (môžu
-- spracúvať) osobné údaje tretích osôb. Toto je BEFORE INSERT trigger,
-- ktorý sa NEDÁ obísť žiadnou cestou klienta (frontend, priamy REST/JS SDK
-- insert, budúci nový API endpoint) — funguje na úrovni DB.
--
-- Rozsah (zámerný, nie automatický "všetko"): aplikované na tabuľky, kde
-- INSERT znamená vznik NOVÉHO substantívneho obsahu, ktorý podľa DPA (čl. 3
-- textu /dpa) MÔŽE obsahovať osobné údaje tretích osôb — ai_evidence,
-- documents, document_attachments (AI/dokumentový modul — najvyššie riziko,
-- scan dokladov/faktúr/poistiek), vehicles, machines, inventory_items,
-- vehicle_services, machine_services, machine_photos, inventory_photos
-- (evidenčné/servisné dáta môžu obsahovať mená vodičov/technikov, SPZ/VIN
-- spojené s fyzickou osobou a pod.).
--
-- VEDOME VYNECHANÉ: document_links (čisto relačná väzba na UŽ existujúci
-- dokument — nezavádza nový obsah), document_review_log (append-only audit
-- log revíznych akcií nad už existujúcimi dátami — jeho zablokovanie by
-- mohlo poškodiť dokázateľnosť revíznych krokov, nie ochranu pred novými
-- osobnými údajmi). Toto rozhodnutie o presnom rozsahu je vhodné pred
-- nasadením ešte raz potvrdiť (produktová/právna úvaha, nie čisto
-- technická) — mimoriadne konzervatívny variant by trigger pridal na
-- VŠETKÝCH 12 company-scoped tabuliek vrátane týchto dvoch.
--
-- DÔLEŽITÉ poradie triggerov: company_id sa na týchto tabuľkách priraďuje
-- AŽ v BEFORE INSERT triggeri esblu_assign_company_id_before_insert
-- (8 tabuliek) alebo esblu_plan_limit_before_insert (ai_evidence/vehicles/
-- inventory_items/machines) — pozri 20260814160000. Postgres spúšťa
-- viacero BEFORE triggerov na tom istom evente v ABECEDNOM poradí podľa
-- názvu triggeru. Názov nižšie ("esblu_require_company_dpa_before_insert")
-- je zámerne zvolený tak, aby abecedne nasledoval AŽ PO oboch existujúcich
-- trigger menách ("esblu_assign_company_id_before_insert",
-- "esblu_plan_limit_before_insert" — 'r' > 'p' > 'a'), takže new.company_id
-- je v čase behu tohto triggeru už vždy priradené. Toto poradie je
-- nevyhnutné — bez neho by new.company_id bolo pri INSERTe ešte NULL a
-- kontrola by buď zlyhala nezmyselne, alebo by ju bolo treba obchádzať.
--
-- HARDENING (piate kolo, pred produkčným apply so skutočnými dátami):
-- pôvodná verzia bola fail-OPEN, keď v legal_documents neexistovala
-- žiadna DPA verzia (return new — zápis povolený). Pre nasadenie so
-- skutočnými osobnými údajmi je to nesprávny default: chýbajúca/neplatná
-- DPA konfigurácia (napr. omylom zmazaný/posunutý seed, budúci
-- effective_at) má zápis ZABLOKOVAŤ, nie ticho povoliť. Trigger je teraz
-- fail-CLOSED: ak neexistuje žiadna ÚČINNÁ DPA verzia
-- (effective_at <= now()), raise exception ESBLU_NO_CURRENT_DPA — rovnaký
-- kód ako v esblu_accept_company_dpa() pri tej istej chýbajúcej
-- konfigurácii.
-- =============================================================================

create or replace function public.esblu_require_company_dpa_current()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current_version text;
  v_has_acceptance boolean;
begin
  select ld.version
  into v_current_version
  from public.legal_documents ld
  where ld.type = 'dpa'
    and ld.effective_at <= now()
  order by ld.effective_at desc, ld.created_at desc, ld.version desc
  limit 1;

  if v_current_version is null then
    -- Fail-CLOSED (nie fail-open): žiadna ÚČINNÁ DPA verzia neexistuje
    -- (chýbajúci/neplatný seed, alebo effective_at všetkých verzií v
    -- budúcnosti) — zápis MUSÍ byť odmietnutý, nie ticho povolený, keď už
    -- ide o reálne dáta tretích osôb.
    raise exception 'ESBLU_NO_CURRENT_DPA';
  end if;

  select exists (
    select 1
    from public.company_dpa_acceptances cda
    where cda.company_id = new.company_id
      and cda.document_type = 'dpa'
      and cda.version = v_current_version
  )
  into v_has_acceptance;

  if not v_has_acceptance then
    raise exception 'ESBLU_COMPANY_DPA_NOT_ACCEPTED';
  end if;

  return new;
end;
$function$;

comment on function public.esblu_require_company_dpa_current() is
  'BEFORE INSERT guard: odmietne (raise exception ESBLU_COMPANY_DPA_NOT_ACCEPTED) '
  'vytvorenie nového riadku, ak new.company_id nemá acceptance na AKTUÁLNU '
  'ÚČINNÚ DPA verziu (effective_at <= now()) v company_dpa_acceptances. '
  'Vyžaduje, aby new.company_id bolo v čase behu tohto triggeru už '
  'priradené — pozri poznámku o abecednom poradí triggerov vyššie. '
  'Fail-CLOSED (nie fail-open): ak žiadna účinná DPA verzia vôbec '
  'neexistuje, zápis je odmietnutý s ESBLU_NO_CURRENT_DPA — rovnako ako '
  'pri chýbajúcej acceptance.';

revoke all on function public.esblu_require_company_dpa_current() from public;

do $enforce$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_evidence', 'documents', 'document_attachments',
    'vehicles', 'vehicle_services',
    'machines', 'machine_services', 'machine_photos',
    'inventory_items', 'inventory_photos'
  ]
  loop
    execute format('drop trigger if exists esblu_require_company_dpa_before_insert on public.%I', table_name);
    execute format(
      'create trigger esblu_require_company_dpa_before_insert before insert on public.%I for each row execute function public.esblu_require_company_dpa_current()',
      table_name
    );
  end loop;
end
$enforce$;

commit;
