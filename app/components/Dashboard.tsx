"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Dashboard() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [companyName, setCompanyName] = useState("AssetPilot");

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

    setUserId(session.user.id);
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

    const cars = vehicleData || [];
    const mach = machineData || [];
    const inv = itemData || [];

    setVehicles(cars);
    setMachines(mach);
    setItems(inv);
    setAlerts(createAlerts(cars));

    if (settingsData?.company_name) {
      setCompanyName(settingsData.company_name);
    }
  }

  function createAlerts(cars: any[]) {
    const today = new Date();
    const next30Days = new Date();
    next30Days.setDate(today.getDate() + 30);

    const result: any[] = [];

    cars.forEach((car) => {
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

    if (date < today) {
      result.push({
        level: "red",
        text: `❌ ${type} po termíne: ${car.znacka} ${car.model} (${car.spz})`,
      });
    } else if (date <= next30Days) {
      result.push({
        level: "orange",
        text: `⚠️ ${type} končí o ${diffDays} dní: ${car.znacka} ${car.model} (${car.spz})`,
      });
    }
  }

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
            type: "🚗 Vozidlo",
            title: `${v.znacka || ""} ${v.model || ""}`,
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
            type: "🚜 Stroj",
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
            type: "📦 Sklad",
            title: i.name || "Bez názvu",
            subtitle: `${i.quantity || 0} ${i.unit || ""} | ${
              i.location || "bez umiestnenia"
            }`,
            href: `/sklad/${i.id}`,
          })),
      ]
    : [];

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-72 bg-slate-950 p-6 text-white">
          <h1 className="text-3xl font-bold text-blue-400">{companyName}</h1>

          <p className="mt-2 text-sm text-slate-400">
            Firemný majetok pod kontrolou
          </p>

          <nav className="mt-10 space-y-3">
            <Link href="/" className="block rounded-xl bg-blue-600 px-4 py-3">
              🏠 Menu
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

            <Link
              href="/sklad"
              className="block rounded-xl px-4 py-3 hover:bg-slate-800"
            >
              📦 Sklad
            </Link>

            <Link
              href="/nastavenia"
              className="block rounded-xl px-4 py-3 hover:bg-slate-800"
            >
              ⚙️ Nastavenia
            </Link>

            <button
              onClick={logout}
              className="mt-8 w-full rounded-xl bg-red-600 px-4 py-3 text-left hover:bg-red-700"
            >
              🚪 Odhlásiť sa
            </button>
          </nav>
        </aside>

        <section className="flex-1 p-10">
          <h2 className="text-4xl font-bold text-slate-900">Menu</h2>

          <p className="mt-2 text-slate-600">
            Vyber modul, s ktorým chceš pracovať.
          </p>

          <div className="mt-8 rounded-2xl bg-white p-6 shadow">
            <h3 className="text-2xl font-bold">🔍 Vyhľadávanie</h3>

            <input
              placeholder="Hľadať vozidlo, stroj alebo skladovú položku..."
              className="mt-4 w-full rounded-xl border p-4"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {query && (
              <div className="mt-5 space-y-3">
                {searchResults.length === 0 ? (
                  <p className="text-slate-500">Nič sa nenašlo.</p>
                ) : (
                  searchResults.map((result, index) => (
                    <Link
                      key={index}
                      href={result.href}
                      className="block rounded-xl border bg-slate-50 p-4 hover:bg-slate-100"
                    >
                      <p className="font-bold">{result.type}</p>
                      <p className="text-lg font-semibold">{result.title}</p>
                      <p className="text-sm text-slate-500">
                        {result.subtitle}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Link
              href="/vozidla"
              className="rounded-2xl bg-white p-8 shadow hover:shadow-lg"
            >
              <div className="text-5xl">🚗</div>
              <h3 className="mt-5 text-2xl font-bold">Vozidlá</h3>
              <p className="mt-2 text-slate-500">
                {vehicles.length} uložených vozidiel
              </p>
              <p className="mt-6 font-semibold text-blue-600">Otvoriť →</p>
            </Link>

            <Link
              href="/stroje"
              className="rounded-2xl bg-white p-8 shadow hover:shadow-lg"
            >
              <div className="text-5xl">🚜</div>
              <h3 className="mt-5 text-2xl font-bold">Stroje</h3>
              <p className="mt-2 text-slate-500">
                {machines.length} uložených strojov
              </p>
              <p className="mt-6 font-semibold text-blue-600">Otvoriť →</p>
            </Link>

            <Link
              href="/sklad"
              className="rounded-2xl bg-white p-8 shadow hover:shadow-lg"
            >
              <div className="text-5xl">📦</div>
              <h3 className="mt-5 text-2xl font-bold">Sklad</h3>
              <p className="mt-2 text-slate-500">
                {items.length} skladových položiek
              </p>
              <p className="mt-6 font-semibold text-blue-600">Otvoriť →</p>
            </Link>
          </div>

          <div className="mt-10 rounded-2xl bg-white p-6 shadow">
            <h3 className="text-2xl font-bold">Upozornenia STK / EK</h3>

            {alerts.length === 0 ? (
              <p className="mt-3 text-slate-500">
                Momentálne nemáte žiadne upozornenia na STK ani EK.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {alerts.map((alert, index) => (
                  <div
                    key={index}
                    className={`rounded-xl p-4 font-medium ${
                      alert.level === "red"
                        ? "bg-red-100 text-red-800"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {alert.text}
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