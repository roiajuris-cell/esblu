// Mobile AI Evidencia routa — čistý re-export, 0 duplikovanej business
// logiky. Pozri @/app/ai-evidencia/page.tsx. API volania v tomto module už
// idú cez apiUrl() (lib/api-url.ts), takže na mobile builde automaticky
// smerujú na https://esblu.com/api/... namiesto relatívnej cesty.
export { default } from "@/app/ai-evidencia/page";
