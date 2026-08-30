// Mobile Podmienky používania — čistý re-export, 0 duplikovanej business
// logiky. Pozri @/app/podmienky-pouzivania/page.tsx. KRITICKÉ pre mobile:
// odkazuje naň LegalAcceptanceGate.tsx, povinná blokujúca brána
// namontovaná v zdieľanom app/layout.tsx (aktívna aj v mobile builde) —
// bez tejto routy by nový používateľ na mobile nemohol odsúhlasiť
// podmienky a pokračovať v appke. Obsah číta lib/legal-content.ts
// (opravené na __dirname).
export { default } from "@/app/podmienky-pouzivania/page";
