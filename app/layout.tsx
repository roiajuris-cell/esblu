import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LegalAcceptanceGate from "./components/LegalAcceptanceGate";
import CompanyDpaGate from "./components/CompanyDpaGate";
import FloatingChatWidget from "./components/chat/FloatingChatWidget";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ESBLU",
  description:
    "Firemná evidencia dokumentov, vozidiel, strojov a skladu na jednom mieste.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Jazyk sa NEURČUJE zo server-side cookie (revidované — appka zámerne
  // nezavádza žiadnu novú cookie, pozri lib/i18n/locales.ts pre plné
  // zdôvodnenie). SSR vždy vykresľuje DEFAULT_LOCALE (sk); LocaleProvider
  // po mountnutí na klientovi prečíta localStorage a <html lang> aj celý
  // preložený obsah prepne na uloženú preferenciu (vedomý kompromis — krátky
  // FOUC v SK pri tvrdom reloade pre DE/EN používateľa).
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>
          <LegalAcceptanceGate>
            <CompanyDpaGate>
              {children}
              {/* Globálny plávajúci chat — jediné miesto v appke, ktoré
                  obaľuje VŠETKY moduly (tie samotné nemajú spoločný
                  sidebar/layout, pozri audit v FloatingChatWidget.tsx).
                  Renderuje sa AŽ za {children}/vnútri CompanyDpaGate, takže
                  jeho z-index (70) je zámerne pod LegalAcceptanceGate (100)
                  aj CompanyDpaGate (90) — nedostupný gate vždy prekryje
                  bublinku, presne ako medzi sebou tieto dva gate. */}
              <FloatingChatWidget />
            </CompanyDpaGate>
          </LegalAcceptanceGate>
        </LocaleProvider>
      </body>
    </html>
  );
}