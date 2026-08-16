begin;

-- =============================================================================
-- Esblu — Zásady ochrany osobných údajov v1.2 (Namecheap Private Email)
-- =============================================================================
-- Kontext: následné overenie potvrdilo, že kontaktné schránky info@esblu.com
-- a privacy@esblu.com (privacy@ je alias tej istej schránky) sú reálne
-- hostované u poskytovateľa Namecheap (Private Email) — Namecheap teda
-- spracúva obsah prichádzajúcej e-mailovej komunikácie na tieto adresy
-- (e-mailová adresa odosielateľa, obsah správy, prípadné prílohy). Toto je
-- odlišný fakt od predchádzajúcej v1.1 opravy (tá iba odstránila nesprávne
-- tvrdenie, že Namecheap odosiela appkou generované transakčné e-maily —
-- to ostáva nezmenené, stále výhradne cez Supabase Auth).
--
-- legal/privacy/1.2.md je nemenný obsahový súbor (rovnaký vzor ako 1.1.md,
-- 1.0.md) — jediná zmena oproti 1.1.md je doplnenie odseku o Namecheap do
-- sekcie E. content_hash nižšie je SHA-256 presne tohto súboru (overiteľné
-- príkazom `sha256sum legal/privacy/1.2.md`).
--
-- Podmienky používania (terms), DPA a Cookie Policy sa touto migráciou
-- NEMENIA — DPA text dodávateľov menovite neuvádza (okrem OpenAI, ktorý je
-- priamo súčasťou spracovávanej agendy), generický odkaz na /subprocessors
-- už teraz pokrýva aj Namecheap bez potreby novej DPA verzie. Namecheap
-- navyše nespracúva žiadne dáta nahraté firmami cez appku (predmet DPA) —
-- iba všeobecnú kontaktnú/support komunikáciu, ktorá je predmetom Privacy
-- Policy (vzťah Esblu ↔ jednotlivý používateľ), nie DPA (vzťah Esblu ↔
-- firma ako prevádzkovateľ údajov tretích osôb).
--
-- required=true (rovnako ako pri v1.1) — privacy_policy je required
-- dokument, takže existujúci používatelia, ktorí už akceptovali v1.1,
-- dostanú po tejto migrácii pri ďalšom prihlásení blokujúci modal
-- (LegalAcceptanceGate) na potvrdenie v1.2. Toto je ZÁMERNÉ, štandardné
-- správanie existujúceho legal acceptance modelu (rovnaké, aké by nastalo
-- pri akejkoľvek inej obsahovej zmene privacy policy) — nie nová vlastnosť
-- zavedená touto migráciou.
--
-- effective_at je zámerne now() (rovnaký vzor ako pri v1.1 v migrácii
-- 20260815100000) — vyhodnotí sa v momente reálnej aplikácie tejto
-- migrácie, takže presne zodpovedá skutočnému dátumu zverejnenia v1.2 bez
-- ohľadu na to, kedy sa migrácia napokon spustí.
-- =============================================================================

insert into public.legal_documents (type, version, effective_at, required, content_hash, canonical_path)
values
  (
    'privacy_policy', '1.2', now(), true,
    '594ee0bd242072a970f63fee759cbb05b6d1e7af2c519caf5a1992867178840b',
    '/ochrana-osobnych-udajov'
  )
on conflict (type, version) do nothing;

commit;
