"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SUPPORTED_LOCALES, LOCALE_SHORT_LABELS, LOCALE_LABELS } from "@/lib/i18n/locales";

// Jazykový prepínač (SK/DE/EN) — jedna zdieľaná implementácia použitá na
// všetkých miestach, kde ho zadanie vyžaduje (landing, login/registrácia,
// invite flow, právny gate, aj vo vnútri appky). Žiadna zmena URL/routingu
// — iba LocaleProvider.setLocale() (cookie + best-effort settings.locale).
export default function LanguageSwitcher({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const { locale, setLocale } = useLocale();

  const baseBtn =
    variant === "dark"
      ? "rounded-lg px-2.5 py-1.5 text-xs font-bold transition"
      : "rounded-lg px-2.5 py-1.5 text-xs font-bold transition";
  const active =
    variant === "dark"
      ? "bg-accent-cyan text-[#051221]"
      : "bg-blue-600 text-white";
  const inactive =
    variant === "dark"
      ? "text-slate-300 hover:text-white"
      : "text-secondary hover:text-primary";

  return (
    <div
      role="group"
      aria-label={LOCALE_LABELS[locale]}
      className={`inline-flex items-center gap-1 rounded-xl border border-subtle bg-surface-1/60 p-1 ${className}`}
    >
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          aria-label={LOCALE_LABELS[code]}
          className={`${baseBtn} ${locale === code ? active : inactive}`}
        >
          {LOCALE_SHORT_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
