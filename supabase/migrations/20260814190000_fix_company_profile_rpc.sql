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
-- Zmena oproti 20260814180000: rovnaká logika (company_id odvodené výhradne
-- z auth.uid(), iba SELECT na company_name/logo_path aktívneho ownera
-- firmy, žiadna zápisová vetva), ale prepísaná ako jediný deklaratívny SQL
-- dotaz (language sql) namiesto plpgsql DECLARE/IF vetvy — menší povrch na
-- prípadnú procedurálnu chybu a jednoduchšie na overenie. Funkčne
-- ekvivalentné, iba čitateľnejšie/robustnejšie.
--
-- Frontend (app/components/Dashboard.tsx) bol v tom istom kole doplnený o
-- vlastnú poistku: ak toto RPC z akéhokoľvek dôvodu (napr. migrácia ešte
-- nebeží na danom prostredí) nevráti nič, appka skúsi ako druhý krok
-- priamy dotaz na vlastný settings riadok prihláseného používateľa —
-- presne pôvodné, pred-RPC správanie. Táto DB oprava aj tá frontendová
-- poistka sú navzájom nezávislé a obe musia byť aplikované/nasadené, aby
-- bola oprava kompletná pre owner AJ employee zároveň.
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
  join public.company_members owner_cm
    on owner_cm.company_id = my_cm.company_id
    and owner_cm.role = 'owner'
    and owner_cm.status = 'active'
  join public.settings s
    on s.user_id = owner_cm.user_id
  where my_cm.user_id = auth.uid()
    and my_cm.status = 'active'
  limit 1;
$function$;

comment on function public.esblu_get_company_profile() is
  'Read-only: company_name + logo_path aktívneho ownera firmy volajúceho '
  '(company_id odvodené z auth.uid() cez company_members, rovnako pre '
  'owner/admin/employee). Nevracia nič, ak volajúci nemá aktívny membership '
  'alebo ak firma ešte nemá vyplnené meno/logo. Žiadna zápisová vetva — '
  'UPDATE settings ostáva nezmenené (iba vlastný riadok, owner/admin-only '
  'na frontende). Prepísané v 20260814190000 z plpgsql na jediný SQL dotaz '
  '(funkčne ekvivalentné 20260814180000).';

revoke all on function public.esblu_get_company_profile() from public;
grant execute on function public.esblu_get_company_profile() to authenticated;

commit;
