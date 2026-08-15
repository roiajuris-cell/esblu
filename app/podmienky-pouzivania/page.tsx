import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { readLegalMarkdown } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Podmienky používania Esblu",
  description: "Podmienky používania bezplatnej testovacej verzie Esblu.",
};

// Táto stránka je iba rendering shell — právne záväzný text je nemenný
// súbor legal/terms/<version>.md (pozri lib/legal-content.ts), ktorého
// SHA-256 je uložený v legal_documents.content_hash. Úprava textu sa robí
// VÝHRADNE pridaním novej verzie (nový .md súbor + nová hodnota
// legalConfig.termsVersion), nikdy úpravou existujúceho .md súboru.
export default function TermsPage() {
  const markdown = readLegalMarkdown("terms", legalConfig.termsVersion);

  return (
    <PublicLegalLayout
      title="Podmienky používania Esblu"
      updatedAt={`21. júla 2026 (verzia ${legalConfig.termsVersion})`}
    >
      <LegalMarkdown markdown={markdown} />
    </PublicLegalLayout>
  );
}
