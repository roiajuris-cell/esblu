// Mobile zoznam strojov — čistý re-export, 0 duplikovanej business logiky.
// Pozri @/app/stroje/page.tsx. Odkazy na detail už idú cez
// machineDetailHref() (lib/entity-links.ts), takže na mobile builde
// automaticky smerujú na /stroje/detail?id=... namiesto /stroje/[id].
export { default } from "@/app/stroje/page";
