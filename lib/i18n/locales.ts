// Esblu i18n — podporované jazyky a zdieľané konštanty.
//
// Architektonické rozhodnutie (viď final report): BEZ locale-prefix routingu
// (/sk/..., /de/..., /en/...). Dôvod: existujúci routing (Supabase Auth
// callbacky, Closed Beta gate, /invite/[token], právny gate, PWA
// manifest/deep linky, API routes) je dnes bezo stavu jazyka a akákoľvek
// zmena URL štruktúry by niesla reálne riziko regresie práve v týchto
// citlivých flow.
//
// Perzistencia jazyka je ZÁMERNE riešená cez localStorage, NIE cez cookie
// (revidované — pôvodná implementácia používala cookie `esblu_locale`,
// čo by si vyžiadalo novú verziu Cookie Policy, keďže v1.0 explicitne
// tvrdí "Esblu nepoužíva žiadne cookies". Aby pridanie i18n funkcie
// nemenilo právny obsah appky, appka namiesto cookie použije presne ten
// istý mechanizmus, aký už appka používa na session token — localStorage,
// ktoré Cookie Policy už dnes explicitne opisuje ako "nie je cookie").
// Dôsledok: Server Components (napr. app/layout.tsx, verejné právne
// stránky) nemajú pred prvým vykreslením žiadny signál o preferovanom
// jazyku (localStorage nie je na serveri dostupné) — vždy SSR-ujú v
// DEFAULT_LOCALE (sk) a LocaleProvider po mountnutí na klientovi prepne
// na uloženú preferenciu. Ide o vedomý kompromis (krátky FOUC v SK pri
// tvrdom reloade pre DE/EN používateľa) výmenou za to, že appka nezavádza
// žiadnu novú cookie a Cookie Policy zostáva nezmenená (verzia 1.0).
export const SUPPORTED_LOCALES = ["sk", "de", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Slovenčina je zdrojový (fallback) jazyk — ak DE/EN preklad chýba pre
// konkrétny kľúč, appka nikdy nezobrazí prázdny text ani surový kľúč
// používateľovi, ale doplní SK verziu.
export const DEFAULT_LOCALE: Locale = "sk";

// localStorage kľúč (NIE cookie) — pozri komentár vyššie.
export const LOCALE_STORAGE_KEY = "esblu_locale";

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
