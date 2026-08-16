import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

export type ModuleAccent = "cyan" | "blue" | "orange" | "teal";

const ACCENT_STYLES: Record<
  ModuleAccent,
  { icon: string; iconGlow: string; ring: string; bar: string; stat: string }
> = {
  cyan: {
    icon: "bg-accent-cyan/14 text-accent-cyan",
    iconGlow: "icon-glow-cyan",
    ring: "group-hover:shadow-[0_0_0_1px_rgba(34,211,238,0.3)]",
    bar: "bg-gradient-to-r from-accent-cyan to-transparent",
    stat: "text-accent-cyan",
  },
  blue: {
    icon: "bg-accent-blue/14 text-accent-blue",
    iconGlow: "icon-glow-blue",
    ring: "group-hover:shadow-[0_0_0_1px_rgba(59,130,246,0.3)]",
    bar: "bg-gradient-to-r from-accent-blue to-transparent",
    stat: "text-accent-blue",
  },
  orange: {
    icon: "bg-accent-orange/14 text-accent-orange",
    iconGlow: "icon-glow-orange",
    ring: "group-hover:shadow-[0_0_0_1px_rgba(245,158,11,0.3)]",
    bar: "bg-gradient-to-r from-accent-orange to-transparent",
    stat: "text-accent-orange",
  },
  teal: {
    icon: "bg-accent-teal/14 text-accent-teal",
    iconGlow: "icon-glow-teal",
    ring: "group-hover:shadow-[0_0_0_1px_rgba(45,212,191,0.3)]",
    bar: "bg-gradient-to-r from-accent-teal to-transparent",
    stat: "text-accent-teal",
  },
};

/**
 * ModuleCard — zdieľaná dlaždica pre hlavné moduly appky (Dashboard grid).
 * Čisto vizuálna vrstva (redesign): nemení href/routy/logiku, iba
 * prezentáciu. Accent farba je iba vizuálne rozlíšenie modulu (cyan/blue/
 * orange/teal), nemá vplyv na dáta.
 *
 * KOREKCIA v3 (podľa spätnej väzby, že 4 karty vyzerali "skoro identicky
 * modré"): glow je teraz VÝHRADNE lokálny za ikonovým chipom (.icon-glow-*),
 * nie na celej karte — karta samotná zostáva tmavá/neutrálna a farebný
 * charakter modulu nesie ikona + veľké farebné číslo. Hierarchia
 * title > číslo/stav > sekundárny text je zvýraznená: menší/tlmenejší
 * label, väčšie a tučnejšie číslo, drobný muted subtitle.
 */
export default function ModuleCard({
  href,
  title,
  subtitle,
  stat,
  image,
  icon,
  accent = "blue",
  className = "",
}: {
  href: string;
  title: string;
  subtitle: string;
  stat?: string;
  image?: string;
  icon?: ReactNode;
  accent?: ModuleAccent;
  className?: string;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <Link
      href={href}
      className={`surface-card surface-card-hover group relative flex min-w-0 flex-col overflow-hidden p-3.5 transition sm:p-4 ${styles.ring} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[2px] ${styles.bar} opacity-80`}
      />

      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:h-16 sm:w-16 ${styles.icon} ${styles.iconGlow}`}
      >
        {icon ??
          (image ? (
            <Image
              src={image}
              width={40}
              height={40}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 object-contain sm:h-10 sm:w-10"
            />
          ) : null)}
      </div>

      {stat ? (
        <>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-esblu">
            {title}
          </p>
          <p className={`mt-0.5 text-3xl font-black leading-none tracking-tight sm:text-4xl ${styles.stat}`}>
            {stat}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-esblu">{subtitle}</p>
        </>
      ) : (
        <>
          <h3 className="mt-2 text-base font-bold text-primary sm:text-lg">
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-snug text-muted-esblu">{subtitle}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent-cyan opacity-0 transition group-hover:opacity-100">
            Otvoriť
            <span aria-hidden="true">→</span>
          </span>
        </>
      )}
    </Link>
  );
}
