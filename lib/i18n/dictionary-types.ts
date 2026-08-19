// Esblu i18n — typový tvar slovníka. Odvodený zo zdrojového (SK) slovníka
// nižšie (lib/i18n/dictionaries/sk.ts) — DE/EN slovníky musia štrukturálne
// zodpovedať presne tomuto tvaru (kontroluje `satisfies Dictionary` pri ich
// definícii), takže chýbajúci/naviac kľúč v preklade spôsobí chybu
// TypeScriptu už pri buildovaní, nie tichú medzeru za behu.
export type DictionaryValue = string | { [key: string]: DictionaryValue };

export type Dictionary = {
  [namespace: string]: {
    [key: string]: DictionaryValue;
  };
};
