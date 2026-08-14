begin;

-- =============================================================================
-- Esblu — esblu_get_company_profile(): bezpečné, read-only čítanie firemnej
-- identity (názov + logo) pre KAŽDÉHO aktívneho člena firmy (owner/admin/
-- employee), nie iba pre vlastníka riadku v settings.
-- =============================================================================
-- Kontext: company_name/logo_path žijú na public.settings, ktorá je stále
-- (zámerne, mimo rozsahu tejto migrácie) per-user tabuľka s RLS
-- auth.uid() = user_id — každý nový auth používateľ (owner, admin AJ
-- employee) dostane pri registrácii/prijatí pozvánky svoj vlastný, prázdny
-- settings riadok (esblu_create_settings_for_new_user, 20260721000100).
-- Frontend header/Dashboard doteraz čítal company_name/logo_path z
-- PRIHLÁSENÉHO používateľa vlastného riadku — pre admina aj zamestnanca to
-- boli takmer vždy prázdne hodnoty (iba owner cez Nastavenia firmy kedy-
-- koľvek vyplnil svoj vlastný riadok), takže videli generický fallback
-- namiesto skutočnej firemnej hlavičky.
--
-- Táto funkcia je JEDINÝ bezpečný spôsob, ako to opraviť bez zmeny RLS na
-- settings (čo by bola oveľa väčšia zmena rozsahu): SECURITY DEFINER,
-- company_id sa odvodzuje výhradne z auth.uid() (rovnaký vzor ako
-- esblu_my_active_company_id() z 20260814160000), vracia iba 2 neškodné
-- branding stĺpce (company_name, logo_path) z riadku AKTÍVNEHO OWNERA danej
-- firmy — nikdy plán, e-mail, ani iné settings polia. Funkcia nemá ŽIADNU
-- zápisovú vetvu — UPDATE company_name/logo_path zostáva presne tak, ako je
-- dnes (iba vlastný riadok cez public.settings, frontend to navyše už
-- obmedzuje na owner/admin v app/nastavenia/page.tsx), touto migráciou sa
-- nič na zápise nemení.
-- =============================================================================

create or replace function public.esblu_get_company_profile()
returns table (company_name text, logo_path text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
begin
  select cm.company_id
  into v_company_id
  from public.company_members cm
  where cm.user_id = auth.uid()
    and cm.status = 'active'
  limit 1;

  if v_company_id is null then
    return;
  end if;

  return query
    select s.company_name, s.logo_path
    from public.company_members owner_cm
    join public.settings s on s.user_id = owner_cm.user_id
    where owner_cm.company_id = v_company_id
      and owner_cm.role = 'owner'
      and owner_cm.status = 'active'
    limit 1;
end;
$function$;

comment on function public.esblu_get_company_profile() is
  'Read-only: company_name + logo_path aktívneho ownera firmy volajúceho '
  '(company_id odvodené z auth.uid() cez company_members, rovnako pre '
  'owner/admin/employee). Nevracia nič, ak volajúci nemá aktívny membership. '
  'Žiadna zápisová vetva — UPDATE settings ostáva nezmenené (iba vlastný '
  'riadok, owner/admin-only na frontende).';

revoke all on function public.esblu_get_company_profile() from public;
grant execute on function public.esblu_get_company_profile() to authenticated;

commit;
