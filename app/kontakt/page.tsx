import type { Metadata } from "next";
import {
  LegalSection,
  PublicLegalLayout,
} from "@/app/components/PublicLegalLayout";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { translate } from "@/lib/i18n/translate";

export const metadata: Metadata = {
  title: "Kontakt | Esblu",
  description: "Kontaktné informácie služby Esblu.",
};

const emailLinkClass =
  "break-all font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4";

export default async function ContactPage() {
  const locale = await getServerLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <PublicLegalLayout title={t("legal.titles.contact")} locale={locale}>
      <p>{t("legal.contactPage.intro")}</p>

      <LegalSection title={t("legal.contactPage.generalTitle")}>
        <p>
          {t("legal.contactPage.generalText")}{" "}
          <a href="mailto:info@esblu.com" className={emailLinkClass}>
            info@esblu.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title={t("legal.contactPage.privacyTitle")}>
        <p>
          {t("legal.contactPage.privacyText")}{" "}
          <a href="mailto:privacy@esblu.com" className={emailLinkClass}>
            privacy@esblu.com
          </a>
          .
        </p>
      </LegalSection>

      <p className="rounded-2xl bg-surface-2 p-5 text-sm text-secondary">
        {t("legal.contactPage.supportNote")}
      </p>
    </PublicLegalLayout>
  );
}
