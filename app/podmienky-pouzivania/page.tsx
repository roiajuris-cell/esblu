import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { readLegalMarkdown } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { translate } from "@/lib/i18n/translate";

export const metadata: Metadata = {
  title: "Podmienky používania Esblu",
  description: "Podmienky používania bezplatnej testovacej verzie Esblu.",
};

// Táto stránka je iba rendering shell — právne záväzný text je nemenný
// súbor legal/terms/<version>.md (pozri lib/legal-content.ts), ktorého
// SHA-256 je uložený v legal_documents.content_hash. Úprava textu sa robí
// VÝHRADNE pridaním novej verzie (nový .md súbor + nová hodnota
// legalConfig.termsVersion), nikdy úpravou existujúceho .md súboru.
// DE/EN preklad (legal/terms/<version>.de.md, .en.md) je čisto zobrazovacia
// vec — nemení versioned/immutable legal acceptance model (ten eviduje iba
// document_type + version, nie locale, pozri lib/legal-content.ts).
export default async function TermsPage() {
  const locale = await getServerLocale();
  const markdown = readLegalMarkdown("terms", legalConfig.termsVersion, locale);

  return (
    <PublicLegalLayout
      title={translate(locale, "legal.titles.terms")}
      updatedAt={`21. júla 2026 (verzia ${legalConfig.termsVersion})`}
      locale={locale}
    >
      <LegalMarkdown markdown={markdown} />
    </PublicLegalLayout>
  );
}
