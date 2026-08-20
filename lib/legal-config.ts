// =============================================================================
// Esblu — centrálna legal konfigurácia
// =============================================================================
// JEDINÝ zdroj pravdy pre právnu identitu prevádzkovateľa a verzie právnych
// dokumentov. Žiadny komponent/stránka nesmie identitu prevádzkovateľa
// (meno, adresu, IČO a pod.) vpisovať natvrdo — vždy importuj z tohto
// súboru, aby zmena (napr. založenie s.r.o. v budúcnosti) znamenala úpravu
// na jednom mieste.
//
// Hodnoty nižšie vychádzajú z toho, čo je AKTUÁLNE reálne publikované na
// existujúcich verejných právnych stránkach appky (/ochrana-osobnych-udajov,
// /podmienky-pouzivania, /kontakt) — nie sú vymyslené. Polia, ktoré v
// projekte nemajú zdroj pravdy (IČO, DIČ, IČ DPH, presná adresa), sú
// explicitne `null` s TODO komentárom — DOPLŇ predtým, než sa spustí
// akákoľvek nová verzia právnych dokumentov do produkcie.
// =============================================================================

export type LegalPersonType = "fyzická osoba" | "právnická osoba";

export const legalConfig = {
  // --- Identita prevádzkovateľa (controller) ---------------------------------
  controllerName: "Jaroslav Juriš",
  legalForm: "fyzická osoba" as LegalPersonType,

  // TODO(LEGAL_DECISION_REQUIRED): presná registrovaná/kontaktná adresa
  // prevádzkovateľa musí byť doplnená pred prvým publikovaním novej
  // (verzovanej) Ochrany osobných údajov — dnešné stránky adresu neuvádzajú.
  address: null as string | null,
  country: "Slovenská republika",

  contactEmail: "info@esblu.com",
  privacyEmail: "privacy@esblu.com",

  // TODO(LEGAL_DECISION_REQUIRED): ak Jaroslav Juriš prevádzkuje Esblu ako
  // živnostník (podnikateľ – fyzická osoba), doplň IČO/DIČ/IČ DPH. Ak ide o
  // fyzickú osobu bez živnosti, ponechaj null a v dokumentoch sa na tieto
  // polia neodkazuje.
  businessId: null as string | null, // IČO
  taxId: null as string | null, // DIČ
  vatId: null as string | null, // IČ DPH

  // --- Verzovanie právnych dokumentov -----------------------------------------
  // effectiveDate = dátum, odkedy platí AKTUÁLNA verzia nižšie uvedených
  // dokumentov. Zhoduje sa s "Posledná aktualizácia" na dnešných verejných
  // stránkach. Pri KAŽDEJ obsahovej zmene dokumentu treba zvýšiť príslušné
  // *Version pole a effectiveDate — verzia sa následne premieta do
  // legal_documents (DB) a do user_legal_acceptances (kto akú verziu
  // akceptoval, pozri supabase/migrations/…_add_legal_acceptance.sql).
  effectiveDate: "2026-08-16",
  // Ochrana osobných údajov ide vo verzii 1.2 — história: 1.0 (21. júla
  // 2026) → 1.1 (15. augusta 2026, oprava nepresného zoznamu dodávateľov
  // v sekcii E) → 1.2 (16. augusta 2026). 1.2 dopĺňa v sekcii E potvrdenú
  // realitu, že kontaktné schránky info@esblu.com a privacy@esblu.com
  // (privacy@ je alias tej istej schránky) sú hostované u Namecheap
  // (Private Email), ktorý v tomto rozsahu spracúva obsah prichádzajúcej
  // e-mailovej komunikácie. Namecheap NIE JE odosielacia infraštruktúra
  // appky (tá zostáva výhradne Supabase Auth, nezmenené) — ide o samostatný,
  // novo doplnený a overený fakt. Pozri aj aktualizovanú verejnú stránku
  // /subprocessors (Namecheap pridaný do tabuľky dodávateľov) a
  // docs/gdpr-subprocessors.md. Podmienky používania a DPA obsahovo
  // nezmenené touto revíziou (DPA text dodávateľov menovite neuvádza,
  // generický odkaz na /subprocessors pokrýva aj Namecheap bez potreby
  // novej DPA verzie) → ostávajú na pôvodných verziách.
  privacyPolicyVersion: "1.2",
  termsVersion: "1.0",
  // Cookie Policy ostáva na v1.0 (revidované 2026-08-19). Prvý pokus pri
  // implementácii viacjazyčnej podpory (SK/DE/EN) ukladal zvolený jazyk do
  // nového cookie `esblu_locale`, čo by bolo v rozpore s tvrdením v1.0
  // "Esblu aktuálne nepoužíva žiadne cookies" a vyžiadalo by si novú verziu
  // (pozri zrušenú migráciu — bod nižšie). Namiesto pridávania novej
  // cookie appka jazykovú preferenciu ukladá do localStorage (rovnaký
  // mechanizmus, aký už appka používa na Supabase Auth session token) —
  // pozri lib/i18n/locales.ts a lib/i18n/LocaleProvider.tsx. Právny obsah
  // Cookie Policy sa teda skutočne NEMENÍ a nová verzia nie je potrebná.
  // ZRUŠENÉ (nikdy neaplikované v produkcii): pôvodná migrácia
  // supabase/migrations/20260819100000_add_cookie_policy_v1_1_locale.sql
  // a súbory legal/cookies/1.1*.md boli odstránené v rámci tejto revízie.
  cookiePolicyVersion: "1.0",
  // DPA ide vo verzii 1.1 (v1.0 nikdy nebola verejne nasadená, takže ide
  // stále o "prvé reálne publikovanie", nie o obsahovú zmenu naživo
  // publikovaného dokumentu) — v1.1 dopĺňa oproti pôvodnému draftu: čl. 4
  // (pokyny prevádzkovateľa vrátane povinnosti Esblu upozorniť na pokyn v
  // rozpore s GDPR), čl. 7 (výslovné právo firmy namietať proti novému
  // sprostredkovateľovi + flow-down tých istých povinností na
  // sprostredkovateľov), čl. 9 (súčinnosť pri DPIA/predchádzajúcej
  // konzultácii podľa čl. 35-36), čl. 10 (informácie a súčinnosť pri
  // audite/kontrole — čl. 28 ods. 3 písm. h, predtým úplne chýbalo), čl. 12
  // (explicitná voľba firmy medzi vymazaním a vrátením údajov), čl. 13
  // (vlastné povinnosti/práva firmy ako prevádzkovateľa) a čl. 14 (vzťah k
  // EÚ štandardným zmluvným doložkám podľa rozhodnutia 2021/915). Pozri
  // legal/dpa/1.1.md a docs/gdpr-compliance-review-2026-08-15.md pre plný
  // rozpis pokrytia čl. 28.
  dpaVersion: "1.1",
} as const;

// Dokumenty, ktoré musí AKTÍVNY používateľ (owner/admin/employee) akceptovať
// pred ďalším používaním appky. Iba tieto dva sú "required" v zmysle
// legal_documents.required = true — DPA a Subprocessors sú informačné/B2B
// dokumenty bez osobnej acceptance povinnosti pre bežného používateľa.
export const REQUIRED_ACCEPTANCE_DOCUMENTS = [
  {
    type: "terms" as const,
    version: legalConfig.termsVersion,
    label: "Podmienky používania",
    href: "/podmienky-pouzivania",
  },
  {
    type: "privacy_policy" as const,
    version: legalConfig.privacyPolicyVersion,
    label: "Zásady ochrany osobných údajov",
    href: "/ochrana-osobnych-udajov",
  },
] as const;

export type LegalDocumentType =
  (typeof REQUIRED_ACCEPTANCE_DOCUMENTS)[number]["type"];
