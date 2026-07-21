import Image from "next/image";
import Link from "next/link";

const featureCards = [
  {
    title: "AI Evidencia",
    description:
      "Odfotíte alebo nahráte podporovaný dokument a Esblu sa z neho pokúsi automaticky načítať dostupné údaje. Výsledok pred uložením vždy skontrolujete.",
    image: "/images/ai-evidencia.png",
    examples: ["vážne lístky", "dodacie listy"],
  },
  {
    title: "Vozidlá",
    description:
      "Evidencia vozidiel, technických údajov, dokumentov, fotografií a servisných záznamov.",
    image: "/images/van.png",
  },
  {
    title: "Stroje",
    description:
      "Prehľad firemných strojov a techniky vrátane základných údajov a fotografií.",
    image: "/images/excavator.png",
  },
  {
    title: "Sklad",
    description:
      "Jednoduchá evidencia skladových položiek, množstva a fotografií.",
    image: "/images/warehouse.png",
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
  "5 dokumentov v AI Evidencii",
  "2 vozidlá",
  "2 stroje",
  "5 skladových položiek",
  "1 používateľský účet",
  "export dostupných údajov",
];

const primaryLinkClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

const secondaryLinkClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-white/35 bg-white/10 px-6 py-3 font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

function BrandMark() {
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30">
        <span
          aria-hidden="true"
          className="h-5 w-5 rotate-45 rounded-sm border-[3px] border-white"
        />
      </span>
      <span className="text-2xl font-black tracking-tight text-white">
        Esblu
      </span>
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
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

export default function PublicLandingPage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="#uvod"
            aria-label="Esblu – späť na začiatok"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <BrandMark />
          </a>

          <nav
            aria-label="Hlavná navigácia"
            className="order-3 flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-200 sm:order-none sm:w-auto sm:gap-5"
          >
            <a
              href="#funkcie"
              className="rounded-lg px-2 py-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Funkcie
            </a>
            <a
              href="#bezplatny-plan"
              className="rounded-lg px-2 py-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Bezplatný plán
            </a>
            <a
              href="#kontakt"
              className="rounded-lg px-2 py-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Kontakt
            </a>
          </nav>

          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            Prihlásiť sa
          </Link>
        </div>
      </header>

      <main>
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
            className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/75 to-blue-950/40"
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.12fr_0.88fr] lg:px-8 lg:py-28">
            <div>
              <p className="inline-flex rounded-full border border-blue-300/30 bg-blue-400/10 px-4 py-2 text-sm font-bold text-blue-200">
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
                <Link href="/login" className={primaryLinkClass}>
                  Vyskúšať zdarma
                </Link>
                <Link href="/login" className={secondaryLinkClass}>
                  Prihlásiť sa
                </Link>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                Bez platobnej karty. Bezplatný plán je obmedzený počtom
                položiek.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
              <div className="absolute -inset-8 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="relative rounded-3xl border border-white/20 bg-white/95 p-5 shadow-2xl shadow-blue-950/40 sm:p-7">
                <div className="flex items-center justify-between border-b border-slate-200 pb-5">
                  <div>
                    <p className="text-sm font-semibold text-blue-700">
                      Firemná evidencia
                    </p>
                    <p className="mt-1 text-xl font-black text-slate-950">
                      Všetko dôležité prehľadne
                    </p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600">
                    <span className="h-5 w-5 rotate-45 rounded-sm border-[3px] border-white" />
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    ["AI evidencia", "Dokumenty"],
                    ["Vozidlá", "Technické údaje"],
                    ["Stroje", "Firemná technika"],
                    ["Sklad", "Položky a množstvo"],
                  ].map(([title, description], index) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${
                          index % 2 === 0 ? "bg-blue-600" : "bg-fuchsia-500"
                        }`}
                      />
                      <p className="mt-4 font-bold text-slate-950">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-900">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
                    AI
                  </span>
                  Menej ručného prepisovania dokumentov
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="funkcie" className="scroll-mt-28 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
                Jedna aplikácia, štyri prehľady
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Čo Esblu dokáže
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Základné firemné evidencie sú na jednom mieste a dostupné pod
                vlastným používateľským účtom.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {featureCards.map((feature) => (
                <article
                  key={feature.title}
                  className="flex min-h-full flex-col rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl sm:p-7"
                >
                  <div className="h-24 w-32 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <Image
                      src={feature.image}
                      alt=""
                      aria-hidden="true"
                      width={256}
                      height={160}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <h3 className="mt-6 text-2xl font-black text-slate-950">
                    {feature.title}
                  </h3>
                  <p className="mt-3 leading-7 text-slate-600">
                    {feature.description}
                  </p>
                  {feature.examples && (
                    <ul className="mt-5 flex flex-wrap gap-2" aria-label="Príklady dokumentov">
                      {feature.examples.map((example) => (
                        <li
                          key={example}
                          className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800"
                        >
                          {example}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="ai-spracovanie"
          className="scroll-mt-28 bg-slate-950 py-20 text-white sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">
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
              <aside className="mt-7 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 font-semibold leading-7 text-amber-100">
                AI výstup môže obsahovať chyby. Používateľ musí všetky údaje
                pred uložením alebo ďalším použitím skontrolovať.
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
                  className="flex items-center gap-5 rounded-2xl border border-white/15 bg-white/10 p-5"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-lg font-black">
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
          className="scroll-mt-28 bg-slate-50 py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
                Praktická evidencia
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Pre koho je Esblu určené
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Esblu je určené najmä pre menšie stavebné, výkopové, servisné,
                dopravné a technické firmy, ktoré dnes evidujú dokumenty v
                papieroch, správach, fotografiách alebo tabuľkách.
              </p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {audienceExamples.map((example) => (
                <li
                  key={example}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 font-semibold leading-6 text-slate-800 shadow-sm"
                >
                  <CheckIcon />
                  {example}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="bezplatny-plan"
          className="scroll-mt-28 bg-gradient-to-b from-blue-50 to-white py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
                Začnite bez platby
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Vyskúšajte Esblu zdarma
              </h2>
            </div>

            <div className="mx-auto mt-10 max-w-xl rounded-3xl border-2 border-blue-200 bg-white p-6 shadow-2xl shadow-blue-900/10 sm:p-8">
              <p className="text-lg font-bold text-blue-700">
                Bezplatná testovacia verzia
              </p>
              <p className="mt-3 text-5xl font-black tracking-tight text-slate-950">
                0 €
              </p>
              <p className="mt-2 text-sm text-slate-500">bez platobnej karty</p>

              <ul className="mt-7 space-y-3">
                {freePlanItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-slate-700">
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Začať zdarma
              </Link>
            </div>

            <p className="mx-auto mt-7 max-w-2xl text-center leading-7 text-slate-600">
              Platená verzia s vyššími limitmi sa pripravuje. Registrácia do
              bezplatnej verzie nezaručuje konkrétnu cenu ani funkcie budúcej
              platenej verzie.
            </p>
          </div>
        </section>

        <section
          id="bezpecnost"
          className="scroll-mt-28 bg-white py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-xl sm:p-10 lg:p-12">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">
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
                      className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 leading-7 text-slate-200"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-400"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-blue-600 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center text-white sm:px-6 lg:px-8">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Vyskúšajte, či vám Esblu zjednoduší firemnú evidenciu.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-blue-100">
              Zaregistrujte sa zdarma a otestujte základné funkcie bezplatnej
              testovacej verzie.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 py-3 font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600"
              >
                Vyskúšať zdarma
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl px-6 py-3 font-bold text-white underline decoration-blue-300 underline-offset-4 transition hover:text-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
            <p className="mt-4 text-sm text-slate-400">
              Bezplatná testovacia verzia
            </p>
            <a
              href="mailto:info@esblu.com"
              className="mt-3 inline-block break-all rounded text-sm font-semibold text-blue-300 hover:text-blue-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              info@esblu.com
            </a>
          </div>

          <nav
            aria-label="Právne a kontaktné informácie"
            className="grid gap-3 text-sm font-semibold sm:grid-cols-2 md:text-right"
          >
            <Link
              href="/ochrana-osobnych-udajov"
              className="rounded hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Ochrana osobných údajov
            </Link>
            <Link
              href="/podmienky-pouzivania"
              className="rounded hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Podmienky používania
            </Link>
            <Link
              href="/kontakt"
              className="rounded hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Kontakt
            </Link>
            <Link
              href="/login"
              className="rounded hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Prihlásenie
            </Link>
          </nav>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-slate-500">
          © {currentYear} Esblu
        </div>
      </footer>
    </div>
  );
}
