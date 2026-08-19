import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { readLegalMarkdown } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { translate } from "@/lib/i18n/translate";

export const metadata: Metadata = {
  title: "Cookies | Esblu",
  description:
    "Informácie o tom, ako Esblu pristupuje k cookies a podobným technológiám.",
};

// Rendering shell — právne záväzný text je nemenný súbor
// legal/cookies/<version>.md (pozri lib/legal-content.ts), ktorého SHA-256
// je uložený v legal_documents.content_hash. Úprava textu = nová verzia
// (nový .md súbor + nová hodnota legalConfig.cookiePolicyVersion), nikdy
// úprava existujúceho .md súboru. DE/EN preklad je čisto zobrazovacia vec
// (pozri komentár v app/podmienky-pouzivania/page.tsx).
export default async function CookiesPage() {
  const locale = await getServerLocale();
  const markdown = readLegalMarkdown(
    "cookie_policy",
    legalConfig.cookiePolicyVersion,
    locale
  );

  return (
    <PublicLegalLayout
      title={translate(locale, "legal.titles.cookies")}
      updatedAt={`19. augusta 2026 (verzia ${legalConfig.cookiePolicyVersion})`}
      locale={locale}
    >
      <LegalMarkdown markdown={markdown} />
    </PublicLegalLayout>
  );
}
