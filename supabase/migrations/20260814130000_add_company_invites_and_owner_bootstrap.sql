begin;

-- =============================================================================
-- Esblu — company_invites + bezpečný owner bootstrap a invite accept flow
-- =============================================================================
-- Nadväzuje na:
--   20260814110000_add_companies_and_company_members.sql (aplikovaná do
--   produkcie — companies, company_members, role/status/permissions základ,
--   backfill existujúcich používateľov na role='owner', status='active').
--   20260814120000_add_company_id_to_business_tables.sql (aplikovaná do
--   produkcie — nullable company_id na 12 business tabuľkách, backfill).
--
-- Táto verzia migrácie (revízia pred prvým apply do produkcie, nikdy predtým
-- aplikovaná) obsahuje opravy zo security auditu:
--   1. `esblu_ensure_my_owner_company()` už NEBLOKUJE bootstrap na základe
--      existencie pending pozvánky pre daný e-mail (pôvodná kontrola bola
--      DoS/griefing vektor — ktorýkoľvek owner mohol ľubovoľný cudzí e-mail
--      "pozvať" a tým mu na dobu platnosti pozvánky zablokovať bežnú
--      registráciu). Frontend už túto funkciu nevolá globálne/fire-and-forget
--      pri každej session (pozri app/page.tsx), iba v explicitnom
--      owner-registration/onboarding flow (app/login/page.tsx). Invite-accept
--      flow (app/invite/[token]/page.tsx) túto funkciu nikdy nevolá.
--   2. Správa používateľov (`esblu_list_my_company_members`,
--      `esblu_list_my_company_invites`, `esblu_create_company_invite`) je
--      teraz zosúladená s rolami Esblu: owner AJ admin majú plný firemný
--      prístup k správe používateľov; employee nemá prístup ani cez RPC.
--   3. Všetky SECURITY DEFINER funkcie majú `set search_path = ''` (namiesto
--      explicitného zoznamu schém) — každý objekt v tele funkcie je
--      schema-qualifikovaný (`public.*`, `auth.*`, `extensions.*`). pg_catalog
--      je Postgresom vždy implicitne prehľadávaná bez ohľadu na search_path,
--      takže vstavané funkcie (lower, btrim, now, count, ...) fungujú aj s
--      prázdnym search_path.
--   4. `esblu_get_invite_preview()` už nevracia celý cieľový e-mail
--      anonymnému volajúcemu — iba maskovanú verziu vhodnú pre UI.
--   5. Inštalácia pgcrypto je teraz fail-closed: migrácia po CREATE EXTENSION
--      IF NOT EXISTS explicitne overí, že pgcrypto skutočne beží v schéme
--      `extensions` (CREATE EXTENSION IF NOT EXISTS existujúci extension v
--      inej schéme MLČKY NEPRESUNIE — iba preskočí), a ak nie, migrácia
--      zlyhá s jasnou chybou namiesto tichého nasadenia RPC, ktoré by pri
--      prvom volaní padli na "function extensions.digest does not exist".
--
-- Cieľ tejto migrácie (fáza: registrácia majiteľa + pozvánky, BEZ company-
-- based business RLS a BEZ employee prístupu k business modulom):
--   1. nová tabuľka `company_invites` (hashovaný token, expirácia, stav),
--   2. `public.esblu_ensure_my_owner_company()` — bezpečný, idempotentný
--      bootstrap company/owner membership pre nového majiteľa, odvodený
--      výhradne z auth.uid(), volaný iba z explicitného owner-onboarding
--      flow (nie globálne pri každej session),
--   3. `public.esblu_create_company_invite(p_email, p_role)` — iba aktívny
--      owner ALEBO admin môže vytvoriť pozvánku pre svoju vlastnú firmu,
--   4. `public.esblu_get_invite_preview(p_token)` — bezpečný, anonymne
--      dostupný náhľad pozvánky (maskovaný e-mail, na zobrazenie pred
--      prihlásením/registráciou),
--   5. `public.esblu_accept_company_invite(p_token)` — atomické prijatie
--      pozvánky, s overením e-mailu, expirácie a jednorazovosti tokenu,
--   6. `public.esblu_list_my_company_members()` / `..._invites()` — iba pre
--      aktívneho owner/admin — read-only helpery pre UI "Nastavenia →
--      Používatelia",
--   7. DB-vynútený invariant: 1 auth user = maximálne 1 aktívne membership
--      (partial unique index na company_members).
--
-- Táto migrácia je čisto ADITÍVNA:
--   - NEMENÍ žiadnu existujúcu tabuľku, stĺpec, RLS policy ani grant na
--     companies/company_members zavedené v 20260814110000,
--   - NEMENÍ žiadnu z 12 business tabuliek ani ich RLS (stále auth.uid() =
--     user_id, presne ako dnes),
--   - NEMENÍ Storage (buckets, cesty, policies),
--   - NEVYTVÁRA žiadny trigger na auth.users ani public.settings — existujúci
--     esblu_create_settings_after_auth_user_insert nie je dotknutý,
--   - NEPRESADZUJE employee/admin business permissions (mimo rozsahu tejto
--     fázy — pozri report).
--
-- Bezpečnostný model tokenu (pozri aj sekciu 2 nižšie):
--   - klient dostane raz (iba pri vytvorení pozvánky, v return hodnote RPC)
--     náhodný 256-bitový token (32 bajtov z pgcrypto gen_random_bytes,
--     hex-kódovaný),
--   - DB uchováva IBA sha-256 hash tohto tokenu (`token_hash`), nikdy raw
--     token,
--   - token_hash je UNIQUE, takže dva rôzne tokeny nemôžu kolidovať a token
--     nemožno "uhádnuť" cez porovnanie s existujúcimi hashmi bez poznania
--     raw hodnoty,
--   - pozvánka má `expires_at` a explicitný `status` (pending/accepted/
--     revoked/expired) — po úspešnom prijatí sa `status` mení na 'accepted'
--     a `esblu_accept_company_invite` pre už neplatný status vždy zlyhá,
--     takže token nie je možné použiť druhýkrát.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. pgcrypto — potrebné pre gen_random_bytes() (token) a digest() (hash)
-- -----------------------------------------------------------------------------
-- Fail-closed inštalácia: `create extension if not exists ... with schema x`
-- extension, ktorý už existuje v INEJ schéme, MLČKY NEPRESUNIE — iba
-- preskočí (no-op). Bez explicitnej kontroly nižšie by sme si mohli
-- "úspešne" aplikovať migráciu, ktorej RPC funkcie (nižšie, natvrdo
-- `extensions.gen_random_bytes` / `extensions.digest`) by pri PRVOM
-- reálnom volaní (napr. pri vytváraní prvej pozvánky) padli na
-- "function extensions.digest(...) does not exist". Preto:
--   1. zabezpečíme existenciu schémy `extensions`,
--   2. pokúsime sa nainštalovať pgcrypto do nej (no-op, ak už existuje inde),
--   3. explicitne overíme, že pgcrypto SKUTOČNE beží v schéme `extensions`
--      — ak nie, migrácia zlyhá s jasnou chybou namiesto tichého nasadenia
--      neskôr padajúcich funkcií.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

do $verify_pgcrypto_schema$
declare
  v_actual_schema text;
begin
  select n.nspname into v_actual_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_actual_schema is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_PGCRYPTO_NOT_INSTALLED',
      hint = 'Extension pgcrypto sa nepodarilo nainštalovať ani nájsť. Over manuálne v Supabase Dashboard → Database → Extensions pred opätovným spustením tejto migrácie.';
  end if;

  if v_actual_schema <> 'extensions' then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_PGCRYPTO_UNEXPECTED_SCHEMA:' || v_actual_schema,
      hint = format(
        'pgcrypto je už nainštalovaný v schéme "%s", nie v "extensions" (CREATE EXTENSION IF NOT EXISTS ho v tomto prípade nepresunul, iba preskočil). Funkcie v tejto migrácii volajú %I.gen_random_bytes/digest natvrdo cez schému "extensions". Buď migráciu uprav tak, aby používala schému "%s", alebo pgcrypto manuálne presuň (ALTER EXTENSION pgcrypto SET SCHEMA extensions) a migráciu spusti znova.',
        v_actual_schema, v_actual_schema, v_actual_schema
      );
  end if;
end
$verify_pgcrypto_schema$;


-- -----------------------------------------------------------------------------
-- 1. company_invites
-- -----------------------------------------------------------------------------

create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  email text not null,
  role text not null,

  invited_by uuid not null references auth.users(id) on delete restrict,

  token_hash text not null,

  status text not null default 'pending',

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_by uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,

  constraint company_invites_role_check check (
    role in ('admin', 'employee')
  ),
  constraint company_invites_status_check check (
    status in ('pending', 'accepted', 'revoked', 'expired')
  ),
  constraint company_invites_email_not_blank_check check (btrim(email) <> ''),
  constraint company_invites_email_normalized_check check (
    email = lower(btrim(email))
  ),
  constraint company_invites_token_hash_length_check check (
    length(token_hash) = 64
  ),
  constraint company_invites_expires_after_created_check check (
    expires_at > created_at
  ),
  constraint company_invites_accepted_consistency_check check (
    (status = 'accepted' and accepted_at is not null and accepted_by is not null)
    or (status <> 'accepted' and accepted_at is null and accepted_by is null)
  )
);

-- token_hash je jediný spôsob, ako nájsť pozvánku podľa tokenu z linku —
-- musí byť unikátny (kolízia by inak mohla vrátiť cudziu pozvánku).
create unique index company_invites_token_hash_key
  on public.company_invites (token_hash);

create index company_invites_company_id_idx
  on public.company_invites (company_id);

create index company_invites_email_idx
  on public.company_invites (email);

-- Rýchle vyhľadanie "existuje už aktívna neexpirovaná pozvánka pre tento
-- email v tejto firme?" pri vytváraní novej pozvánky.
create index company_invites_pending_lookup_idx
  on public.company_invites (company_id, email)
  where status = 'pending';

comment on table public.company_invites is
  'Pozvánky do firmy pre budúcich admin/employee členov. Token sa v DB nikdy neukladá v čitateľnej podobe — iba sha-256 hash (token_hash). Jediný klientsky dosiahnuteľný prístup je cez SECURITY DEFINER RPC funkcie nižšie, nie priamy INSERT/SELECT.';
comment on column public.company_invites.token_hash is
  'sha-256(hex) hash raw tokenu vygenerovaného cez pgcrypto gen_random_bytes(32). Raw token sa vracia klientovi iba raz, pri vytvorení pozvánky, a nikde v DB nie je uložený.';
comment on column public.company_invites.status is
  'pending = čaká na prijatie; accepted = úspešne spotrebovaná (jednorazovo, nedá sa použiť znova); revoked = zrušená ownerom (zatiaľ bez UI v tejto fáze, pripravené pre budúcnosť); expired = expires_at uplynul (vyhodnocuje sa dynamicky pri čítaní, nie je perzistentne nastavovaný — pozri esblu_accept_company_invite).';


-- -----------------------------------------------------------------------------
-- 2. RLS — company_invites
-- -----------------------------------------------------------------------------
-- Rovnaký bezpečnostný vzor ako companies/company_members v 20260814110000:
-- RLS zapnuté, VŠETKY grants pre public/anon/authenticated odobraté a žiadna
-- policy pre priamy INSERT/SELECT/UPDATE/DELETE neexistuje. Jediný spôsob
-- prístupu je cez SECURITY DEFINER funkcie nižšie (bežia ako vlastník
-- tabuľky, teda mimo RLS aj mimo potreby priamych grantov) — presne to, čo
-- zadanie vyžaduje ("Nestačí frontend zistil role=owner → DB musí sama
-- overiť").

alter table public.company_invites enable row level security;

revoke all on table public.company_invites from public, anon, authenticated;

-- Zámerne žiadna CREATE POLICY tu — bez akejkoľvek policy a bez GRANT by aj
-- prípadný budúci omyl (napr. zabudnutý REVOKE) stále neumožnil priamy
-- prístup, pretože RLS s "default deny" a chýbajúci grant sa musia zhodnúť
-- obe naraz, aby čokoľvek prešlo.


-- -----------------------------------------------------------------------------
-- 3. Invariant: 1 auth user = maximálne 1 AKTÍVNE membership
-- -----------------------------------------------------------------------------
-- Zadanie (bod 12 pôvodného zadania): jeden auth user je buď owner, admin,
-- alebo employee PRESNE jednej firmy naraz. `unique(company_id, user_id)` z
-- predchádzajúcej migrácie toto samo osebe nezaručuje (ten istý user by
-- mohol mať aktívne membership vo viacerých rôznych companies). Pridávame
-- preto partial unique index iba nad `status = 'active'` riadkami —
-- 'invited'/'disabled' riadky (dnes sa nepoužívajú, status='invited' na
-- company_members je len pripravená hodnota z 20260814110000, neplniaca sa
-- touto migráciou) nie sú obmedzené, takže tento index nebráni budúcemu
-- historickému/auditnému použitiu iných statusov.
--
-- Pre-flight: dnešná produkcia má potvrdené presne 1:1:1 (settings users =
-- companies = active owner memberships), takže očakávaný počet porušení je
-- 0. Napriek tomu explicitná kontrola pred vytvorením indexu — fail-closed,
-- nie tichý pokus, ktorý by pri zlyhaní nechal nejasnú DB chybu.

do $preflight_multi_active_membership$
declare
  violating_user_ids text;
begin
  select string_agg(user_id::text, ', ' order by user_id::text)
  into violating_user_ids
  from (
    select user_id
    from public.company_members
    where status = 'active'
    group by user_id
    having count(*) > 1
  ) duplicates;

  if violating_user_ids is not null then
    raise exception using
      errcode = 'P0001',
      message = 'COMPANY_INVITES_MULTI_ACTIVE_MEMBERSHIP:' || violating_user_ids,
      hint = 'Aspoň jeden auth user má viac než 1 aktívne company_members membership. Preveruj ručne pred spustením tejto migrácie — invariant "max 1 aktívna company na používateľa" sa nedá bezpečne vynútiť, kým toto nie je vyriešené.';
  end if;
end
$preflight_multi_active_membership$;

create unique index company_members_one_active_per_user_idx
  on public.company_members (user_id)
  where status = 'active';

comment on index public.company_members_one_active_per_user_idx is
  'Vynucuje invariant: 1 auth user má maximálne 1 aktívne (status=active) company_members membership naraz — teda je owner/admin/employee najviac jednej firmy súčasne. Esblu zatiaľ nemá multi-company switcher.';


-- -----------------------------------------------------------------------------
-- 4. public.esblu_ensure_my_owner_company()
-- -----------------------------------------------------------------------------
-- Bezpečný, idempotentný bootstrap pre bežnú registráciu NOVÉHO MAJITEĽA.
-- Volá sa VÝHRADNE z explicitného owner-registration/onboarding flow na
-- frontende (app/login/page.tsx — po úspešnom register()/login()), NIE
-- globálne pri každej session (app/page.tsx túto funkciu nevolá). Invite-
-- accept flow (app/invite/[token]/page.tsx) túto funkciu NIKDY nevolá.
--
-- Bezpečnostné záruky:
--   - identita volajúceho sa berie VÝHRADNE z auth.uid() — klient nikdy
--     neposiela user_id, company_id ani role,
--   - ak už volajúci má akékoľvek aktívne membership (vlastná firma alebo
--     prijatá pozvánka), funkcia je no-op a vráti existujúcu company_id —
--     bezpečná proti opakovanému volaniu,
--   - NEBLOKUJE bootstrap na základe existencie pending pozvánky pre e-mail
--     volajúceho (pôvodná verzia to robila — bola to DoS/griefing diera:
--     ktorýkoľvek owner mohol ľubovoľný cudzí, neoverený e-mail "pozvať" a
--     tým mu zablokovať bežnú registráciu až do expirácie pozvánky). Ochrana
--     pred duplicitnou firmou pre používateľa, ktorý MEDZITÝM prijme
--     pozvánku, je teraz VÝHRADNE na `esblu_accept_company_invite()` (tá
--     zlyhá s ESBLU_ALREADY_HAS_ACTIVE_MEMBERSHIP, ak si používateľ medzičasom
--     založil vlastnú firmu skôr, než pozvánku prijal) — pozri detailný
--     rozbor poradia/race v reporte,
--   - konkurenčné súbežné volania sú bezpečné vďaka
--     company_members_one_active_per_user_idx: ak by napriek prvej kontrole
--     dorazili dva súbežné INSERTy, druhý narazí na unique_violation a
--     funkcia namiesto pádu vráti už vytvorenú company_id prvého volania.

create or replace function public.esblu_ensure_my_owner_company()
returns table (company_id uuid, role text, created boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_email text;
  v_existing record;
  v_company_id uuid;
  v_company_name text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'NOT_AUTHENTICATED';
  end if;

  -- Už existujúce aktívne membership (vlastná firma alebo prijatá pozvánka)
  -- => no-op, vráť existujúci stav.
  select m.company_id, m.role
  into v_existing
  from public.company_members m
  where m.user_id = v_uid
    and m.status = 'active'
  limit 1;

  if found then
    return query select v_existing.company_id, v_existing.role, false;
    return;
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_AUTH_USER_EMAIL_NOT_FOUND';
  end if;

  v_email := lower(btrim(v_email));

  select coalesce(nullif(btrim(s.company_name), ''), 'Moja firma')
  into v_company_name
  from public.settings s
  where s.user_id = v_uid
  limit 1;

  v_company_name := coalesce(v_company_name, 'Moja firma');

  begin
    insert into public.companies (owner_id, name)
    values (v_uid, v_company_name)
    returning id into v_company_id;

    insert into public.company_members (company_id, user_id, role, status)
    values (v_company_id, v_uid, 'owner', 'active');
  exception
    when unique_violation then
      -- Súbežné druhé volanie medzičasom vytvorilo membership. Bezpečne sa
      -- vzdaj vlastného (prípadne osirelého) inzertu a vráť existujúci stav.
      select m.company_id, m.role
      into v_existing
      from public.company_members m
      where m.user_id = v_uid
        and m.status = 'active'
      limit 1;

      if not found then
        -- Nemalo by nastať (unique_violation na company_members_one_active_
        -- per_user_idx implikuje existenciu riadku), ale fail-closed namiesto
        -- tichého NULL výsledku.
        raise exception using
          errcode = 'P0001',
          message = 'ESBLU_OWNER_BOOTSTRAP_RACE_UNRESOLVED';
      end if;

      return query select v_existing.company_id, v_existing.role, false;
      return;
  end;

  return query select v_company_id, 'owner'::text, true;
end;
$function$;

revoke all on function public.esblu_ensure_my_owner_company() from public;
grant execute on function public.esblu_ensure_my_owner_company() to authenticated;


-- -----------------------------------------------------------------------------
-- 5. public.esblu_create_company_invite(p_email, p_role)
-- -----------------------------------------------------------------------------
-- Aktívny OWNER ALEBO ADMIN volajúcej firmy môže vytvoriť pozvánku (owner a
-- admin majú v Esblu rovnaký plný firemný prístup k správe používateľov;
-- employee nikdy). Autorizácia sa overuje na DB úrovni z auth.uid() —
-- klient nemôže poslať cudzie company_id ani si "vybrať" rolu owner.
-- company_id sa VŽDY odvodzuje zo server-side membership volajúceho, nikdy
-- z klientského parametra.

create or replace function public.esblu_create_company_invite(
  p_email text,
  p_role text
)
returns table (invite_id uuid, token text, expires_at timestamptz, email text, role text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_company_id uuid;
  v_caller_role text;
  v_email text;
  v_role text;
  v_raw_token text;
  v_token_hash text;
  v_invite_id uuid;
  v_expires_at timestamptz;
  v_existing_member_count integer;
  v_existing_pending_count integer;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'NOT_AUTHENTICATED';
  end if;

  v_role := lower(btrim(coalesce(p_role, '')));

  if v_role not in ('admin', 'employee') then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVALID_INVITE_ROLE:' || coalesce(p_role, '');
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));

  if v_email = '' or v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVALID_INVITE_EMAIL';
  end if;

  -- Volajúci musí byť aktívny owner ALEBO admin PRESNE jednej firmy
  -- (invariant zo sekcie 3 garantuje, že aktívne membership je tu vždy
  -- najviac 1 riadok). Toto je jediné miesto, odkiaľ sa company_id pre
  -- pozvánku berie — nikdy priamo od klienta.
  select m.company_id, m.role into v_company_id, v_caller_role
  from public.company_members m
  where m.user_id = v_uid
    and m.status = 'active'
  limit 1;

  if v_company_id is null or v_caller_role not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'ESBLU_NOT_ACTIVE_OWNER_OR_ADMIN';
  end if;

  -- Pozývaný e-mail už je aktívnym členom (alebo ownerom) tejto firmy.
  select count(*) into v_existing_member_count
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = v_company_id
    and m.status = 'active'
    and lower(u.email) = v_email;

  if v_existing_member_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVITE_ALREADY_MEMBER';
  end if;

  -- Rovnaký e-mail už má aktívnu neexpirovanú pozvánku do TEJTO firmy.
  select count(*) into v_existing_pending_count
  from public.company_invites ci
  where ci.company_id = v_company_id
    and ci.email = v_email
    and ci.status = 'pending'
    and ci.expires_at > now();

  if v_existing_pending_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVITE_ALREADY_PENDING';
  end if;

  -- 256-bitový náhodný token. Iba tu, v návratovej hodnote, existuje raw
  -- token v čitateľnej podobe — do DB ide výhradne jeho sha-256 hash.
  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.company_invites (
    company_id, email, role, invited_by, token_hash, status, expires_at
  )
  values (
    v_company_id, v_email, v_role, v_uid, v_token_hash, 'pending', v_expires_at
  )
  returning id into v_invite_id;

  return query select v_invite_id, v_raw_token, v_expires_at, v_email, v_role;
end;
$function$;

revoke all on function public.esblu_create_company_invite(text, text) from public;
grant execute on function public.esblu_create_company_invite(text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 6. public.esblu_get_invite_preview(p_token)
-- -----------------------------------------------------------------------------
-- Bezpečný náhľad pozvánky BEZ prihlásenia — /invite/[token] stránka ho
-- potrebuje ešte pred tým, než sa používateľ zaregistruje alebo prihlási.
-- Vracia iba to, čo je nutné zobraziť (názov firmy, rola, MASKOVANÝ cieľový
-- e-mail, platnosť) — NIKDY plný e-mail, token_hash ani invited_by.
--
-- Maskovanie: `j***@e***.com` (prvé písmeno lokálnej časti + pevný počet '*'
-- + prvé písmeno domény + pevný počet '*' + TLD). Zámerne PEVNÝ počet
-- hviezdičiek (nie podľa dĺžky pôvodného reťazca) — inak by dĺžka masky
-- prezradila presnú dĺžku e-mailu. Skutočný e-mail sa porovnáva až server-
-- side v `esblu_accept_company_invite()` voči autentifikovanému
-- auth.users.email, takže maskovanie tu nijako neoslabuje bezpečnosť
-- prijatia pozvánky — frontend odteraz necháva používateľa zadať svoj
-- vlastný e-mail ručne namiesto predvyplnenia z náhľadu.
--
-- Neexistujúci/neplatný token vráti 0 riadkov (nie chybu s detailmi), aby sa
-- zbytočne neodlišovalo "neexistuje" od "expirovalo" na úrovni chybovej
-- správy z tejto funkcie — `valid` stĺpec v jedinom vrátenom riadku (ak sa
-- nájde) už tento rozdiel nesie bezpečne.

create or replace function public.esblu_get_invite_preview(p_token text)
returns table (
  company_name text,
  role text,
  masked_email text,
  expires_at timestamptz,
  valid boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token_hash text;
  v_company_name text;
  v_role text;
  v_email text;
  v_expires_at timestamptz;
  v_status text;
  v_at_pos integer;
  v_local text;
  v_domain text;
  v_domain_name text;
  v_tld text;
  v_masked_email text;
begin
  if p_token is null or btrim(p_token) = '' then
    return;
  end if;

  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select c.name, ci.role, ci.email, ci.expires_at, ci.status
  into v_company_name, v_role, v_email, v_expires_at, v_status
  from public.company_invites ci
  join public.companies c on c.id = ci.company_id
  where ci.token_hash = v_token_hash;

  if not found then
    return;
  end if;

  v_at_pos := position('@' in v_email);

  if v_at_pos > 1 then
    v_local := left(v_email, v_at_pos - 1);
    v_domain := substring(v_email from v_at_pos + 1);

    if position('.' in v_domain) > 0 then
      v_domain_name := regexp_replace(v_domain, '\.[^.]*$', '');
      v_tld := regexp_replace(v_domain, '^.*\.', '.');
    else
      v_domain_name := v_domain;
      v_tld := '';
    end if;

    v_masked_email :=
      left(v_local, 1) || '***@' ||
      left(nullif(v_domain_name, ''), 1) || '***' || v_tld;
  else
    -- Nemalo by nastať (email je validovaný pri vytváraní pozvánky), ale
    -- fail-closed defenzívna maska namiesto vyzradenia neparsovateľnej
    -- hodnoty.
    v_masked_email := '***@***';
  end if;

  return query
  select
    v_company_name,
    v_role,
    v_masked_email,
    v_expires_at,
    (v_status = 'pending' and v_expires_at > now());
end;
$function$;

revoke all on function public.esblu_get_invite_preview(text) from public;
grant execute on function public.esblu_get_invite_preview(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 7. public.esblu_accept_company_invite(p_token)
-- -----------------------------------------------------------------------------
-- Atomické prijatie pozvánky. Celá logika beží v jednej funkcii = jedna
-- implicitná transakcia; akýkoľvek RAISE EXCEPTION nižšie znamená, že sa
-- NEVYTVORÍ membership ani sa nezmení stav pozvánky (Postgres funkciu celú
-- vráti späť).
--
-- Poradie krokov presne podľa pôvodného zadania (bod 10):
--   1. nájdi invite podľa hashu tokenu (`for update` — zamkne riadok proti
--      súbežnému druhému pokusu o použitie toho istého tokenu),
--   2. over status a expiráciu,
--   3. over auth.uid() a autentifikovaný e-mail zo serverovo dôveryhodného
--      auth.users (nikdy z klientskeho vstupu),
--   4. porovnaj normalizovaný e-mail s invite.email,
--   5. over, že volajúci ešte nemá konfliktné aktívne membership,
--   6. vytvor company_members riadok s rolou PRESNE podľa invite.role,
--   7. označ invite ako 'accepted'.
--
-- Frontend (app/invite/[token]/page.tsx) volá túto funkciu VŽDY až PO
-- úspešnej registrácii/prihlásení, zostáva na invite route počas celého
-- procesu a na "/" presmeruje AŽ po úspešnom návrate tejto funkcie — nikdy
-- pred tým. Táto funkcia NIKDY nevytvára vlastnú owner company.

create or replace function public.esblu_accept_company_invite(p_token text)
returns table (company_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_email text;
  v_token_hash text;
  v_invite record;
  v_existing_active_count integer;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'NOT_AUTHENTICATED';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVALID_TOKEN';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_AUTH_USER_EMAIL_NOT_FOUND';
  end if;

  v_email := lower(btrim(v_email));
  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select ci.* into v_invite
  from public.company_invites ci
  where ci.token_hash = v_token_hash
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVALID_TOKEN';
  end if;

  if v_invite.status = 'accepted' then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVITE_ALREADY_ACCEPTED';
  end if;

  if v_invite.status = 'revoked' then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVITE_REVOKED';
  end if;

  -- Poznámka: `status = 'expired'` sa v tejto tabuľke nikdy nepretrváva
  -- UPDATEom pri zistení expirácie (taký UPDATE by aj tak bol vrátený späť
  -- spolu s RAISE EXCEPTION nižšie — Postgres funkcia je jedna implicitná
  -- transakcia). Expirácia sa preto vždy vyhodnocuje dynamicky, tu aj v
  -- esblu_list_my_company_invites() (case-when na status + expires_at).
  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_INVITE_EXPIRED';
  end if;

  -- v_invite.status = 'pending' a neexpirovaná od tohto bodu.

  if v_invite.email <> v_email then
    raise exception using
      errcode = '42501',
      message = 'ESBLU_INVITE_EMAIL_MISMATCH';
  end if;

  select count(*) into v_existing_active_count
  from public.company_members m
  where m.user_id = v_uid
    and m.status = 'active';

  if v_existing_active_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_ALREADY_HAS_ACTIVE_MEMBERSHIP';
  end if;

  begin
    insert into public.company_members (company_id, user_id, role, status)
    values (v_invite.company_id, v_uid, v_invite.role, 'active');
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'ESBLU_ALREADY_HAS_ACTIVE_MEMBERSHIP';
  end;

  update public.company_invites
  set status = 'accepted',
      accepted_at = now(),
      accepted_by = v_uid
  where id = v_invite.id;

  return query select v_invite.company_id, v_invite.role;
end;
$function$;

revoke all on function public.esblu_accept_company_invite(text) from public;
grant execute on function public.esblu_accept_company_invite(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. public.esblu_list_my_company_members()
-- -----------------------------------------------------------------------------
-- Read-only helper pre "Nastavenia → Používatelia". Iba pre aktívneho OWNER
-- ALEBO ADMIN volajúcej firmy — employee nesmie získať zoznam firemných
-- používateľov ani cez RPC. Ak volajúci nemá VÔBEC žiadne aktívne
-- membership, funkcia vráti prázdny výsledok (nie chybu — bežný, nie
-- chybový stav pred dokončením owner bootstrapu). Ak má aktívne membership,
-- ale s rolou 'employee', funkcia explicitne ZLYHÁ (fail-closed odopretie
-- prístupu, nie tiché prázdne pole).

create or replace function public.esblu_list_my_company_members()
returns table (
  member_id uuid,
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_company_id uuid;
  v_caller_role text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'NOT_AUTHENTICATED';
  end if;

  select m.company_id, m.role into v_company_id, v_caller_role
  from public.company_members m
  where m.user_id = v_uid
    and m.status = 'active'
  limit 1;

  if v_company_id is null then
    -- Volajúci ešte nemá žiadnu firmu (napr. pred dokončením owner
    -- bootstrapu) — nie je to chyba, iba prázdny zoznam.
    return;
  end if;

  if v_caller_role not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'ESBLU_NOT_ACTIVE_OWNER_OR_ADMIN';
  end if;

  return query
  select m.id, m.user_id, u.email, m.role, m.status, m.created_at
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = v_company_id
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    m.created_at;
end;
$function$;

revoke all on function public.esblu_list_my_company_members() from public;
grant execute on function public.esblu_list_my_company_members() to authenticated;


-- -----------------------------------------------------------------------------
-- 9. public.esblu_list_my_company_invites()
-- -----------------------------------------------------------------------------
-- Iba pre aktívneho OWNER ALEBO ADMIN — zoznam pozvánok jeho firmy (na
-- zobrazenie stavu v UI: pending/accepted/expired/revoked). employee nesmie
-- získať zoznam pozvánok ani cez RPC. token_hash sa NIKDY nevracia. Rovnaký
-- vzor "no company => prázdny výsledok" vs. "má company, ale zlá rola =>
-- explicitná chyba" ako esblu_list_my_company_members() vyššie.

create or replace function public.esblu_list_my_company_invites()
returns table (
  invite_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_company_id uuid;
  v_caller_role text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'NOT_AUTHENTICATED';
  end if;

  select m.company_id, m.role into v_company_id, v_caller_role
  from public.company_members m
  where m.user_id = v_uid
    and m.status = 'active'
  limit 1;

  if v_company_id is null then
    return;
  end if;

  if v_caller_role not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'ESBLU_NOT_ACTIVE_OWNER_OR_ADMIN';
  end if;

  return query
  select
    ci.id,
    ci.email,
    ci.role,
    case
      when ci.status = 'pending' and ci.expires_at <= now() then 'expired'
      else ci.status
    end,
    ci.created_at,
    ci.expires_at,
    ci.accepted_at
  from public.company_invites ci
  where ci.company_id = v_company_id
  order by ci.created_at desc;
end;
$function$;

revoke all on function public.esblu_list_my_company_invites() from public;
grant execute on function public.esblu_list_my_company_invites() to authenticated;

commit;
