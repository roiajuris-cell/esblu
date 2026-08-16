begin;

-- =============================================================================
-- Esblu — technický preukaz presunutý do Inboxu (nový document_type) +
-- fotografie vozidiel (nová tabuľka vehicle_photos)
-- =============================================================================
-- Kontext: "Načítať technický preukaz" sa presúva z app/vozidla do
-- app/ai-evidencia (Inbox) — predná+zadná strana sa spracujú AI-čkom ako
-- JEDEN dokument cez existujúci documentový model (public.documents +
-- public.document_attachments pre druhú stranu + public.document_links pre
-- priradenie k vozidlu), presne ako zadanie vyžaduje ("Originálne fotografie
-- ... zachovaj/priraď k príslušnému vozidlu podľa aktuálneho dokumentového/
-- storage modelu"). AI extrakcia nikdy sama nevytvorí ani neprepíše vozidlo
-- — to robí výhradne appka, AŽ PO explicitnom potvrdení používateľom
-- (frontend flow, mimo tejto migrácie).
--
-- Súčasne appka pridáva úplne samostatnú funkciu — fotografie SAMOTNÝCH
-- vozidiel (nie technického preukazu) — nová tabuľka public.vehicle_photos,
-- štruktúrovaná a zabezpečená podobne ako existujúce public.machine_photos /
-- public.inventory_photos: SELECT aj INSERT smú owner/admin/employee,
-- UPDATE/DELETE výhradne owner/admin — pozri bod 3 nižšie, explicitné
-- odôvodnenie tohto permission rozhodnutia. Samotné public.vehicles
-- (vytvorenie/úprava/zmazanie vozidla) touto migráciou nie je nijako
-- dotknuté — employee tam naďalej nemá write prístup.
--
-- Táto migrácia je štrukturálne ADITÍVNA (nová tabuľka, nový bucket, širšie
-- CHECK constrainty) s JEDNOU cielenou výnimkou: znovu-definuje (CREATE OR
-- REPLACE) public.esblu_owner_delete_company(uuid) z 20260816100000, aby pri
-- zrušení firemného účtu (Nastavenia → Zrušiť účet) nezostali osirotené
-- riadky vehicle_photos — presne to isté already-aplikované telo funkcie,
-- iba doplnené o jeden nový DELETE (pozri bod 5).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. documents.document_type — nová hodnota 'vehicle_registration'
-- -----------------------------------------------------------------------------
-- Rovnaký vzor ako 20260814090000 (pridanie 'insurance'): čisto rozšírenie
-- CHECK constraintu, spätne kompatibilné, nič nemaže/neprepisuje.

alter table public.documents
  drop constraint if exists documents_document_type_check;

alter table public.documents
  add constraint documents_document_type_check check (
    document_type in (
      'weigh_ticket',
      'delivery_note',
      'invoice',
      'receipt',
      'insurance',
      'service_document',
      'vehicle_registration',
      'other'
    )
  );

-- document_attachments.attachment_type — nová hodnota pre zadnú stranu
-- technického preukazu (predná strana je primárny documents.storage_path,
-- zadná strana je príloha — rovnaký vzor ako pri PZP prílohách).
alter table public.document_attachments
  drop constraint if exists document_attachments_attachment_type_check;

alter table public.document_attachments
  add constraint document_attachments_attachment_type_check check (
    attachment_type in (
      'white_card',
      'green_card',
      'insurance_event',
      'vehicle_registration_back',
      'other'
    )
  );


-- -----------------------------------------------------------------------------
-- 2. public.vehicle_photos
-- -----------------------------------------------------------------------------

create table public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,

  storage_bucket text not null default 'vehicle-photos',
  storage_path text not null,

  created_at timestamptz not null default now(),

  constraint vehicle_photos_storage_path_not_blank_check check (
    btrim(storage_path) <> ''
  )
);

comment on table public.vehicle_photos is
  'Fotografie SAMOTNÝCH vozidiel (nie technického preukazu) — viac fotiek na '
  'jedno vozidlo, priradenie výhradne cez vehicle_id (nikdy podľa názvu). '
  'company_id sa priraďuje automaticky (esblu_assign_company_id, rovnako '
  'ako machine_photos/inventory_photos), nikdy sa neprijíma od klienta. '
  'user_id je ON DELETE SET NULL (rovnaký princíp ako pri user_id na '
  'documents/document_links/document_attachments/document_review_log od '
  '20260816100000) — audit/created_by údaj, nie autorizačný; zrušenie účtu '
  'osoby, ktorá fotografiu nahrala, fotografiu firme nezmaže.';

comment on column public.vehicle_photos.company_id is
  'ON DELETE RESTRICT na companies — rovnaký vzor ako ostatných 12 '
  'company-scoped business tabuliek (20260814120000): firma sa nedá zmazať, '
  'kým existujú jej vehicle_photos riadky. Owner-flow zrušenia účtu '
  '(esblu_owner_delete_company) preto tieto riadky maže explicitne PRED '
  'zmazaním companies riadku — pozri bod 5 nižšie.';

create index vehicle_photos_vehicle_id_idx
  on public.vehicle_photos (vehicle_id);

create index vehicle_photos_company_id_idx
  on public.vehicle_photos (company_id);

alter table public.vehicle_photos enable row level security;


-- -----------------------------------------------------------------------------
-- 3. RLS — SELECT + INSERT pre VŠETKY role (owner/admin/employee), UPDATE/
--    DELETE VÝHRADNE owner/admin.
-- -----------------------------------------------------------------------------
-- PERMISSION ROZHODNUTIE (revidované na explicitnú žiadosť používateľa):
-- fotografie SAMOTNÉHO vozidla (nie technického preukazu ani úprava
-- vlastností vozidla) smie pridávať a prezerať aj employee — iba mazanie
-- fotografie a akákoľvek zmena samotného vozidla (public.vehicles: INSERT/
-- UPDATE/DELETE, pozri 20260814160000, vehicles_insert/update/
-- delete_owner_admin) ostávajú výhradne owner/admin. Táto migrácia
-- NEROZŠIRUJE ani nemení oprávnenia na public.vehicles — employee naďalej
-- nemôže vozidlo vytvoriť, upraviť ani zmazať, iba k nemu pridať fotografiu.
-- INSERT, UPDATE aj DELETE navyše overujú, že vehicle_id skutočne patrí do
-- aktívnej firmy volajúceho (nielen company_id stĺpec fotografie) —
-- nestačí, aby sa niekto trafil na cudzie vehicle_id, keď má správne
-- company_id.

create policy vehicle_photos_select_company
  on public.vehicle_photos
  for select
  to authenticated
  using (company_id = public.esblu_my_active_company_id());

create policy vehicle_photos_insert_active_member
  on public.vehicle_photos
  for insert
  to authenticated
  with check (
    company_id = public.esblu_my_active_company_id()
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.company_id = public.esblu_my_active_company_id()
    )
  );

-- UPDATE zámerne obmedzené na owner/admin (fotografie sa v appke dnes
-- needitujú na mieste, iba pridávajú/mažú — táto policy je pripravená pre
-- prípad budúcej úpravy metadát fotografie, napr. poznámky).
create policy vehicle_photos_update_owner_admin
  on public.vehicle_photos
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

create policy vehicle_photos_delete_owner_admin
  on public.vehicle_photos
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
before insert on public.vehicle_photos
for each row execute function public.esblu_assign_company_id();

create trigger esblu_lock_company_id_before_update
before update on public.vehicle_photos
for each row execute function public.esblu_lock_company_id_on_update();

-- Rovnaká DPA-gate enforcement ako ostatné company-scoped tabuľky s novým
-- obsahom (20260816090000) — fotografia vozidla môže obsahovať EČV/miesto/
-- osoby, rovnaká riziková kategória ako machine_photos/inventory_photos.
create trigger esblu_require_company_dpa_before_insert
before insert on public.vehicle_photos
for each row execute function public.esblu_require_company_dpa_current();


-- -----------------------------------------------------------------------------
-- 4. Storage bucket `vehicle-photos` + policies
-- -----------------------------------------------------------------------------
-- PUBLIC bucket, rovnaký vzor ako machine-photos/inventory-photos
-- (20260814140000/20260814170000) — vedomé pokračovanie existujúceho,
-- zdokumentovaného kompromisu ("reziduálne riziko: kto pozná presnú cestu,
-- prečíta súbor bez auth"), NIE nové rozhodnutie. Cesta:
-- {uploader_user_id}/{vehicle_id}/{timestamp}-{filename} — prvý priečinok
-- pre Storage policy (auth.uid()), druhý pre priradenie k vehicle_id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- SELECT: ktorýkoľvek aktívny člen tej istej firmy ako nahrávateľ (rovnaký
-- company-aware vzor ako 20260814170000).
create policy vehicle_photos_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );

-- INSERT: ktorýkoľvek aktívny člen firmy (owner/admin/employee) — zrkadlí
-- bod 3 vyššie (vehicle_photos_insert_active_member). Cesta je
-- {uploader_user_id}/{vehicle_id}/..., preto tu navyše overujeme aj to, že
-- {vehicle_id} v ceste skutočne patrí do aktívnej firmy nahrávateľa — nielen
-- že je nahrávateľ aktívnym členom nejakej firmy.
create policy vehicle_photos_insert_active_member
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.vehicles v
      join public.company_members cm
        on cm.company_id = v.company_id
      where v.id::text = (storage.foldername(name))[2]
        and cm.user_id = auth.uid()
        and cm.status = 'active'
    )
  );

-- DELETE: iba owner/admin (rovnaký vzor ako company_logos_insert/
-- delete_owner_admin) — zrkadlí bod 3 vyššie (DB-level delete restrikcia).
create policy vehicle_photos_delete_owner_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and exists (
      select 1
      from public.company_members caller_cm
      join public.company_members owner_cm
        on owner_cm.company_id = caller_cm.company_id
        and owner_cm.status = 'active'
      where caller_cm.user_id = auth.uid()
        and caller_cm.status = 'active'
        and caller_cm.role in ('owner', 'admin')
        and owner_cm.user_id::text = (storage.foldername(name))[1]
    )
  );


-- -----------------------------------------------------------------------------
-- 5. esblu_owner_delete_company() — doplnené o vehicle_photos (žiadny orphan
--    pri zrušení firemného účtu). Rovnaké telo ako 20260816100000, iba
--    pridaný jeden DELETE pred "vehicles" (child pred parent, kvôli
--    vehicle_photos.company_id ON DELETE RESTRICT na companies vyššie).
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

  -- NOVÉ (20260816110000): vehicle_photos PRED vehicle_services/vehicles —
  -- vehicle_photos.company_id je ON DELETE RESTRICT na companies (rovnaký
  -- vzor ako ostatné 12 business tabuliek), takže musí byť prázdna PRED
  -- zmazaním companies riadku nižšie. FK vehicle_id ON DELETE CASCADE by
  -- DB riadky zmazal aj sám pri delete vehicles, ale explicitný DELETE tu
  -- (a) je konzistentný so zvyškom funkcie (žiadne spoliehanie na cascade),
  -- (b) dáva presný počet do deleted_counts pre verifikáciu.
  delete from public.vehicle_photos where company_id = v_company_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('vehicle_photos', v_n);

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
  'Atomicky zmaže CELÚ firmu (business dáta VRÁTANE vehicle_photos od '
  '20260816110000, invites, DPA acceptances, všetky memberships, companies '
  'riadok) + ownerov vlastný settings a user_legal_acceptances riadok. '
  'company_id sa odvodí a dvojito overí VÝHRADNE z p_owner_user_id '
  '(company_members rola=owner AND companies.owner_id), nikdy z externého '
  'parametra. Nemaže Storage objekty ani auth.users — to je zodpovednosť '
  'volajúcej server-side API route (Storage PRED týmto volaním, '
  'auth.admin.deleteUser() AŽ PO ňom; app/api/account/delete/route.ts od '
  '20260816110000 zbiera aj vehicle-photos bucket cesty). Spustiteľné '
  'výhradne cez service_role.';

revoke all on function public.esblu_owner_delete_company(uuid) from public;
revoke all on function public.esblu_owner_delete_company(uuid) from anon;
revoke all on function public.esblu_owner_delete_company(uuid) from authenticated;
grant execute on function public.esblu_owner_delete_company(uuid) to service_role;

commit;
