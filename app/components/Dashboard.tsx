"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCompanyProfile, getMyActiveMembership } from "@/lib/company";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import ModuleCard, { type ModuleAccent } from "./ModuleCard";

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return t("dashboard.greetingMorning");
  if (hour >= 12 && hour < 18) return t("dashboard.greetingAfternoon");
  if (hour >= 18 && hour < 22) return t("dashboard.greetingEvening");

  return t("dashboard.greetingNight");
}

export default function Dashboard() {
  const router = useRouter();
  const { t } = useLocale();

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("ESBLU");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [search, setSearch] = useState("");
  // KOREKCIA (dashboard v2): mobil už nemá permanentný sidebar ani priamy
  // odkaz na Nastavenia namiesto menu — hamburger teraz otvára skutočné
  // výsuvné menu s rovnakou navigáciou ako desktop sidebar. Čisto UI stav,
  // nič dátové/business.
  const [menuOpen, setMenuOpen] = useState(false);
  const greeting = getGreeting(t);
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

    const membership = await getMyActiveMembership();

    if (!membership) {
      setVehicles([]);
      setMachines([]);
      setItems([]);
      // Bez aktívneho membershipu niet "firmy", ktorej branding by sa dal
      // načítať (esblu_get_company_profile by aj tak nič nevrátila) —
      // ostáva dnešný generický fallback ("ESBLU", žiadne logo).
      return;
    }

    loadData(membership.company_id);
    loadCompanyProfile();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Firemný názov + logo pre AKTÍVNEHO ČLENA firmy (owner/admin/employee
  // rovnako) — nie z vlastného, väčšinou prázdneho settings riadku
  // prihláseného používateľa. Pozri lib/company.ts a
  // supabase/migrations/20260814180000_add_company_profile_rpc.sql /
  // 20260814190000_fix_company_profile_rpc.sql.
  //
  // Bezpečnostná poistka proti regresii (pridané po nahlásenej chybe, kde
  // fallback ESBLU videl aj owner): ak RPC z akéhokoľvek dôvodu (napr.
  // migrácia ešte nie je aplikovaná na danom prostredí) nevráti žiadny
  // profil, skús ako druhý krok priamo vlastný settings riadok
  // prihláseného používateľa — presne to, čo appka robila PRED zavedením
  // esblu_get_company_profile(). Pre ownera/admina, ktorí majú firemné
  // údaje uložené vo svojom vlastnom riadku, sa tým hlavička obnoví aj bez
  // funkčného RPC. Pre employee je vlastný riadok bežne prázdny, takže sa
  // tu nič neprezradí — v tom prípade jednoducho ostane fallback.
  async function loadCompanyProfile() {
    let profile = await getCompanyProfile();

    if (!profile?.company_name && !profile?.logo_path) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const { data: ownSettings } = await supabase
          .from("settings")
          .select("company_name, logo_path")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (ownSettings?.company_name || ownSettings?.logo_path) {
          profile = ownSettings;
        }
      }
    }

    if (profile?.company_name) {
      setCompanyName(profile.company_name);
    }

    if (profile?.logo_path) {
      const { data: logoData } = supabase.storage
        .from("company-logos")
        .getPublicUrl(profile.logo_path);

      setCompanyLogoUrl(logoData.publicUrl);
    } else {
      setCompanyLogoUrl("");
    }
  }

  async function loadData(currentCompanyId: string) {
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", currentCompanyId);

    const { data: machineData } = await supabase
      .from("machines")
      .select("*")
      .eq("company_id", currentCompanyId);

    const { data: itemData } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", currentCompanyId);

    setVehicles(vehicleData || []);
    setMachines(machineData || []);
    setItems(itemData || []);
  }

  function createAlerts() {
    const today = new Date();
    const next30Days = new Date();
    next30Days.setDate(today.getDate() + 30);

    const result: { level: string; type: string; message: string }[] = [];

    vehicles.forEach((car) => {
      checkDate(result, car, t("dashboard.stkLabel"), car.stk, today, next30Days);
      checkDate(result, car, t("dashboard.ekLabel"), car.ek, today, next30Days);
    });

    return result;
  }

  function checkDate(
    result: { level: string; type: string; message: string }[],
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

    const name =
      `${car.znacka || ""} ${car.model || ""}`.trim() ||
      t("dashboard.vehicleFallbackName");
    const spz = car.spz || t("dashboard.noPlate");

    if (date < today) {
      result.push({
        level: "red",
        type,
        message: t("dashboard.alertOverdue", { type, name, spz }),
      });
    } else if (date <= next30Days) {
      result.push({
        level: "orange",
        type,
        message: t("dashboard.alertDueSoon", { type, name, spz, days: diffDays }),
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
            type: t("dashboard.resultTypeVehicle"),
            title:
              `${v.znacka || ""} ${v.model || ""}`.trim() ||
              t("dashboard.vehicleFallbackName"),
            subtitle: `${v.spz || t("dashboard.noPlate")} | ${
              v.vin || t("dashboard.noVin")
            }`,
            href: `/vozidla/${v.id}`,
          })),

        ...machines
          .filter((m) =>
            `${m.name} ${m.category} ${m.manufacturer} ${m.model} ${m.serial_number}`
              .toLowerCase()
              .includes(query)
          )
          .map((m) => ({
            type: t("dashboard.resultTypeMachine"),
            title: m.name || t("dashboard.noName"),
            subtitle: `${m.category || t("dashboard.noCategory")} | ${
              m.serial_number || t("dashboard.noSerialNumber")
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
            type: t("dashboard.resultTypeInventory"),
            title: i.name || t("dashboard.noName"),
            subtitle: `${i.quantity || 0} ${i.unit || ""} | ${
              i.location || t("dashboard.noLocation")
            }`,
            href: `/sklad/${i.id}`,
          })),
      ]
    : [];

  const modules: {
    title: string;
    subtitle: string;
    stat?: string;
    href: string;
    image: string;
    accent: ModuleAccent;
  }[] = [
    {
      title: t("nav.inbox"),
      subtitle: t("dashboard.moduleInboxSubtitle"),
      href: "/ai-evidencia",
      image: "/images/ai-evidencia.png",
      accent: "cyan",
    },
    {
      title: t("nav.vehicles"),
      subtitle: t("dashboard.moduleVehiclesSubtitle"),
      stat: String(vehicles.length),
      href: "/vozidla",
      image: "/images/van.png",
      accent: "blue",
    },
    {
      title: t("nav.machines"),
      subtitle: t("dashboard.moduleMachinesSubtitle"),
      stat: String(machines.length),
      href: "/stroje",
      image: "/images/excavator.png",
      accent: "orange",
    },
    {
      title: t("nav.inventory"),
      subtitle: t("dashboard.moduleInventorySubtitle"),
      stat: String(items.length),
      href: "/sklad",
      image: "/images/warehouse.png",
      accent: "teal",
    },
    {
      title: t("nav.settings"),
      subtitle: t("dashboard.moduleSettingsSubtitle"),
      href: "/nastavenia",
      image: "/images/settings.png",
      accent: "blue",
    },
  ];

  // Spoločný zoznam navigačných položiek pre desktop sidebar AJ mobilné
  // výsuvné menu (jeden zdroj pravdy, žiadna duplicita odkazov/ciest).
  const navItems = [
    { href: "/ai-evidencia", label: t("nav.inbox"), image: "/images/ai-evidencia.png" },
    { href: "/vozidla", label: t("nav.vehicles"), image: "/images/van.png" },
    { href: "/stroje", label: t("nav.machines"), image: "/images/excavator.png" },
    { href: "/sklad", label: t("nav.inventory"), image: "/images/warehouse.png" },
    { href: "/nastavenia", label: t("nav.settings"), image: "/images/settings.png" },
  ];

  return (
    <main className="app-shell-bg relative min-h-screen">
      <div className="relative flex min-h-screen flex-col lg:flex-row">
        {/* Desktop sidebar — KOREKCIA (dashboard v2): užší, plochý a tmavší
            (bez glass/blur efektu), aby nedominoval obrazovke a nepôsobil
            ako klasický enterprise admin panel. */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-subtle bg-page-bg-elevated px-5 py-6 lg:flex">
          <div className="flex items-center gap-2.5">
            {companyLogoUrl ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-subtle bg-surface-1">
                <img
                  src={companyLogoUrl}
                  alt={`Logo ${companyName}`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent-cyan to-accent-blue shadow-lg">
                <div className="h-4 w-4 rotate-45 rounded-md border-[3px] border-[#051221]" />
              </div>
            )}

            <div className="min-w-0">
              <h1 className="truncate text-base font-black tracking-tight text-primary">
                {companyName}
              </h1>
              <p className="truncate text-[11px] font-medium text-muted-esblu">
                {t("dashboard.tagline")}
              </p>
            </div>
          </div>

          <nav className="mt-8 flex-1 space-y-1">
            <SideLink active href="/" label={t("nav.overview")} icon={<MenuIcon />} />
            {navItems.map((item) => (
              <SideLink key={item.href} href={item.href} label={item.label} image={item.image} />
            ))}
          </nav>

          <button
            onClick={logout}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-secondary transition hover:bg-surface-hover hover:text-primary"
          >
            <LogoutIcon />
            {t("common.buttons.logout")}
          </button>
        </aside>

        {/* Mobilné výsuvné menu — KOREKCIA (dashboard v2): žiadny
            permanentný sidebar na mobile, iba hamburger, ktorý otvorí
            skutočné menu s rovnakou navigáciou ako desktop sidebar. */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label={t("dashboard.closeMenu")}
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />
            <div className="absolute inset-y-0 right-0 flex w-[78%] max-w-xs flex-col border-l border-subtle bg-page-bg-elevated p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary">
                  {t("dashboard.menuTitle")}
                </span>
                <button
                  type="button"
                  aria-label={t("dashboard.closeMenu")}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-secondary"
                >
                  ✕
                </button>
              </div>

              <nav className="mt-6 flex-1 space-y-1.5">
                <SideLink
                  active
                  href="/"
                  label={t("nav.overview")}
                  icon={<MenuIcon />}
                  onNavigate={() => setMenuOpen(false)}
                />
                {navItems.map((item) => (
                  <SideLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    image={item.image}
                    onNavigate={() => setMenuOpen(false)}
                  />
                ))}
              </nav>

              <button
                onClick={logout}
                className="btn-secondary flex items-center justify-center gap-2 py-3 text-sm"
              >
                <LogoutIcon />
                {t("common.buttons.logout")}
              </button>
            </div>
          </div>
        )}

        <section className="w-full flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:py-12">
          {/* Mobilný horný pruh — brand + hamburger (nahrádza predchádzajúci
              priamy odkaz na Nastavenia). */}
          <div className="flex items-center justify-between gap-4 lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              {companyLogoUrl ? (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-subtle bg-surface-1">
                  <img
                    src={companyLogoUrl}
                    alt={`Logo ${companyName}`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <span className="text-xl">👤</span>
              )}

              <p className="truncate text-sm font-semibold text-secondary">
                {companyName}
              </p>
            </div>

            <button
              type="button"
              aria-label={t("dashboard.openMenu")}
              onClick={() => setMenuOpen(true)}
              className="surface-card surface-card-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-secondary transition"
            >
              <HamburgerIcon />
            </button>
          </div>

          <h2 className="mt-5 text-3xl font-black tracking-tight text-primary lg:mt-0 lg:text-[2.75rem]">
            {greeting}
          </h2>

          {/* Search — KOREKCIA v3: jednoduchá tmavá pilulka priamo na pozadí
              namiesto ďalšej "surface-card" krabice, menej rámov na
              obrazovke. */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-subtle bg-surface-1/60 px-4 py-3.5 lg:mt-9">
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("dashboard.searchPlaceholder")}
              className="w-full min-w-0 bg-transparent text-base text-primary outline-none placeholder:text-muted-esblu"
            />
          </div>

          {query && (
            <div className="mt-3 space-y-2.5">
              {searchResults.length === 0 ? (
                <p className="rounded-2xl border border-subtle bg-surface-1/60 p-4 text-sm text-secondary">
                  {t("dashboard.noResults")}
                </p>
              ) : (
                searchResults.map((result, index) => (
                  <Link
                    key={index}
                    href={result.href}
                    className="surface-card-hover block rounded-2xl border border-subtle bg-surface-1/60 p-4 transition"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-accent-cyan">
                      {result.type}
                    </p>
                    <p className="mt-1 text-base font-bold text-primary">
                      {result.title}
                    </p>
                    <p className="text-sm text-secondary">{result.subtitle}</p>
                  </Link>
                ))
              )}
            </div>
          )}

          <div className="mt-9 grid grid-cols-2 gap-3 lg:mt-12 lg:grid-cols-4 lg:gap-4">
            {modules
              .filter((module) => module.title !== t("nav.settings"))
              .map((module) => (
                <ModuleCard
                  key={module.href}
                  href={module.href}
                  title={module.title}
                  subtitle={module.subtitle}
                  stat={module.stat}
                  image={module.image}
                  accent={module.accent}
                />
              ))}
          </div>

          {/* STK/EK panel — KOREKCIA v3: tmavý status panel s malými
              riadkami (ikona + text + drobný badge vpravo), farba je iba
              akcent na ikone/badge, nie výplň celej položky. */}
          <div className="surface-card mt-6 p-5 sm:p-6 lg:mt-8 lg:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-primary sm:text-xl">
                  {t("dashboard.stkEkTitle")}
                </h3>
                <p className="mt-1 text-xs text-muted-esblu">
                  {t("dashboard.stkEkDescription")}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                  alerts.length > 0 ? "badge-danger" : "badge-success"
                }`}
              >
                {alerts.length}
              </span>
            </div>

            {alerts.length === 0 ? (
              <p className="mt-5 text-sm text-secondary">
                {t("dashboard.stkEkNone")}
              </p>
            ) : (
              <div className="mt-4 divide-y divide-[color:var(--color-border-subtle)]">
                {alerts.map((alert, index) => {
                  const isOverdue = alert.level === "red";

                  return (
                    <div key={index} className="flex items-center gap-3 py-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isOverdue
                            ? "bg-red-400/12 text-red-400"
                            : "bg-amber-400/12 text-amber-400"
                        }`}
                        aria-hidden="true"
                      >
                        !
                      </span>

                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                        {alert.message}
                      </p>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          isOverdue
                            ? "bg-red-400/12 text-red-400"
                            : "bg-amber-400/12 text-amber-400"
                        }`}
                      >
                        {alert.type}
                      </span>
                    </div>
                  );
                })}
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
  image,
  icon,
  active = false,
  onNavigate,
}: {
  href: string;
  label: string;
  image?: string;
  icon?: ReactNode;
  active?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg border-l-2 py-2.5 pr-3 text-sm font-semibold transition ${
        active
          ? "border-accent-cyan pl-[10px] text-accent-cyan"
          : "border-transparent pl-[10px] text-secondary hover:border-border-strong hover:text-primary"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          active ? "bg-accent-cyan/12" : "bg-surface-2"
        }`}
      >
        {icon ??
          (image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              aria-hidden="true"
              className="h-6 w-6 object-contain"
            />
          ) : null)}
      </div>

      {label}
    </Link>
  );
}

function IconBase({
  children,
  size = 22,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function MenuIcon() {
  return (
    <IconBase size={20}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </IconBase>
  );
}

function HamburgerIcon() {
  return (
    <IconBase size={20}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </IconBase>
  );
}

function LogoutIcon() {
  return (
    <IconBase size={20}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </IconBase>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-secondary">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
