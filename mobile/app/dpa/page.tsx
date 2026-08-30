// Mobile DPA — čistý re-export, 0 duplikovanej business logiky.
// Pozri @/app/dpa/page.tsx. KRITICKÉ pre mobile: odkazuje naň
// CompanyDpaGate.tsx, povinná blokujúca brána namontovaná v zdieľanom
// app/layout.tsx (aktívna aj v mobile builde) — bez tejto routy by
// používateľ na mobile nemohol odsúhlasiť DPA a pokračovať v appke.
// Obsah číta lib/legal-content.ts (opravené na __dirname).
export { default } from "@/app/dpa/page";
