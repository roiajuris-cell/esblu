begin;

-- =============================================================================
-- Esblu — základ firemných účtov: companies + company_members
-- =============================================================================
-- Kontext: príprava na firemné (multi-user) účty. Dnes je Esblu striktne
-- 1 auth.users riadok = 1 samostatný účet, všetky business dáta sú viazané
-- na `user_id` (auth.uid() = user_id v RLS). Táto migrácia zavádza IBA
-- základ firemného modelu (companies, company_members, role, prázdny
-- permissions základ) a bezpečný backfill existujúcich používateľov.
--
-- Táto migrácia je čisto ADITÍVNA:
--   - vytvára iba dve nové tabuľky (companies, company_members), ich
--     CHECK/UNIQUE/FK constrainty, indexy, RLS policies a grants,
--   - NEVYTVÁRA žiadnu novú funkciu ani trigger na `auth.users` ani na
--     `public.settings` — existujúca funkcia/trigger
--     esblu_create_settings_for_new_user() nie je touto migráciou vôbec
--     dotknutá (pozri bod 6 nižšie, prečo sa automatický "company po
--     settings insert" trigger v tejto fáze zámerne nevytvára),
--   - NEMENÍ žiadnu existujúcu tabuľku, stĺpec, RLS policy, grant ani funkciu,
--   - NEPRIDÁVA `company_id` do žiadnej business tabuľky (ai_evidence,
--     documents, document_links, document_attachments, document_review_log,
--     vehicles, vehicle_services, machines, machine_services, machine_photos,
--     inventory_items, inventory_photos) — ich dnešné RLS (auth.uid() = user_id)
--     ostáva presne také, aké je dnes,
--   - NEMENÍ Storage buckets, cesty ani Storage RLS policies,
--   - NEPRESÚVA settings.plan, settings.logo_path ani iné settings údaje —
--     `settings` zostáva nezmenená a naďalej jediným zdrojom firemného
--     názvu/loga/plánu pre existujúci frontend.
--
-- Zámerne mimo rozsahu tejto migrácie (vedomé rozhodnutie, ďalšia fáza):
--   - žiadny INSERT/UPDATE/DELETE prístup pre klienta na companies ani
--     company_members (žiadny invite flow, žiadny role/permission editor,
--     žiadny owner-transfer) — jediný spôsob zápisu je backfill v tejto
--     migrácii; budúce zápisy pôjdu cez samostatné SECURITY DEFINER funkcie,
--     ktoré vedia rozlíšiť "nová firma pri registrácii" od "prijatie
--     pozvánky do existujúcej firmy" (návrh v reporte, neimplementované),
--   - automatické vytvorenie company pre KAŽDÝ nový auth.users/settings
--     riadok sa v tejto fáze zámerne NEROBÍ (pozri bod 6) — bez toho by
--     budúci employee-invite flow nemal spôsob, ako odlíšiť "nový majiteľ sa
--     registruje" od "pozvaný zamestnanec si zakladá účet",
--   - business permission systém (AI Evidencia / Stroje / Sklad / Vozidlá /
--     Nastavenia) sa nepresadzuje ani v RLS, ani v aplikácii — iba dátový
--     základ (role, permissions jsonb) je pripravený, aby sa dal bezpečne
--     doplniť v nasledujúcej fáze.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. companies
-- -----------------------------------------------------------------------------

-- owner_id je zámerne `on delete restrict`, NIE `on delete cascade`: firma je
-- (budúci) nadradený tenant pre dokumenty/vozidlá/stroje/sklad a nesmie
-- zmiznúť len preto, že sa zmaže Auth účet ownera. Kým firma existuje a má
-- tohto ownera, Postgres zmazanie auth.users riadku odmietne (foreign key
-- violation) — vlastníka je nutné najprv explicitne previesť na iného
-- používateľa (budúca owner-transfer funkcionalita) alebo firmu zrušiť, nie
-- ticho stratiť dáta cez cascade.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,

  constraint companies_name_not_blank_check check (btrim(name) <> '')
);

create index companies_owner_id_idx
  on public.companies (owner_id);

comment on table public.companies is
  'Firemný účet (tenant). Zámerne minimálny základ — plan/logo/company_name ostávajú zatiaľ v public.settings, nie sú sem presúvané.';
comment on column public.companies.owner_id is
  'auth.users.id skutočného vlastníka firmy. ON DELETE RESTRICT: auth.users riadok ownera sa nedá zmazať, kým je vlastníkom existujúcej firmy. Meniteľné iba budúcou owner-transfer funkcionalitou (dnes neexistuje), nikdy priamo klientom.';


-- -----------------------------------------------------------------------------
-- 2. company_members
-- -----------------------------------------------------------------------------

-- user_id ostáva zámerne `on delete cascade` (na rozdiel od companies.owner_id
-- vyššie): zmazanie Auth účtu tu zmaže iba TOTO JEDNO membership prepojenie
-- (riadok "tento user je členom tejto firmy"), nie samotnú firmu ani jej dáta
-- — company_id smeruje na companies nezávisle a nie je týmto FK nijako
-- dotknutý. Ak by zmazaný user bol owner, companies.owner_id FK (RESTRICT)
-- zmazanie auth.users riadku odmietne skôr, než by k tomuto cascade vôbec
-- došlo — takže cascade tu nikdy nemôže osirotiť firmu bez ownera.
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  role text not null,
  status text not null,

  -- Pripravený, zatiaľ prázdny základ pre budúce jemnejšie oprávnenia
  -- zamestnancov (napr. {"ai_documents": {"delete": false, "export": false}}).
  -- Bezpečnostne dôležité (pozri poznámku nižšie pri RLS): tento stĺpec dnes
  -- NEMÁ žiadnu klientsky dosiahnuteľnú INSERT/UPDATE cestu (žiadna write
  -- policy na túto tabuľku neexistuje), takže default hodnota aj samotná
  -- existencia stĺpca sú bezpečné už teraz — permissions sa v tejto fáze
  -- nikde nečítajú ani nevyhodnocujú, slúžia iba ako pripravená schéma.
  permissions jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz null,

  constraint company_members_role_check check (
    role in ('owner', 'admin', 'employee')
  ),
  constraint company_members_status_check check (
    status in ('active', 'invited', 'disabled')
  ),
  constraint company_members_unique_company_user unique (company_id, user_id)
);

create index company_members_user_id_idx
  on public.company_members (user_id);

comment on table public.company_members is
  'Členstvo používateľa vo firme + rola. owner/admin majú v aplikácii plný prístup vyplývajúci priamo z role (nie z permissions); permissions jsonb je zatiaľ nevyužívaný pripravený základ pre budúce jemnejšie oprávnenia role employee.';
comment on column public.company_members.permissions is
  'Zatiaľ nevyužívané v žiadnej RLS ani aplikačnej logike. Owner/admin prístup sa odvodzuje výhradne od role, nikdy od tohto stĺpca (aby permissions jsonb nemohol byť cestou k privilege escalation).';


-- -----------------------------------------------------------------------------
-- 3. RLS — companies
-- -----------------------------------------------------------------------------

alter table public.companies enable row level security;

revoke all on table public.companies from public, anon, authenticated;
grant select on table public.companies to authenticated;

-- Používateľ vidí iba firmu, v ktorej má aktívne členstvo. Zámerne žiadna
-- INSERT/UPDATE/DELETE policy pre authenticated: vytváranie firmy ide
-- výhradne cez backfill nižšie v tejto migrácii (mimo RLS, beží ako vlastník
-- tabuľky); owner-transfer a editácia firemných údajov cez klienta nie sú
-- v tejto fáze potrebné ani povolené — bez GRANT aj bez policy by taký
-- pokus zlyhal na oboch úrovniach.
--
-- Bez self-recursion: subquery nižšie číta company_members, ale filtruje
-- iba `m.user_id = auth.uid()` — presne tá istá podmienka, akú (nižšie)
-- povoľuje company_members_select_own. Keď Postgres vyhodnocuje tento
-- subquery, aplikuje naň RLS policy company_members_select_own znova, ale tá
-- pre riadky s `user_id = auth.uid()` vráti true priamo z porovnania stĺpca
-- (žiadny ďalší self-query), takže sa reťazec vyhodnotenia po jednom kroku
-- ukončí — nejde o neobmedzenú rekurziu.
create policy companies_select_member
  on public.companies
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_members m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );


-- -----------------------------------------------------------------------------
-- 4. RLS — company_members
-- -----------------------------------------------------------------------------

alter table public.company_members enable row level security;

revoke all on table public.company_members from public, anon, authenticated;
grant select on table public.company_members to authenticated;

-- Konzervatívny variant: používateľ vidí VÝHRADNE vlastný membership riadok.
-- Žiadny self-query na company_members v tejto policy (na rozdiel od
-- pôvodného návrhu) — podmienka je čisté porovnanie stĺpca `user_id =
-- auth.uid()`, takže PostgreSQL RLS nemá dôvod pri vyhodnocovaní tejto
-- policy znova čítať tú istú tabuľku a nehrozí žiadna rekurzia.
--
-- Owner/admin v tejto fáze zámerne NEVIDIA membership ostatných členov firmy
-- (nemáme ešte UI na správu používateľov, takže to nie je potrebné). Keď sa
-- bude implementovať správa používateľov, "owner/admin vidí všetkých členov
-- svojej firmy" sa má vyriešiť cez samostatnú SECURITY DEFINER helper
-- funkciu (napr. `esblu_list_company_members(company_id)`), ktorá beží mimo
-- RLS a sama si interne overí, že volajúci je v danej firme owner/admin —
-- NIE cez self-referencing RLS policy na tejto tabuľke.
--
-- Zámerne žiadna INSERT/UPDATE/DELETE policy: pridávanie/rušenie členov a
-- zmena role/status/permissions nie sú v tejto fáze klientsky dosiahnuteľné
-- vôbec (žiadny invite flow, žiadny role/permission editor). Jediný spôsob
-- zápisu je backfill nižšie v tejto migrácii, ktorý beží mimo RLS. Bez GRANT
-- INSERT/UPDATE/DELETE pre authenticated by takýto pokus zlyhal už na
-- úrovni oprávnení, ešte pred vyhodnotením RLS.
create policy company_members_select_own
  on public.company_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
  );


-- -----------------------------------------------------------------------------
-- 5. Pre-flight kontroly pred backfillom (explicitné zlyhanie namiesto
--    tichého poškodenia dát)
-- -----------------------------------------------------------------------------

do $preflight$
declare
  duplicate_user_ids text;
  null_user_id_count bigint;
  orphaned_user_ids text;
begin
  -- 5a. Duplicitné settings.user_id. `settings_user_id_key` (UNIQUE) toto už
  -- dnes na DB úrovni znemožňuje — táto kontrola je vedomá dodatočná poistka
  -- pre prípad, že by v niektorom prostredí tento constraint chýbal.
  select string_agg(user_id::text, ', ' order by user_id::text)
  into duplicate_user_ids
  from (
    select user_id
    from public.settings
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) duplicates;

  if duplicate_user_ids is not null then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_BACKFILL_DUPLICATE_SETTINGS_USER_ID:' || duplicate_user_ids,
      hint = 'Vyrieš duplicitné settings riadky ručne pred spustením tejto migrácie.';
  end if;

  -- 5b. settings.user_id je nullable (potvrdené v docs/db/schema-baseline).
  -- NULL riadok nie je viazaný na žiadneho reálneho používateľa a nemôže
  -- dostať vlastníka firmy — zlyhaj explicitne namiesto tichého vynechania.
  select count(*) into null_user_id_count
  from public.settings
  where user_id is null;

  if null_user_id_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_BACKFILL_NULL_SETTINGS_USER_ID:' || null_user_id_count::text,
      hint = 'Preveruj settings riadky s NULL user_id ručne pred spustením tejto migrácie.';
  end if;

  -- 5c. settings.user_id, ktoré neexistuje v auth.users (settings.user_id
  -- dnes nemá FK na auth.users — potvrdené v docs/db/schema-baseline).
  select string_agg(s.user_id::text, ', ' order by s.user_id::text)
  into orphaned_user_ids
  from public.settings s
  where s.user_id is not null
    and not exists (select 1 from auth.users u where u.id = s.user_id);

  if orphaned_user_ids is not null then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_BACKFILL_ORPHANED_SETTINGS_USER_ID:' || orphaned_user_ids,
      hint = 'settings.user_id neexistuje v auth.users. Preveruj ručne pred spustením tejto migrácie.';
  end if;

  -- 5d. companies a company_members sú vytvorené touto istou migráciou
  -- o pár riadkov vyššie, takže pred backfillom musia byť úplne prázdne.
  -- Akýkoľvek existujúci riadok tu znamená neočakávaný stav (napr. migrácia
  -- už raz čiastočne prebehla, alebo niečo iné do týchto tabuliek medzitým
  -- zapísalo) — fail-closed namiesto tichého preskočenia backfillu alebo
  -- rizika duplicitných firiem.
  if exists (select 1 from public.companies limit 1) then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_BACKFILL_UNEXPECTED_EXISTING_COMPANIES',
      hint = 'public.companies obsahuje riadky ešte pred backfillom tejto migrácie. Preveruj ručne, prečo — migrácia sa nemá spúšťať opakovane bez kontroly.';
  end if;

  if exists (select 1 from public.company_members limit 1) then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_BACKFILL_UNEXPECTED_EXISTING_MEMBERSHIP',
      hint = 'public.company_members obsahuje riadky ešte pred backfillom tejto migrácie. Preveruj ručne, prečo — migrácia sa nemá spúšťať opakovane bez kontroly.';
  end if;
end
$preflight$;


-- -----------------------------------------------------------------------------
-- 6. Backfill — 1 company + 1 owner membership pre každý existujúci
--    settings.user_id
-- -----------------------------------------------------------------------------
-- Fail-closed, bez ticheho preskakovania: pre-flight kontrola 5d už
-- zaručila, že companies aj company_members sú pred týmto blokom úplne
-- prázdne, a kontroly 5a/5b/5c zaručili, že každý spracovaný
-- settings.user_id je unikátny, nenulový a existuje v auth.users. Za tohto
-- stavu je 1 riadok settings.user_id = 1 nová firma jednoznačné a
-- deterministické — preto tu zámerne NIE JE žiadna "ak už existuje, presko-
-- č" vetva. Ak by napriek tomu nastal neočakávaný duplicitný insert (napr.
-- porušenie unique(company_id, user_id)), Postgres to nahlási ako chybu a
-- CELÁ migrácia (begin/commit) sa vráti späť — fail-closed, nie tiché
-- preskočenie používateľa.

do $backfill$
declare
  settings_row record;
  new_company_id uuid;
  created_count integer := 0;
begin
  for settings_row in
    select s.user_id, s.company_name
    from public.settings s
    where s.user_id is not null
    order by s.user_id
  loop
    insert into public.companies (owner_id, name)
    values (
      settings_row.user_id,
      coalesce(nullif(trim(settings_row.company_name), ''), 'Moja firma')
    )
    returning id into new_company_id;

    insert into public.company_members (company_id, user_id, role, status)
    values (new_company_id, settings_row.user_id, 'owner', 'active');

    created_count := created_count + 1;
  end loop;

  raise notice 'Company backfill: % companies created.', created_count;
end
$backfill$;


-- -----------------------------------------------------------------------------
-- 6b. Post-flight kontroly — over, že backfill vytvoril presne 1:1 mapovanie
-- -----------------------------------------------------------------------------
-- Garantuje: počet relevantných settings.user_id = počet companies s takýmto
-- ownerom = počet company_members(role='owner', status='active') pre tých
-- istých používateľov, a že neexistuje relevantný používateľ bez firmy/owner
-- membershipu. Akákoľvek nezhoda = fail-closed (RAISE EXCEPTION), celá
-- migrácia sa vráti späť namiesto ponechania čiastočne nekonzistentného stavu.

do $postflight$
declare
  expected_count bigint;
  companies_count bigint;
  owner_members_count bigint;
  missing_count bigint;
begin
  select count(*) into expected_count
  from public.settings
  where user_id is not null;

  select count(*) into companies_count
  from public.companies c
  where exists (
    select 1 from public.settings s where s.user_id = c.owner_id
  );

  select count(*) into owner_members_count
  from public.company_members m
  where m.role = 'owner'
    and m.status = 'active'
    and exists (
      select 1 from public.settings s where s.user_id = m.user_id
    );

  if companies_count <> expected_count then
    raise exception using
      errcode = 'P0001',
      message = format(
        'COMPANY_BACKFILL_POSTFLIGHT_COMPANY_COUNT_MISMATCH:expected=%s,actual=%s',
        expected_count, companies_count
      ),
      hint = 'Počet vytvorených companies nesedí s počtom relevantných settings.user_id. Preveruj ručne, migrácia sa vracia späť.';
  end if;

  if owner_members_count <> expected_count then
    raise exception using
      errcode = 'P0001',
      message = format(
        'COMPANY_BACKFILL_POSTFLIGHT_OWNER_MEMBERSHIP_COUNT_MISMATCH:expected=%s,actual=%s',
        expected_count, owner_members_count
      ),
      hint = 'Počet owner/active company_members riadkov nesedí s počtom relevantných settings.user_id. Preveruj ručne, migrácia sa vracia späť.';
  end if;

  select count(*) into missing_count
  from public.settings s
  where s.user_id is not null
    and not exists (
      select 1
      from public.company_members m
      where m.user_id = s.user_id
        and m.role = 'owner'
        and m.status = 'active'
    );

  if missing_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_BACKFILL_POSTFLIGHT_USERS_WITHOUT_OWNER_MEMBERSHIP:' || missing_count::text,
      hint = 'Existuje aspoň jeden relevantný settings.user_id bez zodpovedajúceho owner/active company_members riadku. Preveruj ručne, migrácia sa vracia späť.';
  end if;

  raise notice 'Company backfill post-flight OK: % používateľov, % companies, % owner memberships.',
    expected_count, companies_count, owner_members_count;
end
$postflight$;


-- -----------------------------------------------------------------------------
-- 7. Nová registrácia — ZÁMERNE BEZ automatického triggera v tejto fáze
-- -----------------------------------------------------------------------------
-- Táto migrácia VEDOME nevytvára žiadny trigger na `auth.users` ani na
-- `public.settings`, ktorý by po každom novom settings riadku automaticky
-- založil novú company + owner membership.
--
-- Dôvod: takýto trigger by nevedel rozlíšiť dve odlišné budúce situácie,
-- ktoré na úrovni "nový auth.users + nový settings riadok" vyzerajú úplne
-- rovnako:
--   1. bežná registrácia nového MAJITEĽA firmy (má dostať vlastnú novú
--      company + role='owner'),
--   2. založenie Auth účtu POZVANÝM zamestnancom (má sa stať members
--      role='employee'/'admin' EXISTUJÚCEJ company, nie ownerom novej).
--
-- Existujúci trigger esblu_create_settings_after_auth_user_insert (mimo
-- tejto migrácie, nezmenený) bude naďalej korektne vytvárať settings riadok
-- pre každého nového Auth používateľa presne ako doteraz — na tom sa nič
-- nemení. Iba krok "settings -> companies/company_members" sa v tejto fáze
-- vôbec nevykonáva automaticky.
--
-- Praktický dôsledok do vyriešenia invite flow: noví používatelia, ktorí sa
-- zaregistrujú PO aplikovaní tejto migrácie, dostanú settings riadok (ako
-- doteraz), ale NEDOSTANÚ automaticky company/company_members riadok. Toto
-- je vedomá, dočasná medzera — existujúci frontend dnes nič z companies/
-- company_members nečíta ani nevyžaduje, takže nič vo funkčnosti appky
-- nezlyhá. Bezpečné doriešenie (owner-signup vs. employee-invite rozlíšenie)
-- je navrhnuté v reporte k tejto migrácii, zámerne bez implementácie tu.

commit;
