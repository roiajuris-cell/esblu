// Mobile zoznam vozidiel — čistý re-export, 0 duplikovanej business logiky.
// Pozri @/app/vozidla/page.tsx. Odkazy na detail už idú cez
// vehicleDetailHref() (lib/entity-links.ts), takže na mobile builde
// automaticky smerujú na /vozidla/detail?id=... namiesto /vozidla/[id].
export { default } from "@/app/vozidla/page";
