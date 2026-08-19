import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { readLegalMarkdown } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { translate } from "@/lib/i18n/translate";

export const metadata: Metadata = {
  title: "Zmluva o spracúvaní osobných údajov (DPA) | Esblu",
  description:
    "Podmienky spracúvania osobných údajov podľa čl. 28 GDPR pre firemných zákazníkov Esblu.",
};

// Rendering shell — právne záväzný text je nemenný súbor
// legal/dpa/<version>.md (pozri lib/legal-content.ts), ktorého SHA-256 je
// uložený v legal_documents.content_hash. Úprava textu = nová verzia (nový
// .md súbor + nová hodnota legalConfig.dpaVersion), nikdy úprava
// existujúceho .md súboru. DE/EN preklad je čisto zobrazovacia vec (pozri
// komentár v app/podmienky-pouzivania/page.tsx).
export default async function DpaPage() {
  const locale = await getServerLocale();
  const markdown = readLegalMarkdown("dpa", legalConfig.dpaVersion, locale);

  return (
    <PublicLegalLayout
      title={translate(locale, "legal.titles.dpa")}
      updatedAt={`15. augusta 2026 (verzia ${legalConfig.dpaVersion})`}
      locale={locale}
    >
      <LegalMarkdown markdown={markdown} />
    </PublicLegalLayout>
  );
}
