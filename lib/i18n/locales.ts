// Esblu i18n — podporované jazyky a zdieľané konštanty.
//
// Architektonické rozhodnutie (viď final report): BEZ locale-prefix routingu
// (/sk/..., /de/..., /en/...). Dôvod: existujúci routing (Supabase Auth
// callbacky, Closed Beta gate, /invite/[token], právny gate, PWA
// manifest/deep linky, API routes) je dnes bezo stavu jazyka a akákoľvek
// zmena URL štruktúry by niesla reálne riziko regresie práve v týchto
// citlivých flow. Namiesto toho appka drží jazyk v cookie (funguje pred aj
// po prihlásení, číta sa server-side v app/layout.tsx bez FOUC) a voliteľne
// v public.settings.locale pre prihláseného používateľa (naprieč
// zariadeniami). Žiadna URL sa touto architektúrou nemení.
export const SUPPORTED_LOCALES = ["sk", "de", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Slovenčina je zdrojový (fallback) jazyk — ak DE/EN preklad chýba pre
// konkrétny kľúč, appka nikdy nezobrazí prázdny text ani surový kľúč
// používateľovi, ale doplní SK verziu.
export const DEFAULT_LOCALE: Locale = "sk";

export const LOCALE_COOKIE_NAME = "esblu_locale";

// 1 rok — rovnaký rád veľkosti ako iné trvalé preferenčné cookies, appka
// nedrží žiadny osobný údaj v hodnote cookie, iba kód jazyka.
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, string> = {
  sk: "Slovenčina",
  de: "Deutsch",
  en: "English",
};

export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  sk: "SK",
  de: "DE",
  en: "EN",
};

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeLocale(value: unknown): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
