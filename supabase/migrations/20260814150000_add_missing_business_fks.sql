begin;

-- =============================================================================
-- Esblu — doplnenie chýbajúcich FK väzieb (bezpečnostný hardening po audite)
-- =============================================================================
-- Kontext (zdroj: read-only security/privacy audit +
-- docs/db/schema-baseline-2026-08-12.md §2 "chýbajúce FK väzby"):
-- nasledujúce 4 stĺpce sú dnes referenčne neintegrujúce (bez FK), integrita
-- je iba aplikačná:
--   - vehicle_services.vehicle_id → vehicles.id   (NOT NULL stĺpec)
--   - machine_services.machine_id → machines.id   (nullable stĺpec)
--   - ai_evidence.vehicle_id → vehicles.id         (nullable stĺpec)
--   - ai_evidence.machine_id → machines.id         (nullable stĺpec, pridaný
--     migráciou 20260813120000)
--
-- ON DELETE správanie (podľa explicitnej požiadavky):
--   - vehicle_services / machine_services = servisné záznamy, sú prakticky
--     bezvýznamné bez svojho vozidla/stroja → ON DELETE CASCADE (zmazanie
--     vozidla/stroja bezpečne zmaže aj jeho servisnú históriu, rieši aj
--     nález "mazanie vozidla/stroja necháva osirotené servisné záznamy").
--   - ai_evidence = historický AI dokument (vážny lístok, dodací list...),
--     má hodnotu aj bez existujúceho vozidla/stroja → ON DELETE SET NULL
--     (zmazanie vozidla/stroja NIKDY nezmaže ani neskryje historický AI
--     dokument, iba stratí odkaz naň).
--
-- FAIL-CLOSED princíp (rovnaký vzor ako
-- 20260814120000_add_company_id_to_business_tables.sql): pred pridaním
-- KAŽDÉHO FK najprv overíme, že v živých dátach neexistuje ani jeden
-- "dangling" riadok (hodnota, ktorá v cieľovej tabuľke neexistuje). Ak áno,
-- celá migrácia zlyhá s RAISE EXCEPTION (a teda sa vôbec nič nezmení —
-- transakcia sa vráti späť), namiesto toho, aby FK pridanie tíško zlyhalo na
-- constraint violation, alebo aby sme orphan riadky naslepo mazali/opravovali.
-- V takom prípade treba orphan riadky (ich presné id sú súčasťou chybovej
-- správy) preveriť ručne pred ďalším pokusom o túto migráciu.
--
-- Táto migrácia NEMENÍ žiadnu RLS policy, žiadny iný stĺpec, žiadny Storage
-- bucket ani frontend kód.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. vehicle_services.vehicle_id → vehicles.id, ON DELETE CASCADE
-- -----------------------------------------------------------------------------

do $$
declare
  dangling_count integer;
  dangling_ids text;
begin
  select count(*), string_agg(vs.id::text, ', ' order by vs.id::text)
  into dangling_count, dangling_ids
  from public.vehicle_services vs
  where vs.vehicle_id is not null
    and not exists (select 1 from public.vehicles v where v.id = vs.vehicle_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'MISSING_FK_BACKFILL_DANGLING_REFERENCE:vehicle_services_vehicle_id_vs_vehicles:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'vehicle_services obsahuje vehicle_id, ktorý v tabuľke vehicles neexistuje. FK sa nepridáva. Tieto riadky treba preveriť ručne (napr. priradiť správnemu vozidlu, alebo vedome vymazať) pred ďalším pokusom o túto migráciu.';
  end if;
end $$;

create index if not exists vehicle_services_vehicle_id_idx
  on public.vehicle_services (vehicle_id);

alter table public.vehicle_services
  add constraint vehicle_services_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles (id)
  on delete cascade;


-- -----------------------------------------------------------------------------
-- 2. machine_services.machine_id → machines.id, ON DELETE CASCADE
-- -----------------------------------------------------------------------------

do $$
declare
  dangling_count integer;
  dangling_ids text;
begin
  select count(*), string_agg(ms.id::text, ', ' order by ms.id::text)
  into dangling_count, dangling_ids
  from public.machine_services ms
  where ms.machine_id is not null
    and not exists (select 1 from public.machines m where m.id = ms.machine_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'MISSING_FK_BACKFILL_DANGLING_REFERENCE:machine_services_machine_id_vs_machines:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'machine_services obsahuje machine_id, ktorý v tabuľke machines neexistuje. FK sa nepridáva. Tieto riadky treba preveriť ručne pred ďalším pokusom o túto migráciu.';
  end if;
end $$;

create index if not exists machine_services_machine_id_idx
  on public.machine_services (machine_id)
  where machine_id is not null;

alter table public.machine_services
  add constraint machine_services_machine_id_fkey
  foreign key (machine_id)
  references public.machines (id)
  on delete cascade;


-- -----------------------------------------------------------------------------
-- 3. ai_evidence.vehicle_id → vehicles.id, ON DELETE SET NULL
-- -----------------------------------------------------------------------------

do $$
declare
  dangling_count integer;
  dangling_ids text;
begin
  select count(*), string_agg(ae.id::text, ', ' order by ae.id::text)
  into dangling_count, dangling_ids
  from public.ai_evidence ae
  where ae.vehicle_id is not null
    and not exists (select 1 from public.vehicles v where v.id = ae.vehicle_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'MISSING_FK_BACKFILL_DANGLING_REFERENCE:ai_evidence_vehicle_id_vs_vehicles:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'ai_evidence obsahuje vehicle_id, ktorý v tabuľke vehicles neexistuje. FK sa nepridáva. Tieto riadky treba preveriť ručne pred ďalším pokusom o túto migráciu.';
  end if;
end $$;

create index if not exists ai_evidence_vehicle_id_idx
  on public.ai_evidence (vehicle_id)
  where vehicle_id is not null;

alter table public.ai_evidence
  add constraint ai_evidence_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles (id)
  on delete set null;


-- -----------------------------------------------------------------------------
-- 4. ai_evidence.machine_id → machines.id, ON DELETE SET NULL
-- -----------------------------------------------------------------------------
-- (index ai_evidence_machine_id_idx už existuje z 20260813120000, netreba
-- ho znova vytvárať.)

do $$
declare
  dangling_count integer;
  dangling_ids text;
begin
  select count(*), string_agg(ae.id::text, ', ' order by ae.id::text)
  into dangling_count, dangling_ids
  from public.ai_evidence ae
  where ae.machine_id is not null
    and not exists (select 1 from public.machines m where m.id = ae.machine_id);

  if dangling_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'MISSING_FK_BACKFILL_DANGLING_REFERENCE:ai_evidence_machine_id_vs_machines:count=' || dangling_count::text || ':ids=' || coalesce(dangling_ids, ''),
      hint = 'ai_evidence obsahuje machine_id, ktorý v tabuľke machines neexistuje. FK sa nepridáva. Tieto riadky treba preveriť ručne pred ďalším pokusom o túto migráciu.';
  end if;
end $$;

alter table public.ai_evidence
  add constraint ai_evidence_machine_id_fkey
  foreign key (machine_id)
  references public.machines (id)
  on delete set null;

commit;
