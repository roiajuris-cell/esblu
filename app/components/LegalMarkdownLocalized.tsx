"use client";

import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/locales";

// Vyberie správnu jazykovú mutáciu nemenného .md obsahu na klientovi podľa
// useLocale() (localStorage) — appka nepoužíva cookie na server-side výber,
// pozri komentár v app/components/PublicLegalLayout.tsx a
// lib/legal-content.ts#readLegalMarkdownAllLocales. `variants` obsahuje
// všetky 3 jazyky naraz (prečítané server-side v samotnej stránke), takže
// tento prepínač nevyžaduje žiadny ďalší sieťový/FS request.
export function LegalMarkdownLocalized({
  variants,
}: {
  variants: Record<Locale, string>;
}) {
  const { locale } = useLocale();

  return <LegalMarkdown markdown={variants[locale]} />;
}
