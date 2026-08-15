import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LegalAcceptanceGate from "./components/LegalAcceptanceGate";
import CompanyDpaGate from "./components/CompanyDpaGate";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LegalAcceptanceGate>
          <CompanyDpaGate>{children}</CompanyDpaGate>
        </LegalAcceptanceGate>
      </body>
    </html>
  );
}