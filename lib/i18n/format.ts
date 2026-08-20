// Esblu i18n — locale-sensitive formátovanie dátumov/času/čísel.
//
// Dôležité rozlíšenie (viď bod 1 zadania "Celé i18n"): toto NIKDY nesmie
// prekladať obsah nahraný používateľom (napr. text extrahovaný AI z
// dokumentu) — iba systémové UI hodnoty ako "kedy bol záznam vytvorený",
// ktoré appka sama formátuje z ISO timestampu.
import type { Locale } from "./locales";

// Mapovanie na BCP-47 locale pre Intl.* API. sk/de majú prirodzený
// DD.MM.YYYY / DD.MM.YYYY formát; pre EN zámerne používame en-GB
// (DD/MM/YYYY), nie en-US (MM/DD/YYYY) — konzistentnejšie s SK/DE a menej
// mätúce pre používateľov firemnej appky prevádzkovanej v EÚ.
const INTL_LOCALE_MAP: Record<Locale, string> = {
  sk: "sk-SK",
  de: "de-DE",
  en: "en-GB",
};

export function toIntlLocale(locale: Locale): string {
  return INTL_LOCALE_MAP[locale];
}

export function formatDate(
  value: string | number | Date,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(toIntlLocale(locale), options);
}

export function formatDateTime(
  value: string | number | Date,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(toIntlLocale(locale), options);
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return value.toLocaleString(toIntlLocale(locale), options);
}
