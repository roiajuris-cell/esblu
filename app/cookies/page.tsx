import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { readLegalMarkdown } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Cookies | Esblu",
  description:
    "Informácie o tom, ako Esblu pristupuje k cookies a podobným technológiám.",
};

// Rendering shell — právne záväzný text je nemenný súbor
// legal/cookies/<version>.md (pozri lib/legal-content.ts), ktorého SHA-256
// je uložený v legal_documents.content_hash. Úprava textu = nová verzia
// (nový .md súbor + nová hodnota legalConfig.cookiePolicyVersion), nikdy
// úprava existujúceho .md súboru.
export default function CookiesPage() {
  const markdown = readLegalMarkdown(
    "cookie_policy",
    legalConfig.cookiePolicyVersion
  );

  return (
    <PublicLegalLayout
      title="Cookies"
      updatedAt={`15. augusta 2026 (verzia ${legalConfig.cookiePolicyVersion})`}
    >
      <LegalMarkdown markdown={markdown} />
    </PublicLegalLayout>
  );
}
