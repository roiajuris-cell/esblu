"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  acceptCompanyDpa,
  getMyCompanyDpaStatus,
  type CompanyDpaStatus,
} from "@/lib/company-dpa";

// -----------------------------------------------------------------------
// Legal-hold kontext: kým firma nemá platné company-level DPA acceptance,
// stránky vytvárajúce NOVÉ business dáta (vozidlá, stroje, sklad, AI
// evidencia — presne tie tabuľky, ktoré chráni
// esblu_require_company_dpa_before_insert v
// 20260816090000_add_company_dpa_acceptance.sql) majú svoje "pridať nové"
// akcie deaktivovať/skryť UŽ V UI, nielen nechať používateľa naraziť na
// ESBLU_COMPANY_DPA_NOT_ACCEPTED až pri ukladaní. Toto je iba pomocná UX
// vrstva — DB BEFORE INSERT trigger zostáva hlavnou a jedinou skutočne
// spoľahlivou ochranou (funguje aj keby táto UI vrstva mala chybu alebo
// by ju niekto obišiel priamym volaním Supabase klienta).
//
// Zámerne NEBLOKUJE úpravu/mazanie existujúcich záznamov ani ich
// prezeranie — iba vytváranie NOVÝCH riadkov v chránených tabuľkách.
// -----------------------------------------------------------------------
type CompanyDpaLegalHoldValue = { legalHold: boolean };

const CompanyDpaLegalHoldContext = createContext<CompanyDpaLegalHoldValue>({
  legalHold: false,
});

export function useCompanyDpaLegalHold(): CompanyDpaLegalHoldValue {
  return useContext(CompanyDpaLegalHoldContext);
}

// Rovnaký zoznam vynechaných ciest ako app/components/LegalAcceptanceGate.tsx
// (samostatná kópia, nie zdieľaná konštanta — obe komponenty majú vlastný,
// nezávisle čitateľný dôvod vynechania tých istých ciest: verejné právne
// stránky, prihlásenie/registrácia, obnova hesla, prijatie pozvánky).
const SKIP_PATH_PREFIXES = [
  "/login",
  "/invite",
  "/onboarding",
  "/reset-hesla",
  "/ochrana-osobnych-udajov",
  "/podmienky-pouzivania",
  "/cookies",
  "/dpa",
  "/subprocessors",
  "/kontakt",
];

// DÔLEŽITÉ poradie voči LegalAcceptanceGate: tento komponent sa v
// app/layout.tsx vnára DOVNÚTRA <LegalAcceptanceGate> (teda okolo toho
// istého {children}), takže obe komponenty bežia súčasne/nezávisle. Aby sa
// nikdy nezobrazili dva prekrývajúce sa full-screen modaly naraz
// nekoordinovane, tento gate používa NIŽŠÍ z-index (90) než
// LegalAcceptanceGate (100) — ak má používateľ nedoriešenú OSOBNÚ
// acceptance (Podmienky/Zásady), ten modal ju vizuálne prekryje ako
// prioritnejší; po jej potvrdení zostane tento company DPA modal (ak je
// relevantný) viditeľný bez potreby nového načítania.
const Z_INDEX = 90;

export default function CompanyDpaGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const skip = SKIP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname?.startsWith(prefix + "/")
  );

  const [status, setStatus] = useState<CompanyDpaStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirmedAuthority, setConfirmedAuthority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [employeeNoticeDismissed, setEmployeeNoticeDismissed] =
    useState(false);

  useEffect(() => {
    if (skip) {
      return;
    }

    let cancelled = false;

    async function run() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setStatus(null);
          setChecked(true);
        }
        return;
      }

      const result = await getMyCompanyDpaStatus();

      if (!cancelled) {
        setStatus(result);
        setChecked(true);
      }
    }

    run();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      setChecked(false);
      setEmployeeNoticeDismissed(false);
      run();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleConfirm() {
    if (!confirmedAuthority || !status) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const ok = await acceptCompanyDpa(status.current_dpa_version);

    if (!ok) {
      setSubmitError(
        "DPA sa nepodarilo potvrdiť. Skúste to prosím znova, alebo kontaktujte podporu, ak problém pretrváva."
      );
      setSubmitting(false);
      return;
    }

    setStatus({ ...status, has_current_acceptance: true });
    setSubmitting(false);
  }

  if (!checked || skip || !status || status.has_current_acceptance) {
    return <>{children}</>;
  }

  // REVÍZIA (štvrté kolo): iba OWNER smie DPA za firmu podpísať —
  // appková rola "admin" sama osebe nezakladá právne oprávnenie
  // uzatvárať zmluvy za firmu (rovnaká zmena ako v
  // esblu_accept_company_dpa() na DB strane, ktorá teraz DB-side
  // vyžaduje role='owner'). Admin je pre účely tohto gate v rovnakej
  // situácii ako employee: nesmie dostať možnosť DPA podpísať, iba
  // informáciu, že potvrdenie musí vykonať vlastník účtu.
  const isOwner = status.my_role === "owner";

  // Kým firma nemá platnú DPA acceptance, sme vždy v legal-hold režime —
  // táto vetva kódu (za skoro-return vyššie) sa vykoná IBA vtedy, keď
  // !status.has_current_acceptance. Sprístupňujeme to potomkom cez
  // kontext, aby stránky s vytváraním nových vozidiel/strojov/skladu/AI
  // evidencie mohli deaktivovať/skryť svoje "pridať nové" akcie —
  // pozri komentár pri CompanyDpaLegalHoldContext vyššie.
  return (
    <CompanyDpaLegalHoldContext.Provider value={{ legalHold: true }}>
      {children}

      {isOwner && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          style={{ zIndex: Z_INDEX }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <h2 className="text-2xl font-bold text-slate-900">
              Zmluva o spracúvaní osobných údajov (DPA)
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Aby vaša firma mohla v Esblu spracúvať osobné údaje tretích
              osôb (napr. v dokumentoch, fotografiách alebo evidencii),
              musíte ako vlastník firmy najprv prijať aktuálnu Zmluvu o
              spracúvaní osobných údajov v jej mene. Toto potvrdenie je
              potrebné iba raz za verziu dokumentu a je viazané na vašu
              firmu (nie iba na váš osobný účet). Kým DPA neprijmete,
              zostávajú akcie vytvárajúce nové záznamy s osobnými údajmi
              (vozidlá, stroje, sklad, AI evidencia, dokumenty) v appke
              dočasne nedostupné — bezpečné prezeranie a úprava
              existujúcich dát tým nie sú dotknuté.
            </p>

            <p className="mt-3 text-sm">
              <Link
                href="/dpa"
                target="_blank"
                className="font-semibold text-blue-700 hover:underline"
              >
                Prečítať si aktuálnu DPA (verzia {status.current_dpa_version})
              </Link>
            </p>

            <label className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={confirmedAuthority}
                onChange={(event) =>
                  setConfirmedAuthority(event.target.checked)
                }
                disabled={submitting}
              />
              <span>
                Potvrdzujem, že som oprávnený/á konať za túto firmu a v
                jej mene prijímam Zmluvu o spracúvaní osobných údajov
                (DPA), verzia {status.current_dpa_version}.
              </span>
            </label>

            {submitError && (
              <p className="mt-4 text-sm font-medium text-red-700">
                {submitError}
              </p>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!confirmedAuthority || submitting}
              className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting ? "Ukladám..." : "Potvrdiť DPA v mene firmy"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={submitting}
              className="mt-3 w-full text-center text-sm font-semibold text-slate-500 hover:underline"
            >
              Odhlásiť sa
            </button>
          </div>
        </div>
      )}

      {!isOwner && !employeeNoticeDismissed && (
        <div
          className="fixed inset-x-0 bottom-0 flex justify-center p-4"
          style={{ zIndex: Z_INDEX }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-2xl">
            <p className="text-sm font-semibold text-amber-950">
              Účet vašej firmy čaká na potvrdenie DPA vlastníkom účtu.
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              Zmluvu o spracúvaní osobných údajov musí v mene firmy
              potvrdiť jej vlastník (owner) — administrátorské ani iné
              oprávnenia v appke na to nestačia. Kým sa tak nestane,
              niektoré funkcie (napr. nahrávanie nových dokumentov, AI
              evidencie, vozidiel, strojov alebo skladových položiek) sú
              dočasne nedostupné; existujúce dáta si môžete naďalej
              prezerať.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setEmployeeNoticeDismissed(true)}
                className="rounded-xl bg-amber-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
              >
                Rozumiem
              </button>
              <Link
                href="/dpa"
                target="_blank"
                className="rounded-xl border border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100"
              >
                Zobraziť DPA
              </Link>
            </div>
          </div>
        </div>
      )}
    </CompanyDpaLegalHoldContext.Provider>
  );
}
