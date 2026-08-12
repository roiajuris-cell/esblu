import Link from "next/link";

export default function BackLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={className} style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <Link
        href={href}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/90 px-4 py-2.5 text-sm font-bold text-slate-800 shadow-lg backdrop-blur-sm transition hover:scale-105 active:scale-95"
      >
        <span aria-hidden="true" className="text-base leading-none">
          ←
        </span>
        {label}
      </Link>
    </div>
  );
}
