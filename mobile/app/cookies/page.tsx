// Mobile Cookies — čistý re-export, 0 duplikovanej business logiky.
// Pozri @/app/cookies/page.tsx. Odkazovaná z Nastavenia (GDPR sekcia) a
// z pätičky /login. Obsah číta lib/legal-content.ts (opravené na __dirname
// namiesto process.cwd(), aby fungovalo aj s mobile build root-om).
export { default } from "@/app/cookies/page";
