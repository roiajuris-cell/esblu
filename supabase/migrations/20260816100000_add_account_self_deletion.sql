begin;

-- =============================================================================
-- Esblu — samoobslužné "Zrušiť účet" (self-service account deletion)
-- =============================================================================
-- Kontext: dosiaľ existoval iba manuálny flow (mailto žiadosť, spracovanie
-- adminom). Táto migrácia pripravuje DB stranu bezpečného SAMOOBSLUŽNÉHO
-- zrušenia účtu priamo z app/nastavenia — pre dve odlišné situácie:
--
--   1. OWNER zrušenia svoj účet → zrušuje sa CELÁ FIRMA (business dáta,
--      Storage, invites, DPA acceptances, memberships všetkých členov,
--      companies riadok, ownerov vlastný settings/user_legal_acceptances
--      riadok, napokon jeho auth.users). Ostatní členovia firmy strácajú
--      prístup (ich company_members riadok zanikne), ich VLASTNÉ auth.users
--      účty sa NEMAŽÚ.
--
--   2. ADMIN/EMPLOYEE zrušenia svoj účet → maže sa VÝHRADNE jeho vlastná
--      identita a membership. Firemné dáta (dokumenty, vozidlá, stroje,
--      sklad, AI evidencia...), ktoré tento človek pre firmu vytvoril,
--      musia firme zostať.
--
-- KRITICKÉ ZISTENIE AUDITU (dôvod KROKU 1 nižšie): viacero company-scoped
-- tabuliek má stĺpec `user_id` (pôvodne "created_by", z čias pred
-- company-based RLS retrofitom v 20260814160000) s `references auth.users(id)
-- on delete cascade`, konkrétne:
--   - public.documents.user_id
--   - public.document_links.user_id
--   - public.document_attachments.user_id
--   - public.document_review_log.user_id
--   - public.inventory_photos.user_id (pôvodná, pred-migračná tabuľka)
-- a naviac public.company_invites.invited_by má `on delete restrict`.
--
-- Po 20260814160000 je `user_id`/`invited_by` na týchto tabuľkách už IBA
-- audit/created_by údaj — autorizácia (RLS) beží výhradne cez `company_id`
-- (pozri komentár "user_id ostáva audit/created_by údaj (nie autorizačný)"
-- priamo v 20260814160000). Napriek tomu by BEZ ZÁSAHU:
--   - CASCADE potichu zmazal FIREMNÉ dáta (dokumenty, PZP prílohy, review
--     log, sklad-fotky), ktoré admin/employee pre firmu vytvoril, akonáhle
--     by si tento človek zrušil VLASTNÝ účet — firma by nedobrovoľne
--     prišla o dáta, ktoré jej patria,
--   - RESTRICT na company_invites.invited_by by admin/employeeovi, ktorý
--     niekedy niekoho pozval, znemožnil zrušiť si účet vôbec (auth.users
--     delete by zlyhal).
--
-- KROK 1 preto tieto FK mení na `on delete set null` (stĺpce sa stávajú
-- nullable) — firemné dáta a história pozvánok prežijú, stratí sa iba
-- "kto presne to bol" pre už odídeného člena. Toto je rovnaký princíp, aký
-- už appka používa pri document_review_log.document_id (`on delete set
-- null`, pozri 20260812150000 — "audit log má prežiť, nie zaniknúť spolu
-- s ním"), teraz aplikovaný symetricky aj na user_id/invited_by stranu.
--
-- ZÁMERNE NEZMENENÉ (audit potvrdil, že nie je potrebné):
--   - public.companies.owner_id (on delete restrict) — companies riadok sa
--     v owner-flow maže PRED ownerovým auth.users, takže RESTRICT sa nikdy
--     nevyvolá.
--   - public.company_dpa_acceptances.accepted_by (on delete restrict) —
--     zámerne zdokumentované v 20260816090000 ("Ak si osoba... želá zmazať
--     svoj vlastný účet, musí najprv dôjsť k... ukončeniu firemného účtu").
--     V owner-flow sa company_dpa_acceptances maže PRED ownerovým
--     auth.users (rovnaká logika ako companies.owner_id vyššie), takže
--     RESTRICT sa opäť nikdy nevyvolá. accepted_by je vždy iba owner
--     (RPC esblu_accept_company_dpa je owner-only), takže v admin/employee
--     flow toto vôbec nie je v hre.
--   - public.company_members.user_id / public.user_legal_acceptances.user_id
--     (obe on delete cascade) — toto je ŽIADANÉ správanie: ide o vlastnú
--     identitu/súhlas mazanej osoby, nie o firemné dáta.
--
-- KROK 2 pridáva dve SECURITY DEFINER funkcie, ktoré vykonajú DB-časť
-- mazania v JEDNEJ transakcii (atomicky) — Storage objekty a auth.users sa
-- nedajú zmazať zo SQL transakcie, tie zostávajú v zodpovednosti server-side
-- API route (Storage API pred volaním RPC, auth.admin.deleteUser() až po
-- úspešnom RPC). Obe funkcie si republikum overia identitu/rolu/company_id
-- SAMÉ (z p_user_id cez company_members, nikdy z parametra company_id) a sú
-- spustiteľné VÝHRADNE cez service_role — bežný authenticated klient ich
-- nemôže zavolať priamo (obišiel by tým Storage cleanup v API route).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- KROK 1 — FK hardening: user_id/invited_by na company-scoped tabuľkách
-- z "on delete cascade/restrict" na "on delete set null" (+ nullable).
-- -----------------------------------------------------------------------------

do $relax_user_fk$
declare
  v_row record;
  v_conname text;
begin
  for v_row in
    select * from (values
      ('public.documents', 'user_id'),
      ('public.document_links', 'user_id'),
      ('public.document_attachments', 'user_id'),
      ('public.document_review_log', 'user_id'),
      ('public.inventory_photos', 'user_id'),
      ('public.company_invites', 'invited_by')
    ) as t(tbl, col)
  loop
    select con.conname into v_conname
    from pg_constraint con
    where con.conrelid = v_row.tbl::regclass
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and (
        select array_agg(attname::text order by attnum)
        from pg_attribute
        where attrelid = v_row.tbl::regclass
          and attnum = any(con.conkey)
      ) = array[v_row.col];

    if v_conname is null then
      raise exception using
        errcode = 'P0001',
        message = format('ESBLU_FK_NOT_FOUND:%s.%s', v_row.tbl, v_row.col),
        hint = 'Očakávaný foreign key na auth.users(id) sa nenašiel. Over aktuálnu schému (mohla sa zmeniť od napísania tejto migrácie) pred jej opätovným spustením.';
    end if;

    execute format('alter table %s drop constraint %I', v_row.tbl, v_conname);
    execute format('alter table %s alter column %I drop not null', v_row.tbl, v_row.col);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      v_row.tbl, v_conname, v_row.col
    );
  end loop;
end
$relax_user_fk$;

comment on column public.documents.user_id is
  'Pôvodca/uploader (created_by) dokumentu — audit údaj, NIE autorizačný '
  '(RLS beží cez company_id). ON DELETE SET NULL (od 20260816100000): ak '
  'admin/employee, ktorý dokument nahral, si neskôr zruší vlastný účet, '
  'dokument firme zostáva, iba stratí väzbu na konkrétnu odídenú osobu.';

comment on column public.document_links.user_id is
  'Pôvodca väzby — audit údaj, NIE autorizačný. ON DELETE SET NULL (od '
  '20260816100000), rovnaký dôvod ako public.documents.user_id.';

comment on column public.document_attachments.user_id is
  'Pôvodca/uploader PZP prílohy — audit údaj, NIE autorizačný. ON DELETE '
  'SET NULL (od 20260816100000), rovnaký dôvod ako public.documents.user_id.';

comment on column public.document_review_log.user_id is
  'Kto revíznu akciu vykonal — audit údaj. ON DELETE SET NULL (od '
  '20260816100000, predtým CASCADE) — rovnaký princíp, aký táto tabuľka už '
  'používa pri document_id (pozri 20260812150000): audit log má prežiť '
  'zrušenie účtu svojho pôvodcu, nie zaniknúť spolu s ním.';

comment on column public.inventory_photos.user_id is
  'Pôvodca/uploader skladovej fotky — audit údaj, NIE autorizačný (RLS beží '
  'cez company_id). ON DELETE SET NULL (od 20260816100000, predtým '
  'CASCADE) — fotka firme zostáva aj po zrušení účtu jej nahrávateľa.';

comment on column public.company_invites.invited_by is
  'Kto pozvánku vytvoril — audit údaj. ON DELETE SET NULL (od 20260816100000, '
  'predtým RESTRICT) — RESTRICT by admin/employeeovi, ktorý niekedy niekoho '
  'pozval, znemožnil zrušiť si vlastný účet. Pozvánka (a jej história) firme '
  'zostáva, stráca sa iba väzba na konkrétnu odídenú osobu.';


-- -----------------------------------------------------------------------------
-- KROK 2a — esblu_owner_delete_company(): atomické zmazanie CELEJ firmy.
-- -----------------------------------------------------------------------------
-- Volateľná VÝHRADNE service_role (server-side API route, PO Storage
-- cleanup, PRED auth.admin.deleteUser()). p_owner_user_id je JEDINÝ vstup —
-- company_id si funkcia sama dohľadá cez company_members a nezávisle overí
-- cez companies.owner_id (rovnaký "dvojitý zdroj pravdy" vzor ako
-- esblu_get_company_profile, 20260814190000). Vracia jsonb súhrn počtu
-- zmazaných riadkov po tabuľkách (na server-side verification report).
-- -----------------------------------------------------------------------------

create or replace function public.esblu_owner_delete_company(p_owner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_owner_id_check uuid;
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
begin
  if p_owner_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_MISSING_USER_ID';
  end if;

  select cm.company_id into v_company_id
  from public.company_members cm
  where cm.user_id = p_owner_user_id
    and cm.status = 'active'
    and cm.role = 'owner'
  limit 1;

  if v_company_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_NOT_ACTIVE_OWNER',
      hint = 'Volajúci nemá aktívny company_members riadok s rolou owner.';
  end if;

  select c.owner_id into v_owner_id_check
  from public.companies c
  where c.id = v_company_id;

  if v_owner_id_check is null or v_owner_id_check <> p_owner_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_OWNER_MISMATCH',
      hint = 'companies.owner_id nesúhlasí s company_members rolou owner pre tohto používateľa — zastavené pred zmazaním, over dáta manuálne.';
  end if;

  -- Business tabuľky, presné poradie kvôli FK (child pred parent).
  delete from public.document_attachments where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('document_attachments', v_n);

  delete from public.document_links where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('document_links', v_n);

  delete from public.document_review_log where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('document_review_log', v_n);

  delete from public.documents where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('documents', v_n);

  delete from public.inventory_photos where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('inventory_photos', v_n);

  delete from public.inventory_items where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('inventory_items', v_n);

  delete from public.machine_photos where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('machine_photos', v_n);

  delete from public.machine_services where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('machine_services', v_n);

  delete from public.machines where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('machines', v_n);

  delete from public.vehicle_services where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicle_services', v_n);

  delete from public.vehicles where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicles', v_n);

  delete from public.ai_evidence where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ai_evidence', v_n);

  -- Firemné/právne záznamy.
  delete from public.company_invites where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('company_invites', v_n);

  delete from public.company_dpa_acceptances where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('company_dpa_acceptances', v_n);

  -- Memberships (VŠETCI členovia — owner, admin, employee) + company.
  delete from public.company_members where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('company_members', v_n);

  delete from public.companies where id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('companies', v_n);

  -- Ownerove vlastné user-scoped záznamy (auth.users sa maže mimo tejto
  -- funkcie, cez Admin API, ako posledný krok v API route).
  delete from public.settings where user_id = p_owner_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('settings', v_n);

  delete from public.user_legal_acceptances where user_id = p_owner_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('user_legal_acceptances', v_n);

  return jsonb_build_object(
    'company_id', v_company_id,
    'deleted_counts', v_counts
  );
end;
$function$;

comment on function public.esblu_owner_delete_company(uuid) is
  'Atomicky zmaže CELÚ firmu (business dáta, invites, DPA acceptances, '
  'všetky memberships, companies riadok) + ownerov vlastný settings a '
  'user_legal_acceptances riadok. company_id sa odvodí a dvojito overí '
  'VÝHRADNE z p_owner_user_id (company_members rola=owner AND '
  'companies.owner_id), nikdy z externého parametra. Nemaže Storage objekty '
  'ani auth.users — to je zodpovednosť volajúcej server-side API route '
  '(Storage PRED týmto volaním, auth.admin.deleteUser() AŽ PO ňom). '
  'Spustiteľné výhradne cez service_role.';

revoke all on function public.esblu_owner_delete_company(uuid) from public;
revoke all on function public.esblu_owner_delete_company(uuid) from anon;
revoke all on function public.esblu_owner_delete_company(uuid) from authenticated;
grant execute on function public.esblu_owner_delete_company(uuid) to service_role;


-- -----------------------------------------------------------------------------
-- KROK 2b — esblu_member_delete_self(): atomické zmazanie VLASTNÉHO
-- membershipu admina/employeeho. Firemné dáta sa NEDOTÝKAJÚ.
-- -----------------------------------------------------------------------------

create or replace function public.esblu_member_delete_self(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
begin
  if p_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_MISSING_USER_ID';
  end if;

  select cm.company_id into v_company_id
  from public.company_members cm
  where cm.user_id = p_user_id
    and cm.status = 'active'
    and cm.role in ('admin', 'employee')
  limit 1;

  if v_company_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ESBLU_NOT_ACTIVE_MEMBER',
      hint = 'Volajúci nemá aktívny company_members riadok s rolou admin/employee (owner musí použiť esblu_owner_delete_company).';
  end if;

  -- Firemné dáta (documents/vehicles/... company_id-scoped) sa VÔBEC
  -- nemažú — zostávajú firme. user_id na nich prežije zmazanie auth.users
  -- ako NULL vďaka FK zmenám z KROKU 1 tejto migrácie.
  delete from public.settings where user_id = p_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('settings', v_n);

  delete from public.user_legal_acceptances where user_id = p_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('user_legal_acceptances', v_n);

  delete from public.company_members where user_id = p_user_id and company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('company_members', v_n);

  return jsonb_build_object(
    'company_id', v_company_id,
    'deleted_counts', v_counts
  );
end;
$function$;

comment on function public.esblu_member_delete_self(uuid) is
  'Atomicky zmaže VLASTNÝ (p_user_id) settings, user_legal_acceptances a '
  'company_members riadok admina/employeeho. Firemné company-scoped dáta '
  '(documents, vehicles, machines, sklad, AI evidencia...) sa NEDOTÝKAJÚ — '
  'zostávajú firme. company_id sa odvodí VÝHRADNE z aktívneho company_members '
  'riadku volajúceho (role admin/employee), nikdy z externého parametra. '
  'Nemaže Storage objekty ani auth.users — zodpovednosť volajúcej server-side '
  'API route. Spustiteľné výhradne cez service_role.';

revoke all on function public.esblu_member_delete_self(uuid) from public;
revoke all on function public.esblu_member_delete_self(uuid) from anon;
revoke all on function public.esblu_member_delete_self(uuid) from authenticated;
grant execute on function public.esblu_member_delete_self(uuid) to service_role;

commit;
