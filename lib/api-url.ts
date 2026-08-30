import { IS_MOBILE_BUILD } from "@/lib/build-target";

// -----------------------------------------------------------------------------
// Zdieľaný helper na volanie existujúcich Next.js API routes (app/api/**) tak,
// aby fungovali nezmenené AJ vo webovom builde (relatívna cesta, rovnaký
// origin ako esblu.com), AJ v mobile Capacitor builde (absolútna URL na
// produkčný Vercel backend, keďže mobile frontend beží z lokálne zabalených
// assets, nie z https://esblu.com origin).
//
// Princíp (zadanie FÁZA 1, bod 5):
// - web    → API_BASE_URL = ""                → apiUrl("/api/x") === "/api/x"
// - mobile → API_BASE_URL = "https://esblu.com" → apiUrl("/api/x") === "https://esblu.com/api/x"
//
// Web build IS_MOBILE_BUILD je vždy false (pozri lib/build-target.ts), takže
// toto pre existujúci web produkčný build nič nemení — apiUrl(path) === path.
// -----------------------------------------------------------------------------

const MOBILE_API_BASE_URL = "https://esblu.com";

export function apiUrl(path: string): string {
  const base = IS_MOBILE_BUILD ? MOBILE_API_BASE_URL : "";
  return `${base}${path}`;
}
