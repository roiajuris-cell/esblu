import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { readLegalMarkdown } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Zásady ochrany osobných údajov | Esblu",
  description: "Informácie o spracúvaní osobných údajov v službe Esblu.",
};

// Rendering shell — právne záväzný text je nemenný súbor
// legal/privacy/<version>.md (pozri lib/legal-content.ts), ktorého SHA-256
// je uložený v legal_documents.content_hash. Úprava textu = nová verzia
// (nový .md súbor + nová hodnota legalConfig.privacyPolicyVersion), nikdy
// úprava existujúceho .md súboru.
export default function PrivacyPolicyPage() {
  const markdown = readLegalMarkdown(
    "privacy_policy",
    legalConfig.privacyPolicyVersion
  );

  return (
    <PublicLegalLayout
      title="Zásady ochrany osobných údajov"
      updatedAt={`16. augusta 2026 (verzia ${legalConfig.privacyPolicyVersion})`}
    >
      <LegalMarkdown markdown={markdown} />
    </PublicLegalLayout>
  );
}
