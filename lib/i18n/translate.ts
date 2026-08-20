import { DEFAULT_LOCALE, type Locale } from "./locales";
import { dictionaries } from "./dictionaries";
import type { DictionaryValue } from "./dictionary-types";

// Jadro i18n — čistá funkcia bez závislosti na Reacte, takže ju možno volať
// rovnako zo Server aj Client Componentov (Server Component si locale
// zistí zo server-side cookie, Client Component z LocaleProvider Contextu
// — pozri lib/i18n/server-locale.ts a lib/i18n/LocaleProvider.tsx).
//
// key je bodkovaná cesta v rámci slovníka, napr. "auth.login.title" alebo
// "common.buttons.save". Chýbajúci preklad v DE/EN sa nikdy nezobrazí ako
// prázdny text ani surový kľúč bežnému používateľovi — automaticky spadne
// na SK (zdrojový jazyk). Ak kľúč chýba aj v SK, vráti samotný kľúč (viditeľné
// v deve, aby sa chýbajúci preklad dal ľahko nájsť).
function lookup(locale: Locale, key: string): string | undefined {
  const segments = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: DictionaryValue | undefined = dictionaries[locale] as any;

  for (const segment of segments) {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }
    node = (node as Record<string, DictionaryValue>)[segment];
  }

  return typeof node === "string" ? node : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const resolved =
    lookup(locale, key) ??
    (locale !== DEFAULT_LOCALE ? lookup(DEFAULT_LOCALE, key) : undefined) ??
    key;

  if (!vars) return resolved;

  return Object.entries(vars).reduce(
    (text, [varName, value]) => text.split(`{{${varName}}}`).join(String(value)),
    resolved
  );
}

// Jednoduchý plurál bez závislosti na knižnici Intl.PluralRules — slovenčina
// má 3 tvary (1 / 2-4 / 5+ a 0), nemčina a angličtina majú reálne len 2
// (1 / ostatné), preto dictionary kľúče vždy definujú _one/_few/_many a
// pre DE/EN sú _few a _many jednoducho identické. baseKey je kľúč BEZ
// prípony, napr. "inbox.documentsCountSuffix" → vyhľadá
// "inbox.documentsCountSuffix_one" / "_few" / "_many".
export function pluralSuffix(locale: Locale, count: number): "_one" | "_few" | "_many" {
  const n = Math.abs(count);
  if (locale === "sk") {
    if (n === 1) return "_one";
    if (n >= 2 && n <= 4) return "_few";
    return "_many";
  }
  // DE/EN: len jednotné/množné číslo, _few aj _many nesú rovnaký text.
  return n === 1 ? "_one" : "_many";
}

export function translateCount(
  locale: Locale,
  baseKey: string,
  count: number,
  vars?: Record<string, string | number>
): string {
  return translate(locale, `${baseKey}${pluralSuffix(locale, count)}`, { count, ...vars });
}
