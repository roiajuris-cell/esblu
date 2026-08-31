// Mobile Auth Callback (RELEASE BLOCKER FIX, 2026-08-31, TokenHash revízia)
// — čistý re-export, 0 duplikovanej business logiky. Pozri
// @/app/auth/callback/page.tsx pre plný root cause a bezpečnostné
// vysvetlenie. Rovnaký vzor ako mobile/app/onboarding/company/page.tsx a
// mobile/app/reset-hesla/page.tsx — stránka je statická (Next.js static
// export), session sa ustanovuje explicitne z URL (`?token_hash=...&type=
// email|recovery`, cez supabase.auth.verifyOtp()) v tej istej zdieľanej
// komponente, ktorú používa aj web.
export { default } from "@/app/auth/callback/page";
