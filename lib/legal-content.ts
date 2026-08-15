import fs from "node:fs";
import path from "node:path";

// =============================================================================
// Nemenný obsah publikovaných verzií právnych dokumentov žije v `legal/`
// (mimo `app/`), NIE inline v .tsx komponentoch stránok. Verejné stránky
// (app/podmienky-pouzivania, app/ochrana-osobnych-udajov, app/dpa,
// app/cookies) sú iba tenké rendering shelly — obsah čítajú odtiaľto a
// vykresľujú cez lib/legal-markdown-render.tsx. content_hash v DB
// (legal_documents, supabase/migrations/20260815100000_add_legal_acceptance.sql)
// je SHA-256 presne TOHOTO súboru, nikdy hash .tsx komponentu.
//
// Priečinok POD legal/ sa nezhoduje 1:1 s legal_documents.type — mapovanie
// je zámerne explicitné (nie odvodené reťazcovou manipuláciou), aby bolo
// vždy na prvý pohľad jasné a nemenilo sa nedopatrením:
//   terms          -> legal/terms/<version>.md
//   privacy_policy -> legal/privacy/<version>.md
//   dpa            -> legal/dpa/<version>.md
//   cookie_policy  -> legal/cookies/<version>.md
// =============================================================================

export type LegalDocumentType =
  | "terms"
  | "privacy_policy"
  | "dpa"
  | "cookie_policy";

const CONTENT_FOLDER_BY_TYPE: Record<LegalDocumentType, string> = {
  terms: "terms",
  privacy_policy: "privacy",
  dpa: "dpa",
  cookie_policy: "cookies",
};

const LEGAL_CONTENT_ROOT = path.join(process.cwd(), "legal");

/**
 * Cesta k nemennému .md súboru pre danú (document_type, version) — presne
 * ten istý súbor, ktorého SHA-256 je uložený v legal_documents.content_hash.
 */
export function legalContentFilePath(
  documentType: LegalDocumentType,
  version: string
): string {
  const folder = CONTENT_FOLDER_BY_TYPE[documentType];

  return path.join(LEGAL_CONTENT_ROOT, folder, `${version}.md`);
}

/**
 * Prečíta nemenný obsah danej verzie. Volať iba zo Server Componentov
 * (Node.js runtime) — nie z "use client" komponentov ani z Edge runtime.
 * Raz publikovaný .md súbor sa NIKDY neupravuje — zmena textu = nová
 * verzia = nový súbor (a nový riadok v legal_documents).
 */
export function readLegalMarkdown(
  documentType: LegalDocumentType,
  version: string
): string {
  return fs.readFileSync(legalContentFilePath(documentType, version), "utf8");
}
