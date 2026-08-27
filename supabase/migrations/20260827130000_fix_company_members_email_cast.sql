-- =============================================================================
-- Oprava: esblu_list_my_company_members() — chýbajúci cast u.email::text
-- =============================================================================
-- Rovnaký root cause ako pri esblu_list_company_members_for_chat() (pozri
-- 20260827120000_fix_chat_members_email_cast.sql, potvrdené v produkcii,
-- Supabase error code 42804): auth.users.email je character varying(255),
-- no funkcia deklaruje RETURNS TABLE (..., email text, ...) a vo vnútri
-- RETURN QUERY vracia u.email bez explicitného castu. PL/pgSQL RETURN QUERY
-- vyžaduje presnú štruktúrnu zhodu typov (na rozdiel od bežného
-- SELECT/assignmentu, kde by implicitný varchar→text cast prešiel bez
-- problémov) — preto by esblu_list_my_company_members() musela zlyhať s
-- identickou chybou "structure of query does not match function result
-- type" pri každom volaní (Nastavenia → Používatelia).
--
-- Táto migrácia je zámerne samostatná a NEmení pôvodnú
-- 20260814130000_add_company_invites_and_owner_bootstrap.sql (tá je už
-- aplikovaná v produkcii) — iba CREATE OR REPLACE FUNCTION nahrádza
-- definíciu tej istej funkcie s pridaným u.email::text. Signatúra
-- (member_id, user_id, email, role, status, created_at), správanie,
-- SECURITY DEFINER, set search_path = '', owner/admin-only autorizácia
-- (fail-closed pre employee aj pre chýbajúce membership) a REVOKE/GRANT sú
-- zachované bezo zmeny.
-- =============================================================================

begin;

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
  select m.id, m.user_id, u.email::text, m.role, m.status, m.created_at
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

commit;
