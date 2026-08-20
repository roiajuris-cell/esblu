import type { Metadata } from "next";
import { ContactPageClient } from "./ContactPageClient";

export const metadata: Metadata = {
  title: "Kontakt | Esblu",
  description: "Kontaktné informácie služby Esblu.",
};

export default function ContactPage() {
  return <ContactPageClient />;
}
