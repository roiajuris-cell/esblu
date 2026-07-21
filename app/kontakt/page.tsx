import type { Metadata } from "next";
import {
  LegalSection,
  PublicLegalLayout,
} from "@/app/components/PublicLegalLayout";

export const metadata: Metadata = {
  title: "Kontakt | Esblu",
  description: "Kontaktné informácie služby Esblu.",
};

const emailLinkClass =
  "break-all font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4";

export default function ContactPage() {
  return (
    <PublicLegalLayout title="Kontakt">
      <p>
        Esblu je bezplatná testovacia verzia služby na firemnú evidenciu.
        Prevádzkovateľom je Jaroslav Juriš, Slovenská republika.
      </p>

      <LegalSection title="Všeobecné otázky a podpora">
        <p>
          Napíšte nám na{" "}
          <a href="mailto:info@esblu.com" className={emailLinkClass}>
            info@esblu.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Ochrana osobných údajov">
        <p>
          Žiadosti a otázky týkajúce sa osobných údajov pošlite na{" "}
          <a href="mailto:privacy@esblu.com" className={emailLinkClass}>
            privacy@esblu.com
          </a>
          .
        </p>
      </LegalSection>

      <p className="rounded-2xl bg-slate-100 p-5 text-sm text-slate-600">
        Pri žiadosti o podporu opíšte problém čo najpresnejšie. Do e-mailu
        neposielajte heslo ani iné prihlasovacie údaje.
      </p>
    </PublicLegalLayout>
  );
}
