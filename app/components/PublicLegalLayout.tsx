import Link from "next/link";
import type { ReactNode } from "react";

type PublicLegalLayoutProps = {
  title: string;
  updatedAt?: string;
  children: ReactNode;
};

export function PublicLegalLayout({
  title,
  updatedAt,
  children,
}: PublicLegalLayoutProps) {
  return (
    <main className="app-shell-bg min-h-screen px-4 py-6 sm:px-6 sm:py-10 lg:py-12">
      <article className="surface-card mx-auto max-w-4xl p-5 shadow-2xl sm:p-8 lg:p-10">
        <header className="border-b border-subtle pb-6">
          <Link
            href="/login"
            className="inline-flex rounded-full bg-accent-cyan/12 px-4 py-2 text-sm font-bold tracking-wide text-accent-cyan transition hover:bg-accent-cyan/20"
          >
            ESBLU
          </Link>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            {title}
          </h1>

          {updatedAt && (
            <p className="mt-3 text-sm text-muted-esblu">
              Posledná aktualizácia: {updatedAt}
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
              Ochrana osobných údajov
            </Link>
            <Link
              href="/podmienky-pouzivania"
              className="text-accent-cyan hover:underline"
            >
              Podmienky používania
            </Link>
            <Link href="/cookies" className="text-accent-cyan hover:underline">
              Cookies
            </Link>
            <Link href="/dpa" className="text-accent-cyan hover:underline">
              DPA (spracúvanie pre firmy)
            </Link>
            <Link
              href="/subprocessors"
              className="text-accent-cyan hover:underline"
            >
              Sprostredkovatelia
            </Link>
            <Link href="/kontakt" className="text-accent-cyan hover:underline">
              Kontakt
            </Link>
          </nav>

          <Link href="/login" className="btn-secondary mt-6 inline-flex px-5 py-3">
            Späť na prihlásenie
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
