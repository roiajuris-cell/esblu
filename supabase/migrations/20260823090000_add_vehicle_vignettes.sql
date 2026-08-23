begin;

-- =============================================================================
-- Esblu — Diaľničné známky vozidiel (vehicle_vignettes)
-- =============================================================================
-- Kontext: jedno vozidlo môže mať súčasne viac diaľničných známok pre rôzne
-- krajiny (SK/CZ/AT a v budúcnosti ďalšie) — NIE jedno pole na vehicles, ale
-- samostatná tabuľka s 1:N väzbou vehicle_id -> vehicle_vignettes. Schválený
-- model (rozhodnutie používateľa): "jedna aktuálna známka na krajinu a
-- vozidlo" — obnova platnosti je UPDATE valid_until na existujúcom riadku
-- (unique(vehicle_id, country_code)), nie nový riadok. História starých
-- známok sa zatiaľ NEUCHOVÁVA — rovnaký princíp ako STK/EK na vehicles
-- (appka drží iba aktuálnu platnosť, nie históriu predchádzajúcich kontrol).
--
-- country_code je čistý text s CHECK na formát ISO 3166-1 alpha-2 (2 veľké
-- písmená) — ZÁMERNE žiadny Postgres enum ani hardcoded zoznam krajín v DB
-- schéme (žiadne 'SK'/'CZ'/'AT' natvrdo v CHECK), aby pridanie novej krajiny
-- nikdy nevyžadovalo migráciu. Lokalizovaný názov krajiny (Slovensko/
-- Slowakei/Slovakia, ...) žije výhradne v app-level i18n slovníkoch
-- (lib/i18n/dictionaries/{sk,de,en}.ts), nie v DB.
--
-- Bezpečnostný model kopíruje presne existujúci vzor `vehicles` (nie
-- `vehicle_services` a nie `vehicle_photos`) — SELECT pre celú firmu,
-- INSERT/UPDATE/DELETE VÝHRADNE owner/admin. Diaľničná známka je
-- administratívny údaj vozidla rovnakej povahy ako STK/EK (nie prevádzkový
-- servisný záznam a nie fotografia), takže employee — ktorý dnes nesmie
-- editovať samotné vozidlo (vehicles_insert/update/delete_owner_admin,
-- 20260814160000) — nesmie meniť ani známky. Explicitné rozhodnutie
-- používateľa, žiadne rozšírenie employee oprávnení.
--
-- Explicitný cross-company guard (bod 3 zadania — "nestačí iba frontend
-- výber vozidla + RLS"): INSERT/UPDATE/DELETE navyše overujú cez EXISTS
-- subquery, že vehicle_id skutočne patrí do AKTÍVNEJ FIRMY VOLAJÚCEHO — teda
-- vehicle_vignettes.company_id sa nedá "natrafiť" na cudzie vehicle_id, aj
-- keby company_id stĺpec náhodou sedel. Toto NIE JE nový mechanizmus — je to
-- doslovne rovnaký, už zavedený vzor ako vehicle_photos_insert/update/
-- delete_owner_admin (20260816110000), iba prenesený na túto tabuľku.
-- Žiadny nový trigger, žiadna nová funkcia — iba reuse existujúceho
-- EXISTS-v-RLS patternu, presne podľa pokynu "nevytváraj zbytočne komplexný
-- mechanizmus".
--
-- Auditovaná autorizačná otázka (TP review flow, bod "Employee + TP review"):
-- celá sekcia "Technický preukaz" v app/ai-evidencia/page.tsx (upload, AI
-- scan, review formulár VRÁTANE tohto nového vignette bloku, tlačidlo
-- uložiť — teda aj samotné vytvorenie/aktualizácia vehicles) je v komponente
-- podmienená `{role !== "employee" && (...)}` (JSX, riadok ~2899) — employee
-- toto UI vôbec NEVIDÍ, nie iba jednotlivý input je skrytý. Aj keby employee
-- poslal INSERT/UPDATE na vehicle_vignettes priamo (mimo UI, napr. cez
-- vlastný klient), RLS nižšie (owner/admin only) ho zamietne úplne rovnako,
-- ako dnes RLS na vehicles zamieta jeho pokus zapísať do vehicles. Fail-
-- closed na DB úrovni, nezávisle od frontendu — presne podľa požiadavky.
--
-- ON DELETE CASCADE na vehicle_id (bod 2 zadania): známky patria výhradne ku
-- konkrétnemu vozidlu, zmazanie vozidla zmaže aj jeho známky automaticky,
-- žiadny orphan riadok. company_id je (rovnako ako vehicle_photos) ON DELETE
-- RESTRICT na companies — firmu nemožno zmazať, kým existujú jej
-- vehicle_vignettes riadky, preto esblu_owner_delete_company() nižšie
-- dostáva explicitný DELETE pred zmazaním companies riadku.
--
-- updated_at: appka ho nastavuje explicitne z klienta pri UPDATE (rovnako
-- ako celý zvyšok tejto kódovej základne — v repozitári neexistuje žiadny
-- generický "touch updated_at" DB trigger, ktorý by sa dal bezpečne
-- rozšíriť, preto sa tu zámerne nezavádza ako nový mechanizmus).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. public.vehicle_vignettes
-- -----------------------------------------------------------------------------

create table public.vehicle_vignettes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,

  country_code text not null,
  valid_until date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vehicle_vignettes_country_code_format check (
    country_code ~ '^[A-Z]{2}$'
  ),
  constraint vehicle_vignettes_vehicle_country_unique
    unique (vehicle_id, country_code)
);

comment on table public.vehicle_vignettes is
  'Diaľničné známky vozidla — 1:N na vehicles, jedna aktuálna platnosť na '
  'dvojicu (vehicle_id, country_code) — pozri unique constraint. Obnova '
  'známky je UPDATE valid_until na existujúcom riadku, história starých '
  'platností sa neuchováva (rovnaký princíp ako STK/EK na vehicles). '
  'country_code je voľný ISO 3166-1 alpha-2 text (CHECK iba na formát, '
  'žiadny hardcoded zoznam krajín) — lokalizovaný názov krajiny je výhradne '
  'v app-level i18n, nie v DB.';

comment on column public.vehicle_vignettes.company_id is
  'ON DELETE RESTRICT na companies — rovnaký vzor ako vehicle_photos '
  '(20260816110000). esblu_owner_delete_company() maže tieto riadky '
  'explicitne pred zmazaním companies riadku.';

comment on column public.vehicle_vignettes.country_code is
  'ISO 3166-1 alpha-2 (napr. SK, CZ, AT). CHECK overuje iba formát (2 veľké '
  'písmená), nie konkrétnu množinu krajín — pridanie novej krajiny do appky '
  'nikdy nevyžaduje DB migráciu.';

create index vehicle_vignettes_vehicle_id_idx
  on public.vehicle_vignettes (vehicle_id);

create index vehicle_vignettes_company_id_idx
  on public.vehicle_vignettes (company_id);

alter table public.vehicle_vignettes enable row level security;


-- -----------------------------------------------------------------------------
-- 2. RLS — SELECT pre celú firmu, INSERT/UPDATE/DELETE VÝHRADNE owner/admin,
--    s explicitným cross-company guardom na vehicle_id (EXISTS subquery,
--    rovnaký vzor ako vehicle_photos_insert/update/delete_owner_admin).
-- -----------------------------------------------------------------------------

create policy vehicle_vignettes_select_company
  on public.vehicle_vignettes
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy vehicle_vignettes_insert_owner_admin
  on public.vehicle_vignettes
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.company_id = public.esblu_my_active_company_id()
    )
  );

create policy vehicle_vignettes_update_owner_admin
  on public.vehicle_vignettes
  for update
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.company_id = public.esblu_my_active_company_id()
    )
  )
  with check (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.company_id = public.esblu_my_active_company_id()
    )
  );

create policy vehicle_vignettes_delete_owner_admin
  on public.vehicle_vignettes
  for delete
  to authenticated
  using (
    company_id = public.esblu_my_active_company_id()
    and public.esblu_my_active_role() in ('owner', 'admin')
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.company_id = public.esblu_my_active_company_id()
    )
  );

create trigger esblu_assign_company_id_before_insert
before insert on public.vehicle_vignettes
for each row execute function public.esblu_assign_company_id();

create trigger esblu_lock_company_id_before_update
before update on public.vehicle_vignettes
for each row execute function public.esblu_lock_company_id_on_update();

-- Rovnaká DPA-gate enforcement ako ostatné company-scoped tabuľky s novým
-- obsahom (20260816090000, aplikovaná explicitne aj na vehicle_photos v
-- 20260816110000) — diaľničná známka je administratívny údaj vozidla,
-- rovnaká riziková kategória ako STK/EK/servisné záznamy.
create trigger esblu_require_company_dpa_before_insert
before insert on public.vehicle_vignettes
for each row execute function public.esblu_require_company_dpa_current();


-- -----------------------------------------------------------------------------
-- 3. esblu_owner_delete_company() — doplnené o vehicle_vignettes (žiadny
--    orphan / žiadne porušenie ON DELETE RESTRICT pri zrušení firemného
--    účtu). Rovnaké telo ako 20260816110000, iba pridaný jeden DELETE pred
--    "vehicles" (child pred parent).
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

  delete from public.vehicle_photos where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicle_photos', v_n);

  -- NOVÉ (20260823090000): vehicle_vignettes PRED vehicle_services/vehicles
  -- — vehicle_vignettes.company_id je ON DELETE RESTRICT na companies
  -- (rovnaký vzor ako vehicle_photos vyššie), takže musí byť prázdna PRED
  -- zmazaním companies riadku nižšie. FK vehicle_id ON DELETE CASCADE by
  -- DB riadky zmazal aj sám pri delete vehicles, ale explicitný DELETE tu
  -- (a) je konzistentný so zvyškom funkcie (žiadne spoliehanie na cascade),
  -- (b) dáva presný počet do deleted_counts pre verifikáciu.
  delete from public.vehicle_vignettes where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicle_vignettes', v_n);

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
  'Atomicky zmaže CELÚ firmu (business dáta VRÁTANE vehicle_vignettes od '
  '20260823090000 a vehicle_photos od 20260816110000, invites, DPA '
  'acceptances, všetky memberships, companies riadok) + ownerov vlastný '
  'settings a user_legal_acceptances riadok. company_id sa odvodí a dvojito '
  'overí VÝHRADNE z p_owner_user_id (company_members rola=owner AND '
  'companies.owner_id), nikdy z externého parametra. Nemaže Storage objekty '
  'ani auth.users — to je zodpovednosť volajúcej server-side API route. '
  'Spustiteľné výhradne cez service_role.';

revoke all on function public.esblu_owner_delete_company(uuid) from public;
revoke all on function public.esblu_owner_delete_company(uuid) from anon;
revoke all on function public.esblu_owner_delete_company(uuid) from authenticated;
grant execute on function public.esblu_owner_delete_company(uuid) to service_role;

commit;
