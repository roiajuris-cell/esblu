// Mobile zoznam skladu — čistý re-export, 0 duplikovanej business logiky.
// Pozri @/app/sklad/page.tsx. Odkazy na detail už idú cez
// inventoryItemDetailHref() (lib/entity-links.ts), takže na mobile builde
// automaticky smerujú na /sklad/detail?id=... namiesto /sklad/[id].
export { default } from "@/app/sklad/page";
