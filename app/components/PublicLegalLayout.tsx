import Link from "next/link";
import type { ReactNode } from "react";
import { translate } from "@/lib/i18n/translate";
import { normalizeLocale, type Locale } from "@/lib/i18n/locales";
import LanguageSwitcher from "./LanguageSwitcher";

type PublicLegalLayoutProps = {
  title: string;
  updatedAt?: string;
  locale?: Locale;
  children: ReactNode;
};

// Server Component — používa translate() priamo (rovnaká čistá funkcia ako
// LocaleProvider na klientovi), locale prijíma ako prop od volajúcej
// stránky (getServerLocale(), pozri app/podmienky-pouzivania/page.tsx a
// pod.). LanguageSwitcher je vnorený Client Component — Next.js App Router
// bežne podporuje kompozíciu client komponentov vnútri server komponentov.
export function PublicLegalLayout({
  title,
  updatedAt,
  locale: localeProp,
  children,
}: PublicLegalLayoutProps) {
  const locale = normalizeLocale(localeProp);
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

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
            aria-label="Právne a kontaktné informácie"
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
