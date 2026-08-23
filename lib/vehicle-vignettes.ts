import type { Locale } from "./i18n/locales";

// =============================================================================
// Esblu — diaľničné známky vozidiel (vehicle_vignettes)
// =============================================================================
// Zdieľané medzi app/vozidla/[id]/page.tsx (detail vozidla), app/ai-evidencia/
// page.tsx (TP review flow) a app/components/Dashboard.tsx (upozornenia) —
// rovnaký princíp ako existujúce zdieľané lib helpery (napr. normalizeSpz),
// NIE duplikovaný per-page kód, keďže ide o čistú doménovú dátovú štruktúru
// a referenčné dáta (zoznam krajín), nie o page-špecifickú UI logiku.
// =============================================================================

// Presný tvar riadku public.vehicle_vignettes (pozri migráciu
// 20260823090000_add_vehicle_vignettes.sql) — nahrádza predchádzajúce
// `any`/`any[]` použitie v Dashboard.tsx a app/vozidla/[id]/page.tsx.
export type VehicleVignette = {
  id: string;
  company_id: string;
  vehicle_id: string;
  country_code: string;
  valid_until: string;
  created_at: string;
  updated_at: string;
};

// Tvar jedného riadku v TP review formulári (app/ai-evidencia/page.tsx) —
// PRED uložením ešte nemá id/company_id/timestampy (tie priradí DB až pri
// insert/upsert), preto samostatný, užší typ.
export type DraftVehicleVignette = {
  country_code: string;
  valid_until: string;
};

// -----------------------------------------------------------------------------
// Zoznam krajín pre UI select — PREDPRÍPRAVA, nie obmedzenie DB.
// -----------------------------------------------------------------------------
// public.vehicle_vignettes.country_code je voľný ISO 3166-1 alpha-2 text s
// CHECK iba na formát (2 veľké písmená) — DB nikdy nevynucuje konkrétnu
// množinu krajín. Zoznam nižšie je "rozumný zoznam európskych ISO krajín"
// (bod zadania) pre pohodlný select bez nutnosti poznať/napísať kód ručne;
// SK/CZ/AT sú prvé tri (minimálna požadovaná predpríprava). Pre krajinu,
// ktorá tu chýba, UI ponúka voľbu "Iná krajina" s ručným ISO alpha-2
// vstupom (pozri VIGNETTE_OTHER_COUNTRY_OPTION nižšie a jeho použitie v
// app/vozidla/[id]/page.tsx a app/ai-evidencia/page.tsx) — appka teda NIE
// JE prakticky obmedzená na tento zoznam, iba naň optimalizovaná pre
// najbežnejšie prípady. Pridanie ďalšej krajiny SEM (rozšírenie zoznamu)
// nevyžaduje žiadnu DB migráciu, iba úpravu tohto poľa.
export const VIGNETTE_COUNTRIES: {
  code: string;
  sk: string;
  de: string;
  en: string;
}[] = [
  { code: "SK", sk: "Slovensko", de: "Slowakei", en: "Slovakia" },
  { code: "CZ", sk: "Česko", de: "Tschechien", en: "Czechia" },
  { code: "AT", sk: "Rakúsko", de: "Österreich", en: "Austria" },
  { code: "BE", sk: "Belgicko", de: "Belgien", en: "Belgium" },
  { code: "BG", sk: "Bulharsko", de: "Bulgarien", en: "Bulgaria" },
  { code: "CH", sk: "Švajčiarsko", de: "Schweiz", en: "Switzerland" },
  { code: "DE", sk: "Nemecko", de: "Deutschland", en: "Germany" },
  { code: "DK", sk: "Dánsko", de: "Dänemark", en: "Denmark" },
  { code: "EE", sk: "Estónsko", de: "Estland", en: "Estonia" },
  { code: "ES", sk: "Španielsko", de: "Spanien", en: "Spain" },
  { code: "FI", sk: "Fínsko", de: "Finnland", en: "Finland" },
  { code: "FR", sk: "Francúzsko", de: "Frankreich", en: "France" },
  { code: "GB", sk: "Spojené kráľovstvo", de: "Vereinigtes Königreich", en: "United Kingdom" },
  { code: "GR", sk: "Grécko", de: "Griechenland", en: "Greece" },
  { code: "HR", sk: "Chorvátsko", de: "Kroatien", en: "Croatia" },
  { code: "HU", sk: "Maďarsko", de: "Ungarn", en: "Hungary" },
  { code: "IE", sk: "Írsko", de: "Irland", en: "Ireland" },
  { code: "IT", sk: "Taliansko", de: "Italien", en: "Italy" },
  { code: "LI", sk: "Lichtenštajnsko", de: "Liechtenstein", en: "Liechtenstein" },
  { code: "LT", sk: "Litva", de: "Litauen", en: "Lithuania" },
  { code: "LU", sk: "Luxembursko", de: "Luxemburg", en: "Luxembourg" },
  { code: "LV", sk: "Lotyšsko", de: "Lettland", en: "Latvia" },
  { code: "ME", sk: "Čierna Hora", de: "Montenegro", en: "Montenegro" },
  { code: "MK", sk: "Severné Macedónsko", de: "Nordmazedonien", en: "North Macedonia" },
  { code: "NL", sk: "Holandsko", de: "Niederlande", en: "Netherlands" },
  { code: "NO", sk: "Nórsko", de: "Norwegen", en: "Norway" },
  { code: "PL", sk: "Poľsko", de: "Polen", en: "Poland" },
  { code: "PT", sk: "Portugalsko", de: "Portugal", en: "Portugal" },
  { code: "RO", sk: "Rumunsko", de: "Rumänien", en: "Romania" },
  { code: "RS", sk: "Srbsko", de: "Serbien", en: "Serbia" },
  { code: "SE", sk: "Švédsko", de: "Schweden", en: "Sweden" },
  { code: "SI", sk: "Slovinsko", de: "Slowenien", en: "Slovenia" },
  { code: "TR", sk: "Turecko", de: "Türkei", en: "Turkey" },
  { code: "UA", sk: "Ukrajina", de: "Ukraine", en: "Ukraine" },
];

// Špeciálna hodnota pre <select>, po ktorej UI zobrazí voľný textový vstup
// pre ISO alpha-2 kód namiesto výberu zo zoznamu. Zámerne mimo formátu
// skutočného country_code (nikdy by sa nemohla zapísať do DB), takže sa
// nemôže náhodou zamieňať za reálnu hodnotu.
export const VIGNETTE_OTHER_COUNTRY_OPTION = "__other__";

// ISO 3166-1 alpha-2 formát — rovnaká kontrola ako DB CHECK constraint
// (vehicle_vignettes_country_code_format v migrácii 20260823090000).
// Používa sa na validáciu ručne zadaného kódu z "Iná krajina" vstupu PRED
// odoslaním na server (server-side CHECK ostáva konečná autorita).
export function isValidVignetteCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

// Lokalizovaný názov krajiny podľa aktuálneho jazyka appky, s bezpečným
// fallbackom na holý kód pre akýkoľvek country_code mimo VIGNETTE_COUNTRIES
// (napr. ručne zadaný cez "Iná krajina", alebo krajina pridaná do DB pred
// tým, než pribudla do tohto zoznamu) — nikdy nezobrazí prázdny/nezmyselný
// text.
export function vignetteCountryLabel(
  countryCode: string,
  locale: Locale
): string {
  const entry = VIGNETTE_COUNTRIES.find((c) => c.code === countryCode);
  return entry ? entry[locale] : countryCode;
}
