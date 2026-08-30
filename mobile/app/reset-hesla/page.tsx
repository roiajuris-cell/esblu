// Mobile Reset hesla — čistý re-export, 0 duplikovanej business logiky.
// Pozri @/app/reset-hesla/page.tsx. Stránka je už dnes statická (žiadny
// useParams/useSearchParams) — session z e-mailového recovery odkazu sa
// zisťuje výhradne cez supabase.auth.onAuthStateChange/getSession (implicit
// flow, access_token v URL hash fragmente), nie cez route param, takže
// nepotrebuje žiadnu úpravu ani Suspense hranicu na rozdiel od /invite.
export { default } from "@/app/reset-hesla/page";
