import { supabase } from "@/lib/supabase";

export type CompanyMemberRole = "owner" | "admin" | "employee";
export type CompanyInviteRole = "admin" | "employee";
export type CompanyInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type EnsureOwnerCompanyResult = {
  company_id: string;
  role: CompanyMemberRole;
  created: boolean;
};

export type CompanyMemberRow = {
  member_id: string;
  user_id: string;
  email: string;
  role: CompanyMemberRole;
  status: string;
  created_at: string;
};

export type CompanyInviteRow = {
  invite_id: string;
  email: string;
  role: CompanyInviteRole;
  status: CompanyInviteStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export type CreateInviteResult = {
  invite_id: string;
  token: string;
  expires_at: string;
  email: string;
  role: CompanyInviteRole;
};

export type InvitePreview = {
  company_name: string;
  role: CompanyInviteRole;
  masked_email: string;
  expires_at: string;
  valid: boolean;
};

/**
 * Idempotentný bootstrap: ak prihlásený používateľ ešte nemá žiadne aktívne
 * company_members membership, vytvorí mu vlastnú firmu s rolou 'owner'.
 * Identita sa na DB strane odvodzuje výhradne z auth.uid(), klient
 * neposiela žiadny user_id/company_id/role.
 *
 * DÔLEŽITÉ — volať IBA z týchto dvoch presne vymedzených miest, kde je
 * owner-registration intent jednoznačný z KONTEXTU VOLANIA (nie z toho, či
 * má používateľ membership):
 *   1. app/login/page.tsx → register(), vetva s okamžitou session (email
 *      confirmation vypnuté) — sme priamo vnútri "Registrovať firmu"
 *      klik-handlera,
 *   2. app/onboarding/company/page.tsx — dedikovaná route, na ktorú smeruje
 *      výhradne emailRedirectTo z toho istého signUp() volania, keď session
 *      príde až po potvrdení e-mailu.
 * NIKDY z login() (bežné prihlásenie existujúceho ownera/admina/employee by
 * si inak mohlo omylom založiť vlastnú firmu), NIKDY globálne/fire-and-
 * forget pri každej session (app/page.tsx) a NIKDY z invite-accept flow
 * (app/invite/[token]/page.tsx). Táto funkcia už neblokuje na základe
 * pending pozvánky (bývalý DoS vektor bol odstránený na DB strane) —
 * ochranu pred konfliktom s prijatím pozvánky teraz zaisťuje výhradne
 * poradie volaní na frontende plus
 * ESBLU_ALREADY_HAS_ACTIVE_MEMBERSHIP kontrola v esblu_accept_company_invite.
 */
export async function ensureMyOwnerCompany(): Promise<EnsureOwnerCompanyResult | null> {
  const { data, error } = await supabase.rpc("esblu_ensure_my_owner_company");

  if (error) {
    console.error("ensureMyOwnerCompany zlyhalo:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function listMyCompanyMembers(): Promise<CompanyMemberRow[]> {
  const { data, error } = await supabase.rpc("esblu_list_my_company_members");

  if (error) {
    throw error;
  }

  return (data as CompanyMemberRow[]) || [];
}

export async function listMyCompanyInvites(): Promise<CompanyInviteRow[]> {
  const { data, error } = await supabase.rpc("esblu_list_my_company_invites");

  if (error) {
    throw error;
  }

  return (data as CompanyInviteRow[]) || [];
}

export async function createCompanyInvite(
  email: string,
  role: CompanyInviteRole
): Promise<CreateInviteResult> {
  const { data, error } = await supabase.rpc("esblu_create_company_invite", {
    p_email: email,
    p_role: role,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("Pozvánku sa nepodarilo vytvoriť.");
  }

  return row as CreateInviteResult;
}

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc("esblu_get_invite_preview", {
    p_token: token,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return (row as InvitePreview) ?? null;
}

export async function acceptCompanyInvite(
  token: string
): Promise<{ company_id: string; role: CompanyMemberRole }> {
  const { data, error } = await supabase.rpc("esblu_accept_company_invite", {
    p_token: token,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("Pozvánku sa nepodarilo prijať.");
  }

  return row as { company_id: string; role: CompanyMemberRole };
}

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  ESBLU_INVALID_TOKEN: "Odkaz na pozvánku je neplatný.",
  ESBLU_INVITE_ALREADY_ACCEPTED: "Táto pozvánka už bola použitá.",
  ESBLU_INVITE_REVOKED: "Táto pozvánka bola zrušená.",
  ESBLU_INVITE_EXPIRED: "Platnosť tejto pozvánky vypršala.",
  ESBLU_INVITE_EMAIL_MISMATCH:
    "Táto pozvánka je určená pre iný e-mail. Prihláste sa s e-mailom, na ktorý bola pozvánka odoslaná.",
  ESBLU_ALREADY_HAS_ACTIVE_MEMBERSHIP:
    "Váš účet je už členom inej firmy, takže túto pozvánku nie je možné prijať.",
  NOT_AUTHENTICATED: "Najprv sa prihláste alebo si vytvorte účet.",
};

export function getInviteErrorMessage(error: unknown): string {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  for (const [code, message] of Object.entries(INVITE_ERROR_MESSAGES)) {
    if (text.includes(code)) {
      return message;
    }
  }

  return "Pozvánku sa nepodarilo prijať. Skúste to prosím znova.";
}

const CREATE_INVITE_ERROR_MESSAGES: Record<string, string> = {
  ESBLU_NOT_ACTIVE_OWNER_OR_ADMIN:
    "Iba majiteľ alebo používateľ s plným prístupom môže vytvárať pozvánky.",
  ESBLU_INVALID_INVITE_EMAIL: "Zadajte platnú e-mailovú adresu.",
  ESBLU_INVITE_ALREADY_MEMBER: "Tento používateľ je už členom vašej firmy.",
  ESBLU_INVITE_ALREADY_PENDING:
    "Tento e-mail už má aktívnu čakajúcu pozvánku do vašej firmy.",
};

export function getCreateInviteErrorMessage(error: unknown): string {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  for (const [code, message] of Object.entries(CREATE_INVITE_ERROR_MESSAGES)) {
    if (text.includes(code)) {
      return message;
    }
  }

  return "Pozvánku sa nepodarilo vytvoriť. Skúste to prosím znova.";
}
