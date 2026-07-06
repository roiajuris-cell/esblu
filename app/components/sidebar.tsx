import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-72 bg-slate-950 p-6 text-white">
      <h1 className="text-3xl font-bold text-blue-400">Esblu</h1>

      <p className="mt-2 text-sm text-slate-400">
        Firemný majetok pod kontrolou
      </p>

      <nav className="mt-10 space-y-3">
        <Link href="/" className="block rounded-xl px-4 py-3 hover:bg-slate-800">
          📊 Dashboard
        </Link>

        <Link
          href="/vozidla"
          className="block rounded-xl px-4 py-3 hover:bg-slate-800"
        >
          🚗 Vozidlá
        </Link>

        <Link
          href="/stroje"
          className="block rounded-xl px-4 py-3 hover:bg-slate-800"
        >
          🚜 Stroje
        </Link>

        <div className="rounded-xl px-4 py-3 text-slate-400">📦 Sklad</div>
        <div className="rounded-xl px-4 py-3 text-slate-400">🔧 Servisy</div>
        <div className="rounded-xl px-4 py-3 text-slate-400">📅 STK / EK</div>
      </nav>
    </aside>
  );
}