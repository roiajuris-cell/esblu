import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// SERVER-ONLY privilegovaný Supabase klient (service_role).
//
// DÔLEŽITÉ — tento súbor sa SMIE importovať VÝHRADNE z Next.js server-side
// kódu (app/api/**/route.ts route handlery, prípadne budúce server
// actions/server komponenty) — NIKDY z "use client" súboru. SUPABASE_SERVICE_
// ROLE_KEY nemá NEXT_PUBLIC_ prefix zámerne, takže Next.js ho nikdy
// nezabuduje do client bundlu — ak by sa tento modul omylom dostal do
// klientskeho kódu, process.env.SUPABASE_SERVICE_ROLE_KEY tam bude vždy
// undefined a getSupabaseAdmin() vyhodí chybu, nie potichu zlyhá.
//
// service_role obchádza RLS a má široké oprávnenia — používaj ho iba tam, kde
// je to nevyhnutné (napr. account-deletion flow, kde treba čítať/mazať dáta
// naprieč viacerými používateľmi firmy), a vždy AŽ PO nezávislom overení
// auth.uid() z Bearer tokenu (pozri lib/server-auth.ts).
// -----------------------------------------------------------------------------

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (alebo NEXT_PUBLIC_SUPABASE_URL) nie je nastavený v server prostredí."
    );
  }

  cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}
