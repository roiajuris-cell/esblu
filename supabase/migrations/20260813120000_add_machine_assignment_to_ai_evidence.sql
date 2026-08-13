begin;

-- =============================================================================
-- Esblu — priradenie AI Inbox dokumentu (ai_evidence) k stroju
-- =============================================================================
-- Kontext: UI na stránke /ai-evidencia ("AI Inbox") už umožňuje pri
-- vážnom lístku / dodacom liste zvoliť priradenie k vozidlu ALEBO k stroju,
-- ale výber sa doteraz nikde neukladal (žiadny stĺpec pre stroj v
-- ai_evidence neexistoval, priradenie k vozidlu sa navyše ukladalo iba
-- automaticky podľa rozpoznanej ŠPZ, nezávisle od výberu v UI).
--
-- Táto migrácia je čisto ADITÍVNA:
--   - pridáva dva nové nullable stĺpce do existujúcej tabuľky ai_evidence:
--     machine_id (referencia na stroj) a machine_label (denormalizovaný
--     názov stroja pre zobrazenie bez potreby JOINu — rovnaký vzor, aký
--     tabuľka už dnes používa pre vozidlo: vehicle_id + samostatný text
--     stĺpec spz),
--   - NEMENÍ žiadnu existujúcu RLS policy, trigger, stĺpec ani inú tabuľku,
--   - Rovnako ako existujúci vehicle_id stĺpec (pozri
--     docs/db/schema-baseline-2026-08-12.md, sekcia "chýbajúce FK väzby"),
--     machine_id je zámerne BEZ FK constraintu — referenčná integrita medzi
--     ai_evidence a machines ostáva iba aplikačná, konzistentne s dnešným
--     vehicle_id (aplikačný kód pred insertom overuje, že stroj patrí
--     prihlásenému používateľovi).
--   - RLS pre ai_evidence (existujúca "Users can manage own ai evidence",
--     ALL, USING/WITH CHECK auth.uid() = user_id) sa vzťahuje na celý riadok
--     vrátane nových stĺpcov — nie je potrebná žiadna zmena policy.
-- =============================================================================

alter table public.ai_evidence
  add column if not exists machine_id uuid null;

alter table public.ai_evidence
  add column if not exists machine_label text null;

-- Partial index pre dotaz "dokumenty priradené k tomuto stroju" (analogicky
-- k tomu, ako sú dnes dokumenty vyhľadávané podľa spz/vehicle_id v appke).
create index if not exists ai_evidence_machine_id_idx
  on public.ai_evidence (machine_id)
  where machine_id is not null;

commit;
