import { normalizeLocale, type Locale } from "./locales";

// -----------------------------------------------------------------------------
// Server-side API routes (app/api/**) nemajú žiadny signál o jazyku z
// cookie ani session (locale žije iba v localStorage na klientovi — pozri
// lib/i18n/locales.ts). Aby chybové/stavové hlásenia vracané z API routes
// (napr. app/api/account/*, app/api/scan-*) rešpektovali aktuálny jazyk
// používateľa a nezostali natvrdo v slovenčine, klient posiela svoj
// aktuálny locale v hlavičke `x-esblu-locale` (nastavuje sa pri fetch()
// volaní z komponentu, ktorý má useLocale() v scope). Táto funkcia hlavičku
// prečíta a normalizuje na podporovaný Locale — pri chýbajúcej/neplatnej
// hodnote sa bezpečne vráti DEFAULT_LOCALE (sk).
// -----------------------------------------------------------------------------
export const REQUEST_LOCALE_HEADER = "x-esblu-locale";

export function getRequestLocale(req: Request): Locale {
  return normalizeLocale(req.headers.get(REQUEST_LOCALE_HEADER));
}
