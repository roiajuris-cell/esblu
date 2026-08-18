begin;

-- =============================================================================
-- Esblu — Closed Beta: e-mail allowlist + Auth "Before User Created" hook
-- =============================================================================
-- Cieľ: dočasne vypnúť VEREJNÚ owner registráciu (založenie novej firmy) bez
-- toho, aby sa dotkla:
--   - existujúceho loginu (žiadna zmena, žiadny nový gate),
--   - existujúceho /invite/[token] flow pre admin/employee (invited člen
--     NIKDY nepotrebuje beta schválenie — pozri bod 3 nižšie),
--   - business RLS, company_invites/company_members permissions, legal
--     acceptance, account deletion, storage — nič z toho sa touto migráciou
--     nemení.
--
-- Bezpečnostný model (podľa výslovnej požiadavky — blokovať PRED vznikom
-- auth.users, nie až po ňom, a nie cez verejne dosiahnuteľný anon RPC):
--   1. `public.beta_allowlist` — tabuľka schválených e-mailov. RLS zapnuté,
--      NULOVÉ granty pre anon/authenticated/public, žiadna policy. Jediný
--      spôsob správy je priamo cez Supabase Dashboard (Table Editor / SQL
--      Editor), kde beží ako vlastník tabuľky (mimo RLS) — žiadny klientský
--      kód sa tejto tabuľky nikdy nedotkne. Presne to zabezpečuje "povoliť
--      e-mail bez editovania klientského kódu".
--   2. `public.esblu_before_user_created_beta_gate(event jsonb)` — Postgres
--      funkcia pre Supabase Auth "Before User Created" hook. Táto funkcia
--      BEŽÍ PRED vytvorením auth.users riadku — ak vráti `error`, Supabase
--      Auth signUp() request celý zamietne a auth.users sa vôbec nevytvorí.
--      Granted VÝHRADNE `supabase_auth_admin` (interná rola, ktorou Supabase
--      Auth server túto funkciu volá) — explicitný REVOKE od
--      public/anon/authenticated, takže funkcia nie je dosiahnuteľná ŽIADNYM
--      klientským volaním (nie je to anon-dosiahnuteľný "je tento e-mail na
--      zozname" oracle).
--   3. Invite bypass: ak signUp() prišiel z /invite/[token] flow, klient
--      pošle raw invite token v `options.data.esblu_invite_token` (pozri
--      app/invite/[token]/page.tsx). Hook token NEZÁVISLE overí voči
--      reálnej `company_invites` tabuľke (hash, status='pending',
--      neexpirovaný, zhodný e-mail) — iba genuinne platná pozvánka obíde
--      beta gate, nie iba prítomnosť ľubovoľnej hodnoty v metadata (fail-
--      closed proti spoofingu). Samotné PRIJATIE pozvánky
--      (esblu_accept_company_invite) beží nezmenené, neskôr, po prihlásení.
--   4. `esblu_ensure_my_owner_company()` dostáva DRUHÚ, nezávislú DB-side
--      kontrolu (defense-in-depth) — aj keby Auth hook nebol v Supabase
--      Dashboard zapnutý (nastavenie hooku je mimo dosahu SQL migrácie,
--      pozri POZNÁMKU nižšie), založenie firmy pre neschválený e-mail
--      zlyhá aj tu.
--
-- POZNÁMKA — MANUÁLNY KROK MIMO TEJTO MIGRÁCIE: samotné ZAPNUTIE "Before
-- User Created" hooku (namierenie na esblu_before_user_created_beta_gate) sa
-- robí v Supabase Dashboard → Authentication → Hooks, nie SQL migráciou.
-- Bez tohto kroku funkcia existuje, ale Supabase Auth ju nezavolá — signUp()
-- by vtedy prešiel a auth.users by sa vytvoril (company sa aj tak nezaloží
-- vďaka bodu 4 vyššie, ale gate by nebol "pred vznikom účtu", ako bolo
-- požadované). Tento krok je nutné vykonať manuálne, mimo Claude.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. beta_allowlist
-- -----------------------------------------------------------------------------

create table public.beta_allowlist (
  email text primary key,
  added_at timestamptz not null default now(),
  added_by uuid null references auth.users(id) on delete set null,
  note text null,

  -- Tiché odobratie prístupu bez straty histórie/auditnej stopy — riadok sa
  -- nemaže, iba sa označí ako zrušený.
  revoked_at timestamptz null,

  -- Nastaví esblu_ensure_my_owner_company() pri úspešnom dokončení owner
  -- registrácie tohto e-mailu — umožňuje v Supabase Dashboarde priamo
  -- vidieť, kto svoj beta prístup už reálne využil.
  consumed_at timestamptz null,
  consumed_by uuid null references auth.users(id) on delete set null,

  constraint beta_allowlist_email_not_blank_check check (btrim(email) <> ''),
  constraint beta_allowlist_email_normalized_check check (
    email = lower(btrim(email))
  )
);

alter table public.beta_allowlist enable row level security;

revoke all on table public.beta_allowlist from public, anon, authenticated;

-- Zámerne žiadna CREATE POLICY — jediný spôsob správy je Supabase Dashboard
-- (Table Editor / SQL Editor), kde príkazy bežia ako vlastník tabuľky, mimo
-- RLS. Príklad pridania testera (spusti v Supabase SQL Editore):
--   insert into public.beta_allowlist (email, note)
--   values ('tester@example.com', 'meno / poznámka');
-- Príklad odobratia prístupu (bez zmazania histórie):
--   update public.beta_allowlist set revoked_at = now()
--   where email = 'tester@example.com';

comment on table public.beta_allowlist is
  'Closed beta allowlist e-mailov, ktoré smú dokončiť owner registráciu (založenie novej firmy). Spravuje sa VÝHRADNE cez Supabase Dashboard (Table Editor / SQL Editor) — žiadny klientský kód sem nezapisuje ani nečíta. revoked_at = tiché odobratie prístupu bez zmazania histórie. consumed_at/consumed_by sa nastaví automaticky pri úspešnom dokončení owner registrácie (esblu_ensure_my_owner_company).';


-- -----------------------------------------------------------------------------
-- 2. esblu_before_user_created_beta_gate(event) — Supabase Auth Hook
-- -----------------------------------------------------------------------------
-- Kontrakt presne podľa Supabase dokumentácie ("Before User Created" hook,
-- Postgres function variant): jeden parameter `event jsonb` s tvarom
-- {"metadata": {...}, "user": {...auth.users-like...}}, návratová hodnota
-- buď '{}'::jsonb (povoliť) alebo {"error": {"http_code": N, "message": "…"}}
-- (zamietnuť — Supabase Auth signUp() potom klientovi vráti presne túto
-- chybovú správu a auth.users sa vôbec nevytvorí).

create or replace function public.esblu_before_user_created_beta_gate(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text;
  v_invite_token text;
  v_token_hash text;
  v_invite_valid boolean;
  v_beta_allowed boolean;
begin
  v_email := lower(btrim(coalesce(event->'user'->>'email', '')));

  if v_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Chýba e-mailová adresa.'
      )
    );
  end if;

  -- Bypass pre pozvaných admin/employee (app/invite/[token]/page.tsx posiela
  -- raw invite token v options.data.esblu_invite_token pri signUp()). Token
  -- sa overuje NEZÁVISLE voči reálnej company_invites tabuľke — samotná
  -- prítomnosť metadata poľa nič nezaručuje, iba genuinne platná (pending,
  -- neexpirovaná, presne zhodný e-mail) pozvánka obíde beta gate. Fail-
  -- closed proti spoofnutému/neplatnému tokenu — taký prípad prepadne
  -- ďalej na bežnú beta_allowlist kontrolu nižšie.
  v_invite_token := btrim(coalesce(
    event #>> '{user,user_metadata,esblu_invite_token}', ''
  ));

  if v_invite_token <> '' then
    v_token_hash := encode(extensions.digest(v_invite_token, 'sha256'), 'hex');

    select exists (
      select 1
      from public.company_invites ci
      where ci.token_hash = v_token_hash
        and ci.status = 'pending'
        and ci.expires_at > now()
        and ci.email = v_email
    ) into v_invite_valid;

    if v_invite_valid then
      return '{}'::jsonb;
    end if;
  end if;

  -- Owner-registration prípad (alebo neplatný/spoofnutý invite token) —
  -- vyžaduje schválenie na beta_allowlist.
  select exists (
    select 1
    from public.beta_allowlist ba
    where ba.email = v_email
      and ba.revoked_at is null
  ) into v_beta_allowed;

  if v_beta_allowed then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Esblu je momentálne v uzavretej beta verzii. Ak máte schválený beta prístup, kontaktujte nás na info@esblu.com.'
    )
  );
end;
$function$;

-- Presne podľa Supabase dokumentácie: EXECUTE iba pre supabase_auth_admin
-- (interná rola Auth servera), explicitne odobraté od public/anon/
-- authenticated. Funkcia preto nie je dosiahnuteľná ŽIADNYM klientským
-- volaním (nie je to anon-dosiahnuteľný "je tento e-mail schválený?" oracle).
revoke execute on function public.esblu_before_user_created_beta_gate(jsonb)
  from public, anon, authenticated;

grant execute on function public.esblu_before_user_created_beta_gate(jsonb)
  to supabase_auth_admin;

comment on function public.esblu_before_user_created_beta_gate(jsonb) is
  'Supabase Auth "Before User Created" hook. MANUÁLNY KROK MIMO TEJTO MIGRÁCIE: musí byť zapnutý v Supabase Dashboard → Authentication → Hooks → Before User Created, namierený na túto funkciu. Bez toho kroku Supabase Auth túto funkciu nezavolá.';


-- -----------------------------------------------------------------------------
-- 3. esblu_ensure_my_owner_company() — defense-in-depth beta kontrola
-- -----------------------------------------------------------------------------
-- Nezávislá DRUHÁ kontrola oproti bodu 2 vyššie. Dôvod: zapnutie Auth hooku
-- je manuálny krok mimo dosahu SQL migrácie (pozri POZNÁMKU na začiatku
-- súboru) — kým/ak by nebol zapnutý, táto RPC-level kontrola aj tak
-- zabráni založeniu firmy pre neschválený e-mail (auth.users by v tom
-- prípade vznikol, ale company nikdy). Identická logika a poradie krokov
-- ako predtým (idempotentný bootstrap, race-safe cez
-- company_members_one_active_per_user_idx) — jediná zmena je nový beta
-- check tesne pred INSERTom a zápis consumed_at/consumed_by po úspechu.
--
-- DÔLEŽITÉ: invited admin/employee túto funkciu NIKDY nevolajú (prijímajú
-- pozvánku cez esblu_accept_company_invite, úplne iný RPC) — beta kontrola
-- tu preto nepotrebuje žiadny invite-bypass, iba priamy beta_allowlist
-- check.

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
  v_beta_allowed boolean;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'NOT_AUTHENTICATED';
  end if;

  -- Už existujúce aktívne membership (vlastná firma alebo prijatá pozvánka)
  -- => no-op, vráť existujúci stav. Existujúci owner/admin/employee touto
  -- zmenou nie sú nijako ovplyvnení — tento check beží PRED beta gate.
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

  -- Closed Beta — defense-in-depth (pozri komentár nad funkciou vyššie).
  select exists (
    select 1
    from public.beta_allowlist ba
    where ba.email = v_email
      and ba.revoked_at is null
  ) into v_beta_allowed;

  if not v_beta_allowed then
    raise exception using
      errcode = '42501',
      message = 'ESBLU_BETA_ACCESS_REQUIRED';
  end if;

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
        raise exception using
          errcode = 'P0001',
          message = 'ESBLU_OWNER_BOOTSTRAP_RACE_UNRESOLVED';
      end if;

      return query select v_existing.company_id, v_existing.role, false;
      return;
  end;

  -- Best-effort audit stopa — beží v tej istej implicitnej transakcii ako
  -- inserty vyššie, takže je buď súčasťou úspešného bootstrapu, alebo sa
  -- spolu s ním vráti späť.
  update public.beta_allowlist
  set consumed_at = coalesce(consumed_at, now()),
      consumed_by = v_uid
  where email = v_email;

  return query select v_company_id, 'owner'::text, true;
end;
$function$;

revoke all on function public.esblu_ensure_my_owner_company() from public;
grant execute on function public.esblu_ensure_my_owner_company() to authenticated;

commit;
