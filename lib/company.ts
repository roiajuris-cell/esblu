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

export type MyActiveMembership = {
  company_id: string;
  role: CompanyMemberRole;
};

/**
 * Aktívny membership prihláseného používateľa (company_id + rola), priamo z
 * company_members (RLS company_members_select_own: user_id = auth.uid(),
 * z 20260814110000 — každý používateľ vidí vždy iba svoj vlastný riadok,
 * bez ohľadu na rolu). Toto je frontendový náprotivok DB funkcií
 * public.esblu_my_active_company_id() / public.esblu_my_active_role() z
 * 20260814160000 — slúži IBA na to, aby appka vedela, čo zobraziť/skryť v
 * UI (company-wide dáta, owner/admin-only akcie). Skutočná autorizácia sa
 * vždy vynucuje na strane DB (RLS + triggery), toto je iba UI vrstva.
 *
 * Vracia null, ak používateľ nemá žiadny aktívny membership (nemalo by
 * nastať pre bežne prihláseného používateľa po onboardingu, ale appka sa
 * musí správať bezpečne aj v tomto prípade — zobrazí prázdny stav namiesto
 * pádu).
 */
export async function getMyActiveMembership(): Promise<MyActiveMembership | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", session.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { company_id: data.company_id, role: data.role as CompanyMemberRole };
}

export function isOwnerOrAdmin(role: CompanyMemberRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export type CompanyProfile = {
  company_name: string | null;
  logo_path: string | null;
};

/**
 * Firemný názov + logo pre AKTÍVNEHO PRIHLÁSENÉHO POUŽÍVATEĽA, bez ohľadu na
 * jeho rolu — owner, admin aj employee dostanú rovnaké dva údaje (branding
 * ownera firmy), nikdy vlastný, väčšinou prázdny settings riadok. Volá
 * public.esblu_get_company_profile() (20260814180000), ktorá company_id
 * odvodzuje výhradne z auth.uid(). Vracia null, ak volajúci nemá aktívny
 * membership alebo ak firma ešte nemá vyplnené meno/logo (bežný, nechybový
 * stav — volajúci má zachovať dnešný fallback).
 */
export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const { data, error } = await supabase.rpc("esblu_get_company_profile");

  if (error) {
    console.error("getCompanyProfile zlyhalo:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

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
