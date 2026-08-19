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
