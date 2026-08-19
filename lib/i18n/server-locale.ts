import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, normalizeLocale, type Locale } from "./locales";

// Server-side zistenie jazyka (Server Components, napr. app/layout.tsx) —
// číta iba cookie (rýchle, bez DB round-tripu, funguje aj pre neprihláseného
// návštevníka). Prihlásený používateľ má navyše settings.locale ako
// druhotný zdroj pravdy naprieč zariadeniami — synchronizácia cookie ←
// settings.locale prebieha na klientovi (LocaleProvider), pretože si
// vyžaduje aktívnu Supabase session, ktorú Server Component v layout.tsx
// zámerne nečíta (žiadna zmena existujúceho auth/session flow).
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}
