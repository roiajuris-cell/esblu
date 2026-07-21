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
    <main
      className="min-h-screen bg-slate-950 bg-cover bg-center bg-fixed px-4 py-6 sm:px-6 sm:py-10 lg:py-12"
      style={{ backgroundImage: "url('/images/background-dark.png')" }}
    >
      <article className="mx-auto max-w-4xl rounded-3xl border border-white/20 bg-white/95 p-5 shadow-2xl sm:p-8 lg:p-10">
        <header className="border-b border-slate-200 pb-6">
          <Link
            href="/login"
            className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-bold tracking-wide text-blue-700 transition hover:bg-blue-100"
          >
            ESBLU
          </Link>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {title}
          </h1>

          {updatedAt && (
            <p className="mt-3 text-sm text-slate-500">
              Posledná aktualizácia: {updatedAt}
            </p>
          )}
        </header>

        <div className="mt-8 space-y-8 text-base leading-7 text-slate-700">
          {children}
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-6">
          <nav
            aria-label="Právne a kontaktné informácie"
            className="flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5"
          >
            <Link
              href="/ochrana-osobnych-udajov"
              className="text-blue-700 hover:underline"
            >
              Ochrana osobných údajov
            </Link>
            <Link
              href="/podmienky-pouzivania"
              className="text-blue-700 hover:underline"
            >
              Podmienky používania
            </Link>
            <Link href="/kontakt" className="text-blue-700 hover:underline">
              Kontakt
            </Link>
          </nav>

          <Link
            href="/login"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
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
      <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
