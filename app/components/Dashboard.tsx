"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image"
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return "Dobré ráno ☀️";
  if (hour >= 12 && hour < 18) return "Dobrý deň 👋";
  if (hour >= 18 && hour < 22) return "Dobrý večer 🌙";

  return "Dobrú noc 🌜";
}


export default function Dashboard() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("ESBLU");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [search, setSearch] = useState("");
  const greeting = getGreeting();
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
      .select("company_name, logo_path")
      .eq("user_id", currentUserId)
      .limit(1)
      .single();

    setVehicles(vehicleData || []);
    setMachines(machineData || []);
    setItems(itemData || []);

    if (settingsData?.company_name) {
      setCompanyName(settingsData.company_name);
    }
    if (settingsData?.logo_path) {
  const { data: logoData } = supabase.storage
    .from("company-logos")
    .getPublicUrl(settingsData.logo_path);

  setCompanyLogoUrl(logoData.publicUrl);
} else {
  setCompanyLogoUrl("");
}
  }

  function createAlerts() {
    const today = new Date();
    const next30Days = new Date();
    next30Days.setDate(today.getDate() + 30);

    const result: any[] = [];

    vehicles.forEach((car) => {
      checkDate(result, car, "STK", car.stk, today, next30Days);
      checkDate(result, car, "EK", car.ek, today, next30Days);
    });

    return result;
  }

  function checkDate(
    result: any[],
    car: any,
    type: string,
    value: string | null,
    today: Date,
    next30Days: Date
  ) {
    if (!value) return;

    const date = new Date(value);
    const diffDays = Math.ceil(
      (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    const name = `${car.znacka || ""} ${car.model || ""}`.trim();
    const spz = car.spz || "bez ŠPZ";

    if (date < today) {
      result.push({
        level: "red",
        text: `${type} po termíne: ${name || "Vozidlo"} (${spz})`,
      });
    } else if (date <= next30Days) {
      result.push({
        level: "orange",
        text: `${type} končí o ${diffDays} dní: ${name || "Vozidlo"} (${spz})`,
      });
    }
  }

  const alerts = createAlerts();
  const query = search.toLowerCase().trim();

  const searchResults = query
    ? [
        ...vehicles
          .filter((v) =>
            `${v.znacka} ${v.model} ${v.spz} ${v.vin}`
              .toLowerCase()
              .includes(query)
          )
          .map((v) => ({
            type: "Vozidlo",
            title: `${v.znacka || ""} ${v.model || ""}`.trim() || "Vozidlo",
            subtitle: `${v.spz || "bez ŠPZ"} | ${v.vin || "bez VIN"}`,
            href: `/vozidla/${v.id}`,
          })),

        ...machines
          .filter((m) =>
            `${m.name} ${m.category} ${m.manufacturer} ${m.model} ${m.serial_number}`
              .toLowerCase()
              .includes(query)
          )
          .map((m) => ({
            type: "Stroj",
            title: m.name || "Bez názvu",
            subtitle: `${m.category || "bez kategórie"} | ${
              m.serial_number || "bez sériového čísla"
            }`,
            href: `/stroje/${m.id}`,
          })),

        ...items
          .filter((i) =>
            `${i.name} ${i.category} ${i.location} ${i.notes}`
              .toLowerCase()
              .includes(query)
          )
          .map((i) => ({
            type: "Sklad",
            title: i.name || "Bez názvu",
            subtitle: `${i.quantity || 0} ${i.unit || ""} | ${
              i.location || "bez umiestnenia"
            }`,
            href: `/sklad/${i.id}`,
          })),
      ]
    : [];

  const modules = [
  {
    title: "AI Evidencia",
    subtitle: "Inteligentné spracovanie dokumentov",
    href: "/ai-evidencia",
    image: "/images/ai-evidencia.png",
  },
  {
    title: "Vozidlá",
    subtitle: `${vehicles.length} uložených vozidiel`,
    href: "/vozidla",
    image: "/images/van.png",
  },
  {
    title: "Stroje",
      subtitle: `${machines.length} uložených strojov`,
      href: "/stroje",
      image: "/images/excavator.png",
    },
    {
      title: "Sklad",
      subtitle: `${items.length} skladových položiek`,
      href: "/sklad",
      image: "/images/warehouse.png",
    },
    {
      title: "Nastavenia",
      subtitle: "Nastavenia aplikácie",
      href: "/nastavenia",
      image: "/images/settings.png",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.65),rgba(239,246,255,0.45))]" />
      <div
   className="absolute inset-0 bg-cover bg-center bg-no-repeat"
  style={{
    backgroundImage: "url('/images/background-dark.png')",
  }}
/>

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <aside className="hidden lg:flex m-4 w-80 flex-col rounded-3xl bg-white/90 px-10 py-7 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 shadow">
              <div className="h-7 w-7 rotate-45 rounded-md border-4 border-white" />
            </div>

            <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-lg">
              {companyName}
            </h1>
          </div>

          <nav className="mt-12 space-y-3">
            <SideLink active href="/" label="Menu" image="/images/van.png" />
            <SideLink href="/vozidla" label="Vozidlá" image="/images/van.png" />
            <SideLink href="/stroje" label="Stroje" image="/images/excavator.png" />
            <SideLink href="/sklad" label="Sklad" image="/images/warehouse.png" />
            <SideLink href="/nastavenia" label="Nastavenia" image="/images/settings.png" />
          </nav>

          <button
            onClick={logout}
            className="mt-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <LogoutIcon />
            Odhlásiť sa
          </button>
        </aside>

        <section className="w-full flex-1 px-4 pb-24 pt-6 lg:px-10 lg:py-16">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white/80 drop-shadow lg:text-base">
  <div className="flex items-center gap-3">
  {companyLogoUrl ? (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white shadow">
      <img
        src={companyLogoUrl}
        alt={`Logo ${companyName}`}
        className="h-full w-full object-contain"
      />
    </div>
  ) : (
    <span className="text-2xl">👤</span>
  )}

  <p className="text-sm font-semibold text-white/80 drop-shadow-lg lg:text-base">
    {companyName}
  </p>
</div>
</p>

<h2 className="mt-1 text-3xl font-black tracking-tight text-white drop-shadow-lg lg:text-5xl">
  {greeting}
</h2>
            </div>
            <Link
  href="/nastavenia"
  aria-label="Otvoriť nastavenia"
  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/85 text-2xl font-black text-slate-800 shadow-lg backdrop-blur-sm transition hover:scale-105"
>
  ☰
</Link>

          
          </div>

          <div className="mt-10 rounded-3xl bg-white/90 p-6 shadow-lg backdrop-blur">
            <div className="flex items-center gap-4">
              <SearchIcon />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hľadať vozidlo, stroj alebo skladovú položku..."
                className="w-full bg-transparent text-lg outline-none placeholder:text-slate-400"
              />
            </div>

            {query && (
              <div className="mt-5 space-y-3">
                {searchResults.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-slate-500">
                    Nič sa nenašlo.
                  </p>
                ) : (
                  searchResults.map((result, index) => (
                    <Link
                      key={index}
                      href={result.href}
                      className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-white hover:shadow"
                    >
                      <p className="text-sm font-bold uppercase tracking-wide text-blue-600">
                        {result.type}
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {result.title}
                      </p>
                      <p className="text-sm text-slate-500">{result.subtitle}</p>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:mt-14 lg:grid-cols-4 lg:gap-8">
            {modules
  .filter((module) => module.title !== "Nastavenia")
  .map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className={`group min-w-0 rounded-2xl bg-white/45 border border-white/20 p-2 text-center shadow-lg backdrop-blur-lg transition duration-300 hover:scale-105 ${
  module.title === "Nastavenia" ? "col-span-2 h-32" : "h-44"
}`}
              >
                <div className="mx-auto flex h-24 items-center justify-center transition group-hover:scale-105 lg:h-32">
  <Image
  src={module.image}
  width={220}
  height={150}
  alt={module.title}
  className={
    module.title === "AI Evidencia"
      ? "h-32 w-40 scale-125 object-contain"
      : module.title === "Stroje"
      ? "h-32 w-40 scale-125 object-contain"
      : module.title === "Sklad"
      ? "h-32 w-40 scale-125 object-contain"
      : "h-24 w-32 object-contain sm:h-28 sm:w-40 lg:h-36 lg:w-48"
  }
/>
</div>
                <h3 className="mt-2 text-base font-bold text-slate-900 lg:mt-5 lg:text-3xl">
                  {module.title}
                </h3>

                <p className="mt-1 min-h-8 text-sm leading-snug text-slate-800">
                  {module.subtitle}
                </p>

                <p className="mt-6 font-semibold text-blue-600 opacity-0 transition group-hover:opacity-100">
                  Otvoriť →
                </p>
              </Link>
            ))}
          </div>

          <div className="mt-10 rounded-3xl bg-white/45 border border-white/20 p-8 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-black text-slate-950">
                  Upozornenia STK / EK
                </h3>
                <p className="mt-2 text-slate-700">
                  Automatická kontrola platnosti technických a emisných kontrol.
                </p>
              </div>

              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black ${
                  alerts.length > 0
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {alerts.length}
              </div>
            </div>

            {alerts.length === 0 ? (
              <div className="mt-6 rounded-2xl bg-green-50 p-5 text-green-800">
                Momentálne nemáte žiadne upozornenia na STK ani EK.
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {alerts.map((alert, index) => (
                  <div
                    key={index}
                    className={`rounded-2xl p-5 font-semibold ${
                      alert.level === "red"
                        ? "bg-red-100 text-red-800"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {alert.level === "red" ? "●" : "●"} {alert.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        
         <button
  onClick={logout}
  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/90 px-4 py-4 text-base font-bold text-red-600 shadow-lg backdrop-blur lg:hidden"
>
  🚪 Odhlásiť sa
</button>
      </div>
    </main>
  );
}

function SideLink({
  href,
  label,
  image,
  active = false,
}: {
  href: string;
  label: string;
  image: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-4 rounded-2xl px-4 py-3 text-lg font-semibold transition ${
        active
          ? "bg-blue-50 text-blue-600 shadow-sm"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
        <Image
          src={image}
          alt={label}
          width={34}
          height={34}
          className="h-8 w-8 object-contain"
        />
      </div>

      {label}
    </Link>
  );
}

function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

function SearchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function VanImage() {
  return (
    <svg viewBox="0 0 260 170" className="h-40 w-56">
      <ellipse cx="130" cy="142" rx="92" ry="13" fill="#dbe4ef" />
      <rect x="42" y="68" width="145" height="52" rx="8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="3" />
      <path d="M78 68h77l28 28v24H78z" fill="#eef2f7" />
      <path d="M158 68l27 28h-27z" fill="#cbd5e1" />
      <rect x="88" y="77" width="42" height="24" rx="3" fill="#cbd5e1" />
      <rect x="137" y="77" width="28" height="24" rx="3" fill="#cbd5e1" />
      <rect x="48" y="105" width="140" height="14" rx="4" fill="#e2e8f0" />
      <rect x="52" y="118" width="136" height="6" rx="3" fill="#64748b" />
      <circle cx="78" cy="126" r="15" fill="#1f2937" />
      <circle cx="158" cy="126" r="15" fill="#1f2937" />
      <circle cx="78" cy="126" r="6" fill="#cbd5e1" />
      <circle cx="158" cy="126" r="6" fill="#cbd5e1" />
    </svg>
  );
}

function ExcavatorImage() {
  return (
    <svg viewBox="0 0 260 170" className="h-40 w-56">
      <ellipse cx="132" cy="143" rx="92" ry="13" fill="#dbe4ef" />
      <rect x="73" y="109" width="125" height="18" rx="9" fill="#334155" />
      <circle cx="95" cy="118" r="5" fill="#94a3b8" />
      <circle cx="126" cy="118" r="5" fill="#94a3b8" />
      <circle cx="158" cy="118" r="5" fill="#94a3b8" />
      <rect x="88" y="78" width="78" height="32" rx="7" fill="#f59e0b" stroke="#92400e" strokeWidth="2" />
      <rect x="137" y="54" width="40" height="38" rx="6" fill="#475569" />
      <rect x="145" y="61" width="20" height="18" rx="3" fill="#cbd5e1" />
      <path d="M100 80 L70 47" stroke="#f59e0b" strokeWidth="11" strokeLinecap="round" />
      <path d="M70 47 L45 82" stroke="#f59e0b" strokeWidth="11" strokeLinecap="round" />
      <path d="M45 82 L65 96" stroke="#334155" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

function WarehouseImage() {
  return (
    <svg viewBox="0 0 260 170" className="h-40 w-56">
      <ellipse cx="130" cy="143" rx="92" ry="13" fill="#dbe4ef" />
      <rect x="58" y="43" width="116" height="86" rx="5" fill="#334155" />
      <rect x="69" y="55" width="32" height="25" rx="3" fill="#cbd5e1" />
      <rect x="112" y="55" width="32" height="25" rx="3" fill="#cbd5e1" />
      <rect x="69" y="91" width="32" height="25" rx="3" fill="#cbd5e1" />
      <rect x="112" y="91" width="32" height="25" rx="3" fill="#cbd5e1" />
      <rect x="153" y="90" width="48" height="38" rx="4" fill="#d97706" />
      <rect x="162" y="63" width="42" height="32" rx="4" fill="#f59e0b" />
    </svg>
  );
}

function SettingsImage() {
  return (
    <svg viewBox="0 0 260 170" className="h-40 w-56">
      <ellipse cx="130" cy="143" rx="82" ry="13" fill="#dbe4ef" />
      <circle cx="130" cy="82" r="42" fill="#475569" />
      <circle cx="130" cy="82" r="18" fill="#f8fafc" />
      <rect x="123" y="12" width="14" height="28" rx="4" fill="#475569" />
      <rect x="123" y="124" width="14" height="28" rx="4" fill="#475569" />
      <rect x="60" y="75" width="28" height="14" rx="4" fill="#475569" />
      <rect x="172" y="75" width="28" height="14" rx="4" fill="#475569" />
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
      <path d="M160 120l-40 150" stroke="#64748b" strokeWidth="3" />
      <path d="M160 120l45 150" stroke="#64748b" strokeWidth="3" />
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