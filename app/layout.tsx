import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LegalAcceptanceGate from "./components/LegalAcceptanceGate";
import CompanyDpaGate from "./components/CompanyDpaGate";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { getServerLocale } from "@/lib/i18n/server-locale";

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
  description: "Firemná evidencia vozidiel, strojov a skladu.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Jazyk sa určuje výhradne zo server-side cookie (bez zmeny URL/routingu
  // — pozri lib/i18n/locales.ts pre zdôvodnenie architektúry). html lang sa
  // nastavuje už tu, aby prvé vykreslenie na serveri aj klientovi bolo vždy
  // zhodné (žiadny hydration mismatch, žiadny FOUC v zlom jazyku).
  const locale = await getServerLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider initialLocale={locale}>
          <LegalAcceptanceGate>
            <CompanyDpaGate>{children}</CompanyDpaGate>
          </LegalAcceptanceGate>
        </LocaleProvider>
      </body>
    </html>
  );
}