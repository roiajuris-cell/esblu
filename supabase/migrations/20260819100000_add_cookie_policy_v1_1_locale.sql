begin;

-- =============================================================================
-- Esblu — Cookie Policy v1.1 (jazyková preferencia — nový cookie esblu_locale)
-- =============================================================================
-- Kontext: appka dostáva viacjazyčnú podporu (SK/DE/EN). Na zapamätanie
-- zvoleného jazyka naprieč stránkami/návštevami — vrátane návštevníka PRED
-- registráciou alebo prihlásením, kde localStorage/DB nie sú k dispozícii
-- server-side bez zbytočného FOUC — appka po prvýkrát používa vlastný,
-- nevyhnutný/funkčný cookie `esblu_locale` (žiadne sledovanie, žiadny
-- tretí subjekt, iba kód jazyka).
--
-- Cookie Policy v1.0 tvrdila "Esblu aktuálne nepoužíva žiadne cookies" —
-- po pridaní esblu_locale by toto tvrdenie prestalo byť pravdivé. Aby
-- zverejnený právny text nebol v rozpore so skutočným stavom appky, je
-- potrebná nová verzia (obsahová zmena, nie kozmetická úprava).
--
-- legal/cookies/1.1.md je nemenný obsahový súbor (rovnaký vzor ako 1.0.md)
-- — content_hash nižšie je SHA-256 presne tohto súboru (overiteľné
-- príkazom `sha256sum legal/cookies/1.1.md`).
--
-- required=false — rovnako ako pri 1.0 (cookie_policy je informačný
-- dokument bez osobnej acceptance povinnosti, pozri
-- supabase/migrations/20260815100000_add_legal_acceptance.sql a
-- lib/legal-config.ts REQUIRED_ACCEPTANCE_DOCUMENTS, kde cookie_policy nie
-- je uvedená). Táto migrácia preto NEVYVOLÁ blokujúci LegalAcceptanceGate
-- modal pre existujúcich používateľov.
--
-- Terms, Privacy Policy a DPA sa touto migráciou NEMENIA — dostávajú iba
-- DE/EN jazykové varianty rovnakého obsahu (legal/terms/1.0.{de,en}.md,
-- legal/privacy/1.2.{de,en}.md, legal/dpa/1.1.{de,en}.md), ktoré NIE SÚ
-- novými právnymi verziami (rovnaký content_hash ostáva v platnosti,
-- preklad nemení slovenský zdrojový text ani acceptance model).
-- =============================================================================

insert into public.legal_documents (type, version, effective_at, required, content_hash, canonical_path)
values
  (
    'cookie_policy', '1.1', now(), false,
    '970d17c28a530c42c0e7dfd758baf811e33bb2616a04a2850c8932408132f919',
    '/cookies'
  )
on conflict (type, version) do nothing;

commit;
