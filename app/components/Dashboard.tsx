"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Dashboard() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("ESBLU");

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    loadData(session.user.id);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function loadData(currentUserId: string) {
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("user_id", currentUserId);

    const { data: machineData } = await supabase
      .from("machines")
      .select("*")
      .eq("user_id", currentUserId);

    const { data: itemData } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", currentUserId);

    const { data: settingsData } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", currentUserId)
      .limit(1)
      .single();

    setVehicles(vehicleData || []);
    setMachines(machineData || []);
    setItems(itemData || []);

    if (settingsData?.company_name) {
      setCompanyName(settingsData.company_name);
    }
  }

  const modules = [
    {
      title: "Vozidlá",
      subtitle: `${vehicles.length} uložených vozidiel`,
      href: "/vozidla",
      image: <VanImage />,
    },
    {
      title: "Stroje",
      subtitle: `${machines.length} uložených strojov`,
      href: "/stroje",
      image: <ExcavatorImage />,
    },
    {
      title: "Sklad",
      subtitle: `${items.length} skladových položiek`,
      href: "/sklad",
      image: <WarehouseImage />,
    },
    {
      title: "Nastavenia",
      subtitle: "Nastavenia aplikácie",
      href: "/nastavenia",
      image: <GearImage />,
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_35%),linear-gradient(120deg,rgba(255,255,255,0.95),rgba(241,245,249,0.9))]" />
      <div className="absolute bottom-0 left-72 h-72 w-[520px] opacity-20">
        <ConstructionBackground />
      </div>
      <div className="absolute right-0 top-0 h-full w-[55%] opacity-30">
        <FiberBackground />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="m-4 flex w-72 flex-col rounded-3xl bg-white/90 p-7 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <LogoMark />
            <h1 className="text-4xl font-black tracking-tight text-slate-950">
              {companyName}
            </h1>
          </div>

          <nav className="mt-12 space-y-3">
            <NavItem active href="/" label="Menu" icon={<MenuIcon />} />
            <NavItem href="/vozidla" label="Vozidlá" icon={<CarIcon />} />
            <NavItem href="/stroje" label="Stroje" icon={<MachineIcon />} />
            <NavItem href="/sklad" label="Sklad" icon={<WarehouseIcon />} />
            <NavItem
              href="/nastavenia"
              label="Nastavenia"
              icon={<SettingsIcon />}
            />
          </nav>

          <button
            onClick={logout}
            className="mt-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <LogoutIcon />
            Odhlásiť sa
          </button>
        </aside>

        <section className="flex-1 px-10 py-16">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-5xl font-black tracking-tight text-slate-950">
                Menu
              </h2>
              <p className="mt-3 text-xl text-slate-600">
                Prehľad firemnej evidencie, techniky a skladu.
              </p>
            </div>

            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-lg font-bold shadow">
              JJ
            </div>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-4">
            {modules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="group rounded-3xl bg-white/90 p-8 text-center shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="mx-auto flex h-40 items-center justify-center">
                  {module.image}
                </div>

                <h3 className="mt-7 text-3xl font-black text-slate-950">
                  {module.title}
                </h3>

                <p className="mt-3 min-h-12 text-lg leading-relaxed text-slate-500">
                  {module.subtitle}
                </p>

                <p className="mt-6 font-semibold text-blue-600 opacity-0 transition group-hover:opacity-100">
                  Otvoriť →
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function NavItem({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-4 rounded-2xl px-4 py-4 text-lg font-semibold transition ${
        active
          ? "bg-blue-50 text-blue-600 shadow-sm"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <span className={active ? "text-blue-600" : "text-slate-500"}>{icon}</span>
      {label}
    </Link>
  );
}

function LogoMark() {
  return (
    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600">
      <div className="h-7 w-7 rotate-45 rounded-md border-4 border-white" />
    </div>
  );
}

function IconBase({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function MenuIcon() {
  return (
    <IconBase>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </IconBase>
  );
}

function CarIcon() {
  return (
    <IconBase>
      <path d="M5 17h14" />
      <path d="M6 17v-5l2-5h8l2 5v5" />
      <circle cx="8" cy="17" r="2" />
      <circle cx="16" cy="17" r="2" />
    </IconBase>
  );
}

function MachineIcon() {
  return (
    <IconBase>
      <path d="M4 17h13" />
      <path d="M8 17V7l4-2 3 5" />
      <path d="M15 10l4 3-2 4" />
      <circle cx="6" cy="17" r="2" />
      <circle cx="14" cy="17" r="2" />
    </IconBase>
  );
}

function WarehouseIcon() {
  return (
    <IconBase>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </IconBase>
  );
}

function SettingsIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a8 8 0 0 0 .1-6l-2.1-.5-1-2-2 .7a8 8 0 0 0-5 0l-2-.7-1 2-2.1.5a8 8 0 0 0 .1 6l2.1.5 1 2 2-.7a8 8 0 0 0 5 0l2 .7 1-2Z" />
    </IconBase>
  );
}

function LogoutIcon() {
  return (
    <IconBase>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </IconBase>
  );
}

function VanImage() {
  return (
    <svg viewBox="0 0 220 140" className="h-36 w-52">
      <ellipse cx="110" cy="112" rx="80" ry="12" fill="#e2e8f0" />
      <rect x="38" y="48" width="130" height="52" rx="10" fill="#f8fafc" stroke="#94a3b8" strokeWidth="3" />
      <path d="M73 48h55l18 22v30H73z" fill="#e2e8f0" />
      <rect x="82" y="55" width="35" height="21" rx="3" fill="#cbd5e1" />
      <rect x="124" y="55" width="23" height="21" rx="3" fill="#cbd5e1" />
      <circle cx="72" cy="102" r="12" fill="#334155" />
      <circle cx="142" cy="102" r="12" fill="#334155" />
      <circle cx="72" cy="102" r="5" fill="#cbd5e1" />
      <circle cx="142" cy="102" r="5" fill="#cbd5e1" />
    </svg>
  );
}

function ExcavatorImage() {
  return (
    <svg viewBox="0 0 220 140" className="h-36 w-52">
      <ellipse cx="115" cy="115" rx="78" ry="12" fill="#e2e8f0" />
      <rect x="70" y="75" width="70" height="28" rx="6" fill="#fbbf24" stroke="#92400e" strokeWidth="2" />
      <rect x="112" y="52" width="36" height="34" rx="5" fill="#475569" />
      <rect x="118" y="58" width="19" height="16" rx="2" fill="#cbd5e1" />
      <path d="M83 75 58 48" stroke="#f59e0b" strokeWidth="10" strokeLinecap="round" />
      <path d="M58 48 39 78" stroke="#f59e0b" strokeWidth="10" strokeLinecap="round" />
      <path d="M39 78l18 12" stroke="#334155" strokeWidth="8" strokeLinecap="round" />
      <rect x="56" y="101" width="105" height="15" rx="8" fill="#334155" />
      <circle cx="77" cy="108" r="5" fill="#94a3b8" />
      <circle cx="105" cy="108" r="5" fill="#94a3b8" />
      <circle cx="134" cy="108" r="5" fill="#94a3b8" />
    </svg>
  );
}

function WarehouseImage() {
  return (
    <svg viewBox="0 0 220 140" className="h-36 w-52">
      <ellipse cx="110" cy="115" rx="78" ry="12" fill="#e2e8f0" />
      <rect x="55" y="38" width="100" height="72" fill="#334155" rx="4" />
      <rect x="65" y="48" width="28" height="22" fill="#cbd5e1" />
      <rect x="105" y="48" width="28" height="22" fill="#cbd5e1" />
      <rect x="65" y="78" width="28" height="22" fill="#cbd5e1" />
      <rect x="105" y="78" width="28" height="22" fill="#cbd5e1" />
      <rect x="138" y="78" width="40" height="32" fill="#d97706" rx="3" />
      <rect x="145" y="54" width="36" height="28" fill="#f59e0b" rx="3" />
    </svg>
  );
}

function GearImage() {
  return (
    <svg viewBox="0 0 220 140" className="h-36 w-52">
      <ellipse cx="110" cy="112" rx="70" ry="12" fill="#e2e8f0" />
      <circle cx="110" cy="72" r="36" fill="#475569" />
      <circle cx="110" cy="72" r="16" fill="#f8fafc" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
        <rect
          key={r}
          x="104"
          y="20"
          width="12"
          height="24"
          rx="3"
          fill="#475569"
          transform={`rotate(${r} 110 72)`}
        />
      ))}
    </svg>
  );
}

function ConstructionBackground() {
  return (
    <svg viewBox="0 0 600 300" className="h-full w-full">
      <path d="M40 270h500" stroke="#64748b" strokeWidth="4" />
      <rect x="110" y="150" width="180" height="120" fill="#94a3b8" />
      <path d="M80 120h250" stroke="#64748b" strokeWidth="5" />
      <path d="M160 120v150" stroke="#64748b" strokeWidth="5" />
      <path d="M160 120l-40 150M160 120l45 150" stroke="#64748b" strokeWidth="3" />
      <rect x="320" y="90" width="170" height="12" fill="#64748b" />
    </svg>
  );
}

function FiberBackground() {
  return (
    <svg viewBox="0 0 800 900" className="h-full w-full">
      {Array.from({ length: 26 }).map((_, i) => (
        <path
          key={i}
          d={`M780 ${60 + i * 28} C 520 ${160 + i * 8}, 480 ${
            430 + i * 4
          }, 120 ${850 - i * 10}`}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          opacity="0.18"
        />
      ))}
    </svg>
  );
}