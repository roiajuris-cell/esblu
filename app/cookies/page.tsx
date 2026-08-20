import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdownLocalized } from "@/app/components/LegalMarkdownLocalized";
import { readLegalMarkdownAllLocales } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Cookies | Esblu",
  description:
    "Informácie o tom, ako Esblu pristupuje k cookies a podobným technológiám.",
};

// Rendering shell — pozri komentár v app/podmienky-pouzivania/page.tsx.
// Cookies zostáva na verzii 1.0 (pozri legalConfig.cookiePolicyVersion) —
// appka i18n funkciu implementuje bez akejkoľvek novej cookie (jazyk sa
// ukladá do localStorage, pozri lib/i18n/locales.ts), takže právny obsah
// "Esblu nepoužíva žiadne cookies" zostáva pravdivý a nevyžaduje si novú
// verziu tohto dokumentu.
export default function CookiesPage() {
  const markdownByLocale = readLegalMarkdownAllLocales(
    "cookie_policy",
    legalConfig.cookiePolicyVersion
  );

  return (
    <PublicLegalLayout
      titleKey="legal.titles.cookies"
      updatedAt={`15. augusta 2026 (verzia ${legalConfig.cookiePolicyVersion})`}
    >
      <LegalMarkdownLocalized variants={markdownByLocale} />
    </PublicLegalLayout>
  );
}
