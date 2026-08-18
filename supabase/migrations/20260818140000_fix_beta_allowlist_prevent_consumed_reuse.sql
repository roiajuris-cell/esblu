begin;

-- =============================================================================
-- Esblu — Closed Beta: zabráň opakovanej owner registrácii po zmazaní účtu
-- =============================================================================
-- Root cause: `esblu_before_user_created_beta_gate()` aj
-- `esblu_ensure_my_owner_company()` (20260816130000) overovali beta prístup
-- IBA cez `ba.revoked_at is null` — nikdy nekontrolovali `ba.consumed_at`.
-- Keď owner, ktorý beta_allowlist riadok už raz spotreboval (consumed_at/
-- consumed_by vyplnené pri prvej úspešnej registrácii), neskôr zmazal svoj
-- účet (account self-delete flow — consumed_by sa vďaka `on delete set
-- null` vynuluje, ale consumed_at NIE, zostáva ako trvalý dôkaz "kedy bolo
-- spotrebované"), ten istý e-mail mohol znova prejsť oboma kontrolami a
-- založiť si NOVÝ owner účet — beta_allowlist slot tak fungoval ako
-- neobmedzene opakovane použiteľný namiesto jednorazového.
--
-- Oprava (iba pre OWNER-signup vetvu v oboch funkciách — invite-token
-- bypass pre admin/employee je úplne samostatná vetva, vracia sa PRED touto
-- kontrolou a touto zmenou nie je nijako dotknutá):
--   `ba.email = v_email and ba.revoked_at is null`
--   →
--   `ba.email = v_email and ba.revoked_at is null and ba.consumed_at is null`
--
-- Prečo to nezablokuje legitímnu PRVÚ registráciu: kontrola v oboch
-- funkciách beží PRED update-om, ktorý consumed_at/consumed_by nastavuje
-- (ten istý poriadok ako doteraz) — v momente kontroly je pre ešte
-- nepoužitý riadok consumed_at vždy NULL, takže prvá (legitímna) spotreba
-- prejde bez zmeny. Žiadny ďalší flag/výnimka nie je potrebná — ide o
-- prirodzený dôsledok poradia príkazov v rámci jedného volania/transakcie.
--
-- Dôsledok pre správu testerov: ak má niekto po zmazaní účtu dostať ĎALŠÍ
-- pokus o beta registráciu s tým istým e-mailom, treba mu v Supabase
-- Dashboarde riadok resetovať (alebo pridať nový):
--   update public.beta_allowlist
--   set consumed_at = null, consumed_by = null
--   where email = 'tester@example.com';
--
-- Nič iné (invite bypass, RLS, granty, beta_allowlist schéma, iné funkcie)
-- sa touto migráciou nemení.
-- =============================================================================

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

  -- Bypass pre pozvaných admin/employee — NEZMENENÉ. Vracia sa skôr, než sa
  -- vôbec dostane k beta_allowlist/consumed_at kontrole nižšie.
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
  -- OPRAVA: vyžaduje aj ba.consumed_at is null, nielen revoked_at is null,
  -- inak by sa raz spotrebovaný slot dal po zmazaní účtu použiť znova.
  select exists (
    select 1
    from public.beta_allowlist ba
    where ba.email = v_email
      and ba.revoked_at is null
      and ba.consumed_at is null
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

revoke execute on function public.esblu_before_user_created_beta_gate(jsonb)
  from public, anon, authenticated;

grant execute on function public.esblu_before_user_created_beta_gate(jsonb)
  to supabase_auth_admin;

comment on function public.esblu_before_user_created_beta_gate(jsonb) is
  'Supabase Auth "Before User Created" hook. Owner-signup vetva vyžaduje beta_allowlist zhodu s revoked_at IS NULL AJ consumed_at IS NULL (20260818140000 — zabraňuje opakovanému použitiu raz spotrebovaného slotu po zmazaní účtu). Invite-token bypass pre admin/employee je nezmenený. MANUÁLNY KROK MIMO TEJTO MIGRÁCIE: musí byť zapnutý v Supabase Dashboard → Authentication → Hooks → Before User Created, namierený na túto funkciu.';


-- -----------------------------------------------------------------------------
-- esblu_ensure_my_owner_company() — rovnaká oprava (defense-in-depth).
-- -----------------------------------------------------------------------------

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

  -- OPRAVA: vyžaduje aj ba.consumed_at is null. Kontrola beží PRED update-om
  -- nižšie, ktorý consumed_at nastavuje — pre ešte nepoužitý riadok je preto
  -- consumed_at v tomto momente vždy NULL a legitímna PRVÁ registrácia
  -- prejde bez zmeny (žiadna extra výnimka/flag nie je potrebná).
  select exists (
    select 1
    from public.beta_allowlist ba
    where ba.email = v_email
      and ba.revoked_at is null
      and ba.consumed_at is null
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

comment on function public.esblu_ensure_my_owner_company() is
  'Idempotentný owner-company bootstrap. Beta check (defense-in-depth k Auth hooku) vyžaduje revoked_at IS NULL AJ consumed_at IS NULL (20260818140000) — zabraňuje opakovanému použitiu raz spotrebovaného beta_allowlist slotu po zmazaní účtu. Kontrola beží pred UPDATE-om, ktorý consumed_at nastavuje, takže legitímna prvá registrácia nie je dotknutá.';

commit;
