"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import LanguageSwitcher from "./LanguageSwitcher";

type PublicLegalLayoutProps = {
  titleKey: string;
  updatedAt?: string;
  children: ReactNode;
};

// "use client" Component — používa useLocale() (localStorage-driven Context,
// pozri lib/i18n/LocaleProvider.tsx) namiesto server-side cookie/props, aby
// appka nepotrebovala žiadnu cookie na určenie jazyka pred prvým
// vykreslením (revidované — pôvodne Server Component s `locale` prop z
// getServerLocale()). Volajúca stránka (napr.
// app/podmienky-pouzivania/page.tsx) je Server Component, ktorý iba číta
// nemenný .md obsah zo súborového systému pre všetky 3 jazyky naraz
// (readLegalMarkdownAllLocales) a odovzdá ich ako deti — samotný výber
// správneho jazyka pre nadpis/menu/obsah rieši tento klientsky komponent.
export function PublicLegalLayout({
  titleKey,
  updatedAt,
  children,
}: PublicLegalLayoutProps) {
  const { t } = useLocale();
  const title = t(titleKey);

  return (
    <main className="app-shell-bg min-h-screen px-4 py-6 sm:px-6 sm:py-10 lg:py-12">
      <article className="surface-card mx-auto max-w-4xl p-5 shadow-2xl sm:p-8 lg:p-10">
        <header className="border-b border-subtle pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/login"
              className="inline-flex rounded-full bg-accent-cyan/12 px-4 py-2 text-sm font-bold tracking-wide text-accent-cyan transition hover:bg-accent-cyan/20"
            >
              ESBLU
            </Link>
            <LanguageSwitcher />
          </div>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            {title}
          </h1>

          {updatedAt && (
            <p className="mt-3 text-sm text-muted-esblu">
              {t("legal.updatedAtPrefix")} {updatedAt}
            </p>
          )}
        </header>

        <div className="mt-8 space-y-8 text-base leading-7 text-secondary">
          {children}
        </div>

        <footer className="mt-10 border-t border-subtle pt-6">
          <nav
            aria-label={t("settings.legal.navAriaLabel")}
            className="flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5"
          >
            <Link
              href="/ochrana-osobnych-udajov"
              className="text-accent-cyan hover:underline"
            >
              {t("common.legalLinks.privacy")}
            </Link>
            <Link
              href="/podmienky-pouzivania"
              className="text-accent-cyan hover:underline"
            >
              {t("common.legalLinks.terms")}
            </Link>
            <Link href="/cookies" className="text-accent-cyan hover:underline">
              {t("common.legalLinks.cookies")}
            </Link>
            <Link href="/dpa" className="text-accent-cyan hover:underline">
              {t("common.legalLinks.dpa")}
            </Link>
            <Link
              href="/subprocessors"
              className="text-accent-cyan hover:underline"
            >
              {t("common.legalLinks.subprocessors")}
            </Link>
            <Link href="/kontakt" className="text-accent-cyan hover:underline">
              {t("common.legalLinks.contact")}
            </Link>
          </nav>

          <Link href="/login" className="btn-secondary mt-6 inline-flex px-5 py-3">
            {t("legal.backToLogin")}
          </Link>
        </footer>
      </article>
    </main>
  );
}

type LegalSectionProps = {
  title: string;
  children: ReactNode;
};

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section>
      <h2 className="text-xl font-bold text-primary sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
