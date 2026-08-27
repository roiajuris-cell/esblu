-- =============================================================================
-- Oprava: esblu_list_company_members_for_chat() — chýbajúci cast u.email::text
-- =============================================================================
-- Produkčná chyba (potvrdená v Supabase, code 42804):
--   "structure of query does not match function result type"
--   "Returned type character varying(255) does not match expected type
--    text in column 2."
--
-- Príčina: auth.users.email je character varying(255), no funkcia deklaruje
-- RETURNS TABLE (..., email text, ...) a vo vnútri RETURN QUERY vracia
-- u.email bez explicitného castu. PL/pgSQL RETURN QUERY vyžaduje presnú
-- štruktúrnu zhodu typov (na rozdiel od bežného SELECT/assignmentu, kde by
-- implicitný varchar→text cast prešiel bez problémov) — preto zlyhávalo
-- VŽDY pri načítaní zoznamu členov firmy pre chat (ChatConversationList →
-- loadAll() → esblu_list_company_members_for_chat() [RPC]), čo spôsobovalo
-- hlášku "Načítanie správ zlyhalo." pre celý firemný chat.
--
-- Táto migrácia je zámerne samostatná a NEmení pôvodnú
-- 20260827100000_add_chat_core.sql (tá je už aplikovaná v produkcii) — iba
-- CREATE OR REPLACE FUNCTION nahrádza definíciu tej istej funkcie s
-- pridaným u.email::text. Všetky bezpečnostné vlastnosti (SECURITY DEFINER,
-- set search_path = '', auth.uid() null-check, company-scoping cez
-- esblu_my_active_company_id(), REVOKE/GRANT) sú zachované bezo zmeny.
-- =============================================================================

begin;

create or replace function public.esblu_list_company_members_for_chat()
returns table (
  user_id uuid,
  email text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED';
  end if;

  v_company_id := public.esblu_my_active_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  select m.user_id, u.email::text, m.role
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = v_company_id
    and m.status = 'active'
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    u.email;
end;
$function$;

comment on function public.esblu_list_company_members_for_chat() is
  'Zoznam aktívnych členov firmy volajúceho (user_id, email, role) — '
  'dostupné VŠETKÝM rolám (na rozdiel od esblu_list_my_company_members(), '
  'ktorá je owner/admin-only pre správu používateľov). Slúži VÝHRADNE na '
  'výber protistrany pre novú 1:1 konverzáciu v chate. '
  '(2026-08-27: opravený chýbajúci u.email::text cast — pozri '
  '20260827120000_fix_chat_members_email_cast.sql.)';

revoke all on function public.esblu_list_company_members_for_chat() from public;
grant execute on function public.esblu_list_company_members_for_chat() to authenticated;

commit;
