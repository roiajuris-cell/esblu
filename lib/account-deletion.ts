import { supabase } from "@/lib/supabase";

// -----------------------------------------------------------------------------
// Klientske helpery pre samoobslužné "Zrušiť účet" v app/nastavenia.
// Volajú výhradne server-side API routes (app/api/account/preflight,
// app/api/account/delete) — service_role kľúč sa nikdy nedostane do
// klientskeho kódu. Autorizácia sa v skutočnosti overuje na serveri
// (Bearer token + znovu-načítaná rola/company_id); confirmPhrase je iba
// UX poistka proti omylom, nie bezpečnostný mechanizmus.
// -----------------------------------------------------------------------------

const CONFIRM_PHRASE = "ZRUŠIŤ FIRMU";

export type AccountDeletionPreflight = {
  role: "owner" | "admin" | "employee";
  otherActiveMembersCount: number;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Nie si prihlásený.");
  }

  return session.access_token;
}

export async function fetchAccountDeletionPreflight(): Promise<AccountDeletionPreflight> {
  const accessToken = await getAccessToken();

  const response = await fetch("/api/account/preflight", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || "Prípravu na zrušenie účtu sa nepodarilo načítať.");
  }

  return body as AccountDeletionPreflight;
}

export async function deleteMyAccount(confirmPhrase?: string): Promise<void> {
  const accessToken = await getAccessToken();

  const response = await fetch("/api/account/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      confirmPhrase !== undefined ? { confirmPhrase } : {}
    ),
  });

  const body = await response.json();

  if (!response.ok || !body.success) {
    throw new Error(body.error || "Zrušenie účtu zlyhalo.");
  }
}

export { CONFIRM_PHRASE as ACCOUNT_DELETION_CONFIRM_PHRASE };
