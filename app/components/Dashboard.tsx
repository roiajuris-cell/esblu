"use client";

import Image from "next/image";
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

  function createAlerts() {
    const today = new Date();
    const next30Days = new Date();
    next30Days.setDate(today.getDate() + 30);

    const alerts: any[] = [];

    vehicles.forEach((car) => {
      checkDate(alerts, car, "STK", car.stk, today, next30Days);
      checkDate(alerts, car, "EK", car.ek, today, next30Days);
    });

    return alerts;
  }

  function checkDate(
    alerts: any[],
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

    const vehicleName = `${car.znacka || ""} ${car.model || ""}`.trim();
    const spz = car.spz || "bez ŠPZ";

    if (date < today) {
      alerts.push({
        level: "red",
        text: `${type} po termíne: ${vehicleName || "Vozidlo"} (${spz})`,
      });
    } else if (date <= next30Days) {
      alerts.push({
        level: "orange",
        text: `${type} končí o ${diffDays} dní: ${
          vehicleName || "Vozidlo"
        } (${spz})`,
      });
    }
  }

  const alerts = createAlerts();

  const modules = [
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
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.96),rgba(239,246,255,0.88))]" />

      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: "url('/images/background.jpg')" }}
      />

      <div className="relative flex min-h-screen">
        <aside className="m-4 flex w-72 flex-col rounded-3xl bg-white/90 p-7 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600">
              <div className="h-7 w-7 rotate-45 rounded-md border-4 border-white" />
            </div>

            <h1 className="text-4xl font-black tracking-tight text-slate-950">
              {companyName}
            </h1>
          </div>

          <nav className="mt-12 space-y-3">
            <SideLink active href="/" label="Menu" icon="▦" />
            <SideLink href="/vozidla" label="Vozidlá" icon="▰" />
            <SideLink href="/stroje" label="Stroje" icon="▱" />
            <SideLink href="/sklad" label="Sklad" icon="▣" />
            <SideLink href="/nastavenia" label="Nastavenia" icon="⚙" />
          </nav>

          <button
            onClick={logout}
            className="mt-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <span className="text-xl">↪</span>
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

          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
            {modules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="group rounded-3xl bg-white/90 p-8 text-center shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="mx-auto flex h-40 items-center justify-center">
                  <Image
                    src={module.image}
                    alt={module.title}
                    width={180}
                    height={130}
                    className="h-auto w-auto object-contain transition duration-300 group-hover:scale-105"
                    priority
                  />
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

          <div className="mt-10 rounded-3xl bg-white/90 p-8 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-black text-slate-950">
                  Upozornenia STK / EK
                </h3>
                <p className="mt-2 text-slate-500">
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
                    {alert.level === "red" ? "🔴" : "🟠"} {alert.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SideLink({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: string;
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
      <span className="w-7 text-center text-xl">{icon}</span>
      {label}
    </Link>
  );
}