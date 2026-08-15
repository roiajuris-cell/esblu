import type { Metadata } from "next";
import { PublicLegalLayout } from "@/app/components/PublicLegalLayout";
import { LegalMarkdown } from "@/app/components/LegalMarkdown";
import { readLegalMarkdown } from "@/lib/legal-content";
import { legalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Zmluva o spracúvaní osobných údajov (DPA) | Esblu",
  description:
    "Podmienky spracúvania osobných údajov podľa čl. 28 GDPR pre firemných zákazníkov Esblu.",
};

// Rendering shell — právne záväzný text je nemenný súbor
// legal/dpa/<version>.md (pozri lib/legal-content.ts), ktorého SHA-256 je
// uložený v legal_documents.content_hash. Úprava textu = nová verzia (nový
// .md súbor + nová hodnota legalConfig.dpaVersion), nikdy úprava
// existujúceho .md súboru.
export default function DpaPage() {
  const markdown = readLegalMarkdown("dpa", legalConfig.dpaVersion);

  return (
    <PublicLegalLayout
      title="Zmluva o spracúvaní osobných údajov (DPA)"
      updatedAt={`15. augusta 2026 (verzia ${legalConfig.dpaVersion})`}
    >
      <LegalMarkdown markdown={markdown} />
    </PublicLegalLayout>
  );
}
