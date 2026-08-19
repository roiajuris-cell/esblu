"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type Locale,
} from "./locales";
import { translate } from "./translate";

// Esblu i18n — client-side Context. Drží AKTUÁLNY jazyk (inicializovaný zo
// server-side cookie cez initialLocale, takže prvé vykreslenie na
// klientovi je vždy zhodné so serverom — žiadny hydration mismatch/FOUC) a
// vystavuje t()/setLocale() zvyšku appky.
//
// Perzistencia (zadanie, bod "Preferované správanie"):
//   - VŽDY: cookie (funguje pred aj po prihlásení, bez DB round-tripu),
//   - NAVYŠE ak je používateľ prihlásený: best-effort zápis do
//     public.settings.locale (20260819090000_add_settings_locale.sql),
//     aby sa jazyk obnovil aj po prihlásení z iného zariadenia/prehliadača.
//     Zlyhanie tohto zápisu (napr. dočasný výpadok siete) NIKDY neblokuje
//     samotnú zmenu jazyka v UI — cookie je vždy zdroj pravdy pre aktuálnu
//     reláciu.
type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function setLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;

  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    normalizeLocale(initialLocale)
  );

  const setLocale = useCallback((next: Locale) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    setLocaleCookie(normalized);

    // Best-effort — ak nie je prihlásený, getSession() vráti null a appka
    // jednoducho pokračuje s cookie perzistenciou (bod "neprihlásený
    // používateľ" zo zadania). Nikdy nič nevyhadzuje/neblokuje UI.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session) return;

        return supabase
          .from("settings")
          .update({ locale: normalized })
          .eq("user_id", session.user.id);
      })
      .catch((error) => {
        console.error("Uloženie jazykovej preferencie zlyhalo:", error);
      });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);

  if (!ctx) {
    throw new Error("useLocale() musí byť volané vnútri <LocaleProvider>.");
  }

  return ctx;
}
