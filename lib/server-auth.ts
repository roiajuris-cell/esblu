import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { translate } from "@/lib/i18n/translate";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

// -----------------------------------------------------------------------------
// Zdieľaný helper na server-side overenie prihláseného používateľa z Bearer
// tokenu (Authorization header). Rovnaký vzor ako existujúci
// app/api/scan-document/route.ts — samostatný anon-key klient (NIE
// service_role) sa použije LEN na auth.getUser(accessToken), teda na
// overenie platnosti JWT a získanie auth.uid(). Toto úmyselne NEPOUŽÍVA
// getSupabaseAdmin() (service_role) — overenie identity a privilegované
// operácie sú zámerne oddelené cez dva rôzne klienty.
// -----------------------------------------------------------------------------

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export type VerifiedUserResult =
  | { user: User; error: null }
  | { user: null; error: string };

export async function verifyRequestUser(
  req: Request,
  locale: Locale = DEFAULT_LOCALE
): Promise<VerifiedUserResult> {
  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return { user: null, error: translate(locale, "inbox.errors.notLoggedIn") };
  }

  const {
    data: { user },
    error,
  } = await supabaseAuthClient.auth.getUser(accessToken);

  if (error || !user) {
    return {
      user: null,
      error: translate(locale, "inbox.errors.sessionExpired"),
    };
  }

  return { user, error: null };
}
