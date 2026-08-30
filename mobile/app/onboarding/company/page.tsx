// Mobile Onboarding company (owner signup email confirmation) — čistý
// re-export, 0 duplikovanej business logiky. Pozri
// @/app/onboarding/company/page.tsx. Rovnaký dôvod ako pri /reset-hesla:
// stránka je už dnes statická, session sa zisťuje cez supabase.auth
// implicit flow z URL hash fragmentu, nie cez route param.
export { default } from "@/app/onboarding/company/page";
