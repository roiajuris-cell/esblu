begin;

-- =============================================================================
-- Esblu — oprava/re-potvrdenie esblu_get_company_profile()
-- =============================================================================
-- Kontext: po nasadení 20260814180000 bol nahlásený regresný nález — owner
-- AJ employee videli iba fallback "ESBLU" namiesto uloženého firemného
-- názvu/loga, hoci owner mal company_name/logo_path v settings reálne
-- vyplnené a predtým (pred zavedením RPC) sa mu hlavička zobrazovala
-- správne. To, že regresia postihla AJ ownera, ukazuje na problém so
-- samotným RPC volaním/nasadením, nie na chýbajúce oprávnenie špecifické
-- pre employee (keby šlo o RLS/rolovú medzeru, owner by mal vidieť správne
-- dáta aj predtým).
--
-- Táto migrácia je zámerne samostatná (nie úprava 20260814180000 in place),
-- pretože nie je s istotou známe, či 20260814180000 už bola v tomto
-- prostredí aplikovaná — `create or replace function` + `grant` sú
-- idempotentné a bezpečné zavolať znova bez ohľadu na to.
--
-- Zmena oproti 20260814180000 (dve nezávislé sprísnenia):
--   1. Prepísané ako jediný deklaratívny SQL dotaz (language sql) namiesto
--      plpgsql DECLARE/IF vetvy — menší povrch na procedurálnu chybu,
--      jednoduchšie na overenie.
--   2. Owner sa teraz dohľadáva cez public.companies.owner_id (autoritatívny,
--      FK-chránený stĺpec — companies.owner_id references auth.users(id) on
--      delete restrict, 20260814110000), NIE cez
--      company_members.role = 'owner'. company_members.role je meniteľný
--      business stav (napr. budúci prevod vlastníctva by mohol dočasne
--      nechať nekonzistentný stav dvoch riadkov), zatiaľ čo companies.id →
--      companies.owner_id je jediný, vždy jednoznačný zdroj pravdy o tom,
--      kto je vlastník danej firmy. company_id volajúceho sa stále odvodzuje
--      VÝHRADNE z jeho vlastného aktívneho company_members riadku
--      (auth.uid() → company_id) — rovnako pre owner/admin/employee.
--
-- Frontend (app/components/Dashboard.tsx) bol v tom istom kole doplnený o
-- vlastnú poistku: ak toto RPC z akéhokoľvek dôvodu (napr. migrácia ešte
-- nebeží na danom prostredí) nevráti nič, appka skúsi ako druhý krok priamy
-- dotaz na vlastný settings riadok prihláseného používateľa. Táto poistka je
-- zámerne iba núdzový fallback pre ownera (jeho vlastný riadok reálne
-- obsahuje firemné údaje) — HLAVNÝM mechanizmom pre všetky role, najmä pre
-- employee/admina bez vlastných dát v settings, zostáva výhradne toto RPC.
-- =============================================================================

create or replace function public.esblu_get_company_profile()
returns table (company_name text, logo_path text)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.company_name, s.logo_path
  from public.company_members my_cm
  join public.companies c
    on c.id = my_cm.company_id
  join public.settings s
    on s.user_id = c.owner_id
  where my_cm.user_id = auth.uid()
    and my_cm.status = 'active'
  limit 1;
$function$;

comment on function public.esblu_get_company_profile() is
  'Read-only: company_name + logo_path vlastníka firmy volajúceho '
  '(company_id volajúceho odvodené z auth.uid() cez jeho vlastný aktívny '
  'company_members riadok; vlastník firmy sa dohľadá cez '
  'public.companies.owner_id, nie cez company_members.role, rovnako pre '
  'owner/admin/employee). Nevracia nič, ak volajúci nemá aktívny membership '
  'alebo ak firma ešte nemá vyplnené meno/logo. Žiadna zápisová vetva — '
  'UPDATE settings ostáva nezmenené (iba vlastný riadok, owner/admin-only '
  'na frontende). Prepísané v 20260814190000 z plpgsql na jediný SQL dotaz, '
  'owner teraz cez companies.owner_id (predtým company_members.role = '
  '''owner'' v 20260814180000).';

revoke all on function public.esblu_get_company_profile() from public;
grant execute on function public.esblu_get_company_profile() to authenticated;

commit;
