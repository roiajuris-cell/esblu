// Mobile Nastavenia — čistý re-export, 0 duplikovanej business logiky.
// Pozri @/app/nastavenia/page.tsx. Táto stránka odkazuje aj na právne
// stránky (GDPR sekcia: ochrana-osobnych-udajov, podmienky-pouzivania,
// cookies, dpa, subprocessors, kontakt) — tie majú vlastné mobile wrappery
// v rovnakom adresári mobile/app/.
export { default } from "@/app/nastavenia/page";
