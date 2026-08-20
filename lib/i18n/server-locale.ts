// ZASTARANÉ / NEPOUŽÍVANÉ — pôvodná implementácia čítala jazyk zo
// server-side cookie `esblu_locale`. Táto cookie bola z architektúry
// odstránená (pozri lib/i18n/locales.ts pre plné zdôvodnenie — appka
// jazyk ukladá do localStorage, aby nezavádzala novú cookie a nemenila
// právny obsah Cookie Policy), takže Server Components už nemajú žiadny
// signál o preferovanom jazyku pred prvým vykreslením a vždy SSR-ujú v
// DEFAULT_LOCALE (pozri app/layout.tsx).
//
// Súbor nebolo možné v tomto prostredí fyzicky odstrániť (obmedzenie
// súborového systému v sandboxe pri mazaní súborov v mountnutom
// priečinku) — je zámerne vyprázdnený a nikde v appke sa neimportuje.
// Bezpečné zmazať manuálne, ak to prostredie používateľa umožní.
export {};
