import Image from "next/image";
import Link from "next/link";

// =============================================================================
// PublicLandingPage — verejná marketingová stránka (neprihlásený návštevník
// na "/", pozri app/page.tsx). Čisto vizuálny + textový redesign zosúladený
// s aktuálnym tmavým dizajnovým jazykom appky (app/globals.css: surface-card,
// btn-primary/btn-secondary, icon-glow-*, accent-cyan/blue/orange/teal) —
// žiadne zmeny routov, logiky, dát ani business funkcií. Accent mapovanie
// modulov je zámerne zhodné s app/components/Dashboard.tsx (modules[]):
// Inbox = cyan, Vozidlá = blue, Stroje = orange, Sklad = teal.
// =============================================================================

type FeatureAccent = "cyan" | "blue" | "orange" | "teal";

const FEATURE_ACCENT_STYLES: Record<
  FeatureAccent,
  { icon: string; glow: string; chip: string; kicker: string }
> = {
  cyan: {
    icon: "bg-accent-cyan/14 text-accent-cyan",
    glow: "icon-glow-cyan",
    chip: "bg-accent-cyan/12 text-accent-cyan",
    kicker: "text-accent-cyan",
  },
  blue: {
    icon: "bg-accent-blue/14 text-accent-blue",
    glow: "icon-glow-blue",
    chip: "bg-accent-blue/12 text-accent-blue",
    kicker: "text-accent-blue",
  },
  orange: {
    icon: "bg-accent-orange/14 text-accent-orange",
    glow: "icon-glow-orange",
    chip: "bg-accent-orange/12 text-accent-orange",
    kicker: "text-accent-orange",
  },
  teal: {
    icon: "bg-accent-teal/14 text-accent-teal",
    glow: "icon-glow-teal",
    chip: "bg-accent-teal/12 text-accent-teal",
    kicker: "text-accent-teal",
  },
};

// Rovnaké 4 moduly a rovnaké obrázky ako v app/components/Dashboard.tsx
// (modules[]) — landing page zámerne nepoužíva vlastné/nové obrázky.
// Titulok prvej karty je "Inbox" (nie "AI Evidencia"), aby zodpovedal
// aktuálnemu názvu modulu v appke (viď Dashboard.tsx/ai-evidencia/page.tsx).
const featureCards: {
  title: string;
  description: string;
  image: string;
  accent: FeatureAccent;
  examples?: string[];
}[] = [
  {
    title: "Inbox",
    description:
      "Odfotíte alebo nahráte podporovaný dokument a Esblu sa z neho pokúsi automaticky načítať dostupné údaje. Výsledok pred uložením vždy skontrolujete a potvrdíte.",
    image: "/images/ai-evidencia.png",
    accent: "cyan",
    examples: ["vážne lístky", "dodacie listy", "technický preukaz"],
  },
  {
    title: "Vozidlá",
    description:
      "Evidencia vozidiel, technických údajov, dokumentov, fotografií a servisných záznamov.",
    image: "/images/van.png",
    accent: "blue",
  },
  {
    title: "Stroje",
    description:
      "Prehľad firemných strojov a techniky vrátane základných údajov a fotografií.",
    image: "/images/excavator.png",
    accent: "orange",
  },
  {
    title: "Sklad",
    description:
      "Jednoduchá evidencia skladových položiek, množstva a fotografií.",
    image: "/images/warehouse.png",
    accent: "teal",
  },
];

const audienceExamples = [
  "stavebné firmy",
  "firmy vykonávajúce výkopy a optické siete",
  "servisné firmy",
  "menšie dopravné firmy",
  "firmy s vlastnými vozidlami, strojmi alebo skladom",
];

const freePlanItems = [
  "5 dokumentov v Inboxe",
  "2 vozidlá",
  "2 stroje",
  "5 skladových položiek",
  "1 používateľský účet",
  "export dostupných údajov",
];

// AI transparentnosť (bod 1 zadania) — konzervatívne, vopred schválené
// formulácie. Zámerne bez mena konkrétneho AI poskytovateľa (ten je
// zdokumentovaný na /ochrana-osobnych-udajov a /subprocessors).
const aiTransparencyPoints = [
  "Esblu používa AI na asistované spracovanie dokumentov.",
  "AI môže urobiť chybu.",
  "Používateľ údaje pred finálnym uložením kontroluje a potvrdzuje.",
  "Esblu nepoužíva túto funkciu na autonómne rozhodovanie s právnymi alebo obdobne významnými účinkami.",
];

function BrandMark() {
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent-cyan to-accent-blue-strong shadow-lg shadow-black/30">
        <span
          aria-hidden="true"
          className="h-5 w-5 rotate-45 rounded-sm border-[3px] border-[#051221]"
        />
      </span>
      <span className="text-2xl font-black tracking-tight text-white">
        Esblu
      </span>
    </span>
  );
}

function CheckIcon({ className = "text-accent-cyan" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`mt-0.5 h-5 w-5 shrink-0 ${className}`}
    >
      <path
        d="m5 10 3 3 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const footerLinkClass =
  "rounded text-slate-300 transition hover:text-accent-cyan hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan";

// Tailwind (v4, statická analýza zdrojového kódu) nevie rozpoznať dynamicky
// poskladané triedy ako `bg-accent-${accent}` — preto mapa s VÝSLOVNE
// vypísanými plnými triedami pre každý accent (rovnaké 4 farby ako
// FEATURE_ACCENT_STYLES vyššie, iba samotné pozadie bodky v hero mockupe).
const DOT_ACCENT_BG: Record<FeatureAccent, string> = {
  cyan: "bg-accent-cyan",
  blue: "bg-accent-blue",
  orange: "bg-accent-orange",
  teal: "bg-accent-teal",
};

export default function PublicLandingPage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen overflow-x-hidden bg-page-bg text-primary">
      <header className="sticky top-0 z-50 border-b border-subtle bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="#uvod"
            aria-label="Esblu – späť na začiatok"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
          >
            <BrandMark />
          </a>

          <nav
            aria-label="Hlavná navigácia"
            className="order-3 flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-300 sm:order-none sm:w-auto sm:gap-5"
          >
            <a
              href="#funkcie"
              className="rounded-lg px-2 py-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Funkcie
            </a>
            <a
              href="#bezplatny-plan"
              className="rounded-lg px-2 py-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Bezplatný plán
            </a>
            <a
              href="#kontakt"
              className="rounded-lg px-2 py-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Kontakt
            </a>
          </nav>

          <Link
            href="/login"
            className="btn-secondary inline-flex min-h-11 items-center px-4 py-2 text-sm"
          >
            Prihlásiť sa
          </Link>
        </div>
      </header>

      <main>
        {/* HERO — tmavé pozadie appky + jemný cyan/modrý ambient glow, bez
            pixel-perfect kopírovania referencie, iba rovnaký dizajnový
            jazyk (near-black navy, cyan/blue akcent, premium tech karta). */}
        <section
          id="uvod"
          className="relative scroll-mt-28 overflow-hidden bg-slate-950"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center opacity-45"
            style={{ backgroundImage: "url('/images/background-dark.png')" }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/80 to-slate-950/50"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/40 to-transparent"
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.12fr_0.88fr] lg:px-8 lg:py-28">
            <div>
              <p className="inline-flex rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-4 py-2 text-sm font-bold text-accent-cyan">
                Bezplatná testovacia verzia
              </p>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                Firemná evidencia dokumentov, vozidiel, strojov a skladu na
                jednom mieste.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
                Esblu pomáha stavebným a servisným firmám spracovať dokumenty
                pomocou AI, evidovať techniku a udržať firemné údaje prehľadne
                usporiadané.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="btn-primary inline-flex min-h-12 items-center justify-center px-6 py-3"
                >
                  Vyskúšať zdarma
                </Link>
                <Link
                  href="/login"
                  className="btn-secondary inline-flex min-h-12 items-center justify-center px-6 py-3"
                >
                  Prihlásiť sa
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted-esblu">
                Bez platobnej karty. Bezplatný plán je obmedzený počtom
                položiek.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
              <div className="absolute -inset-8 rounded-full bg-gradient-to-br from-accent-cyan/25 via-accent-blue/15 to-transparent blur-3xl" />
              <div className="surface-card relative p-5 shadow-2xl shadow-black/40 sm:p-7">
                <div className="flex items-center justify-between border-b border-subtle pb-5">
                  <div>
                    <p className="text-sm font-semibold text-accent-cyan">
                      Firemná evidencia
                    </p>
                    <p className="mt-1 text-xl font-black text-primary">
                      Všetko dôležité prehľadne
                    </p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-accent-cyan to-accent-blue-strong">
                    <span className="h-5 w-5 rotate-45 rounded-sm border-[3px] border-[#051221]" />
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {(
                    [
                      ["Inbox", "Dokumenty", "cyan"],
                      ["Vozidlá", "Technické údaje", "blue"],
                      ["Stroje", "Firemná technika", "orange"],
                      ["Sklad", "Položky a množstvo", "teal"],
                    ] as [string, string, FeatureAccent][]
                  ).map(([title, description, accent]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-subtle bg-surface-2 p-4"
                    >
                      <span
                        aria-hidden="true"
                        className={`block h-2.5 w-2.5 rounded-full ${DOT_ACCENT_BG[accent]}`}
                      />
                      <p className="mt-4 font-bold text-primary">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-esblu">
                        {description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-info-soft p-4 text-sm font-semibold text-accent-cyan">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-cyan text-[#051221]">
                    AI
                  </span>
                  Menej ručného prepisovania dokumentov
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FUNKCIE — 4 moduly v rovnakom vizuálnom jazyku ako ModuleCard na
            Dashboarde (surface-card + farebný ikonový chip s icon-glow),
            bohatšie na obsah, keďže ide o marketingovú kartu, nie o
            kompaktnú appkovú dlaždicu. */}
        <section id="funkcie" className="scroll-mt-28 bg-page-bg py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-cyan">
                Jedna aplikácia, štyri prehľady
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
                Čo Esblu dokáže
              </h2>
              <p className="mt-4 text-lg leading-8 text-secondary">
                Základné firemné evidencie sú na jednom mieste a dostupné pod
                vlastným používateľským účtom.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {featureCards.map((feature) => {
                const styles = FEATURE_ACCENT_STYLES[feature.accent];

                return (
                  <article
                    key={feature.title}
                    className="surface-card surface-card-hover flex min-h-full flex-col p-6 transition sm:p-7"
                  >
                    <div
                      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${styles.icon} ${styles.glow}`}
                    >
                      <Image
                        src={feature.image}
                        alt=""
                        aria-hidden="true"
                        width={40}
                        height={40}
                        className="h-9 w-9 object-contain"
                      />
                    </div>
                    <h3 className="mt-6 text-2xl font-black text-primary">
                      {feature.title}
                    </h3>
                    <p className="mt-3 leading-7 text-secondary">
                      {feature.description}
                    </p>
                    {feature.examples && (
                      <ul
                        className="mt-5 flex flex-wrap gap-2"
                        aria-label="Príklady dokumentov"
                      >
                        {feature.examples.map((example) => (
                          <li
                            key={example}
                            className={`rounded-full px-3 py-1 text-sm font-semibold ${styles.chip}`}
                          >
                            {example}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* AI SPRACOVANIE + AI TRANSPARENTNOSŤ (bod 1 zadania). Konkrétny AI
            poskytovateľ sa tu zámerne NEMENUJE — je zdokumentovaný na
            /ochrana-osobnych-udajov (sekcia F) a /subprocessors. */}
        <section
          id="ai-spracovanie"
          className="scroll-mt-28 bg-slate-950 py-20 text-white sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-cyan">
                AI spracovanie
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Menej ručného prepisovania dokumentov
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                Esblu dokáže pri podporovaných dokumentoch automaticky
                rozpoznať niektoré dostupné údaje, napríklad číslo dokumentu,
                dátum, SPZ, materiál, hmotnosť, dodávateľa alebo zákazníka.
                Rozsah rozpoznaných údajov závisí od typu a kvality dokumentu.
              </p>

              <aside className="mt-7 rounded-2xl border border-subtle bg-surface-2 p-6">
                <h3 className="text-base font-black text-primary">
                  AI transparentnosť
                </h3>

                <ul className="mt-4 space-y-3">
                  {aiTransparencyPoints.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <CheckIcon />
                      <span className="text-sm leading-6 text-slate-200">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-5 rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold leading-6 text-amber-400">
                  AI výstup môže obsahovať chyby. Používateľ musí všetky
                  údaje pred uložením alebo ďalším použitím skontrolovať.
                </p>

                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
                  <Link
                    href="/ochrana-osobnych-udajov"
                    className="text-accent-cyan hover:underline"
                  >
                    Zásady ochrany osobných údajov →
                  </Link>
                  <Link
                    href="/podmienky-pouzivania"
                    className="text-accent-cyan hover:underline"
                  >
                    Podmienky používania →
                  </Link>
                </div>
              </aside>
            </div>

            <ol className="grid gap-4">
              {[
                "Nahrajte alebo odfoťte dokument.",
                "Skontrolujte rozpoznané údaje.",
                "Uložte dokument do evidencie alebo ho exportujte.",
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-5 rounded-2xl border border-subtle bg-surface-2 p-5"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-cyan to-accent-blue-strong text-lg font-black text-[#051221]">
                    {index + 1}
                  </span>
                  <span className="text-lg font-semibold leading-7">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="pre-koho"
          className="scroll-mt-28 bg-surface-2 py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-cyan">
                Praktická evidencia
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
                Pre koho je Esblu určené
              </h2>
              <p className="mt-5 text-lg leading-8 text-secondary">
                Esblu je určené najmä pre menšie stavebné, výkopové, servisné,
                dopravné a technické firmy, ktoré dnes evidujú dokumenty v
                papieroch, správach, fotografiách alebo tabuľkách.
              </p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {audienceExamples.map((example) => (
                <li
                  key={example}
                  className="flex items-start gap-3 rounded-2xl border border-subtle bg-surface-1 p-5 font-semibold leading-6 text-primary shadow-sm"
                >
                  <CheckIcon />
                  {example}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* BEZPLATNÝ PLÁN — predtým svetlá (blue-50 → white) sekcia,
            teraz plne tmavá, karta v .surface-card s cyan/blue accent
            borderom namiesto border-blue-200. */}
        <section
          id="bezplatny-plan"
          className="scroll-mt-28 bg-page-bg py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-cyan">
                Začnite bez platby
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
                Vyskúšajte Esblu zdarma
              </h2>
            </div>

            <div className="surface-card relative mx-auto mt-10 max-w-xl overflow-hidden p-6 shadow-2xl shadow-black/40 sm:p-8">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent-cyan to-accent-blue-strong opacity-80"
              />
              <p className="text-lg font-bold text-accent-cyan">
                Bezplatná testovacia verzia
              </p>
              <p className="mt-3 text-5xl font-black tracking-tight text-primary">
                0 €
              </p>
              <p className="mt-2 text-sm text-muted-esblu">bez platobnej karty</p>

              <ul className="mt-7 space-y-3">
                {freePlanItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-secondary">
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className="btn-primary mt-8 flex min-h-12 w-full items-center justify-center px-6 py-3"
              >
                Začať zdarma
              </Link>
            </div>

            <p className="mx-auto mt-7 max-w-2xl text-center leading-7 text-secondary">
              Platená verzia s vyššími limitmi sa pripravuje. Registrácia do
              bezplatnej verzie nezaručuje konkrétnu cenu ani funkcie budúcej
              platenej verzie.
            </p>
          </div>
        </section>

        <section
          id="bezpecnost"
          className="scroll-mt-28 bg-page-bg py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-subtle bg-slate-950 p-6 text-white shadow-xl sm:p-10 lg:p-12">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-cyan">
                    Dôvera a bezpečnosť
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                    Vaše firemné údaje zostávajú oddelené
                  </h2>
                  <p className="mt-5 text-lg leading-8 text-slate-300">
                    Údaje používateľských účtov sú v aplikácii oddelené
                    pomocou prístupových pravidiel. Prenos medzi zariadením a
                    službou prebieha šifrovane. Žiadny online systém však
                    nemožno označiť za absolútne bezpečný.
                  </p>
                </div>

                <ul className="space-y-4">
                  {[
                    "Používateľ sa prihlasuje vlastným účtom.",
                    "Jednotliví používatelia nemajú mať prístup k údajom iných účtov.",
                    "Dôležité originály dokumentov a vlastné zálohy si má používateľ ponechať.",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4 leading-7 text-slate-200"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-cyan"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Záverečné CTA — gradient zhodný s .btn-primary (cyan→blue),
            namiesto plnej bg-blue-600 plochy. */}
        <section className="bg-gradient-to-br from-accent-cyan to-accent-blue-strong py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-black tracking-tight text-[#051221] sm:text-4xl">
              Vyskúšajte, či vám Esblu zjednoduší firemnú evidenciu.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-[#051221]/80">
              Zaregistrujte sa zdarma a otestujte základné funkcie bezplatnej
              testovacej verzie.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-page-bg px-6 py-3 font-bold text-primary transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#051221] focus-visible:ring-offset-2"
              >
                Vyskúšať zdarma
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl px-6 py-3 font-bold text-[#051221] underline decoration-[#051221]/40 underline-offset-4 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#051221]"
              >
                Už mám účet
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer id="kontakt" className="scroll-mt-28 bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <BrandMark />
            <p className="mt-4 text-sm text-muted-esblu">
              Bezplatná testovacia verzia
            </p>
            <a
              href="mailto:info@esblu.com"
              className="mt-3 inline-block break-all rounded text-sm font-semibold text-accent-cyan hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              info@esblu.com
            </a>
          </div>

          {/* Právne odkazy (bod 2 zadania) — doplnené Cookies/DPA/
              Sprostredkovatelia popri existujúcich, rovnaké poradie a
              formulácia ako v app/components/PublicLegalLayout.tsx. */}
          <nav
            aria-label="Právne a kontaktné informácie"
            className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm font-semibold sm:grid-cols-3"
          >
            <Link href="/ochrana-osobnych-udajov" className={footerLinkClass}>
              Ochrana osobných údajov
            </Link>
            <Link href="/podmienky-pouzivania" className={footerLinkClass}>
              Podmienky používania
            </Link>
            <Link href="/cookies" className={footerLinkClass}>
              Cookies
            </Link>
            <Link href="/dpa" className={footerLinkClass}>
              DPA
            </Link>
            <Link href="/subprocessors" className={footerLinkClass}>
              Sprostredkovatelia
            </Link>
            <Link href="/kontakt" className={footerLinkClass}>
              Kontakt
            </Link>
            <Link href="/login" className={footerLinkClass}>
              Prihlásenie
            </Link>
          </nav>
        </div>
        <div className="border-t border-subtle px-4 py-5 text-center text-xs text-muted-esblu">
          © {currentYear} Esblu
        </div>
      </footer>
    </div>
  );
}
