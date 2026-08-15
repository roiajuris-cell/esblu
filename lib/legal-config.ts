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
  effectiveDate: "2026-08-15",
  // Ochrana osobných údajov ide vo verzii 1.1 — oproti pôvodnej verzii 1.0
  // (21. júla 2026) opravuje nepresný zoznam dodávateľov v sekcii E (pôvodná
  // verzia nesprávne uvádzala Resend a Namecheap Private Email, hoci appka
  // v skutočnosti žiadny vlastný e-mail neodosiela — všetka e-mailová
  // komunikácia ide cez Supabase Auth) a dopĺňa odkazy na nové /cookies,
  // /dpa a /subprocessors stránky. Podmienky používania obsahovo nezmenené
  // → ostávajú na verzii 1.0.
  privacyPolicyVersion: "1.1",
  termsVersion: "1.0",
  // Cookie Policy je v tejto fáze NOVÝ dokument (predtým nepublikovaný) —
  // verzia 1.0 od dátumu prvého publikovania, ktorý sa doplní pri reálnom
  // nasadení (pozri gdpr-launch-checklist.md).
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
