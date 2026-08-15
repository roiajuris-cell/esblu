"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  acceptLegalDocumentAtGate,
  getMyPendingLegalAcceptances,
  type PendingLegalAcceptance,
} from "@/lib/legal-acceptance";

// Cesty, na ktorých sa blokujúci modal NIKDY nezobrazuje — verejné právne
// stránky (musia byť čitateľné aj bez potvrdenia), prihlásenie/registrácia,
// obnova hesla a prijatie pozvánky (pozvaný používateľ ešte nemusí mať
// membership a nesmie byť blokovaný skôr, než sa vôbec dostane do appky).
// Poznámka: samotné /login nastavuje session bez volania tohto gate — ale
// zaraďujeme ho tu zámerne pre istotu, keby sa RootLayout v budúcnosti
// zmenil.
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

export default function LegalAcceptanceGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const skip = SKIP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname?.startsWith(prefix + "/")
  );

  const [pending, setPending] = useState<PendingLegalAcceptance[]>([]);
  const [checked, setChecked] = useState(false);
  const [confirmedTerms, setConfirmedTerms] = useState(false);
  const [confirmedPrivacy, setConfirmedPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (skip) {
      // Na verejných/pred-prihlasovacích cestách sa gate vôbec nespúšťa —
      // `mustBlock` nižšie je aj tak vždy false, keď skip=true, takže
      // netreba meniť `checked` (vyhýba sa synchrónnemu setState priamo v
      // tele efektu).
      return;
    }

    let cancelled = false;

    async function run() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setPending([]);
          setChecked(true);
        }
        return;
      }

      const result = await getMyPendingLegalAcceptances();

      if (!cancelled) {
        setPending(result);
        setChecked(true);
      }
    }

    run();

    // Znovu skontrolovať pri každej zmene prihlásenia (login/logout v inej
    // záložke a pod.), nie iba pri prvom mounte.
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      setChecked(false);
      run();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleConfirm() {
    if (!confirmedTerms || !confirmedPrivacy) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      for (const doc of pending) {
        const ok = await acceptLegalDocumentAtGate(
          doc.document_type,
          doc.version
        );

        if (!ok) {
          throw new Error("save_failed");
        }
      }

      setPending([]);
    } catch {
      setSubmitError(
        "Potvrdenie sa nepodarilo uložiť. Skús to prosím znova."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const mustBlock = !skip && checked && pending.length > 0;

  const termsDoc = pending.find((doc) => doc.document_type === "terms");
  const privacyDoc = pending.find(
    (doc) => doc.document_type === "privacy_policy"
  );

  return (
    <>
      {children}

      {mustBlock && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-surface-1 p-6 shadow-2xl sm:p-8">
            <h2 className="text-2xl font-bold text-primary">
              Aktualizované právne dokumenty
            </h2>

            <p className="mt-3 text-sm leading-6 text-secondary">
              Aby ste mohli pokračovať v používaní Esblu, potvrďte prosím
              nasledujúce aktuálne dokumenty. Toto potvrdenie je potrebné iba
              raz a je viazané na váš účet.
            </p>

            <div className="mt-6 space-y-4">
              {termsDoc && (
                <label className="flex items-start gap-3 rounded-xl border border-subtle p-4 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={confirmedTerms}
                    onChange={(event) =>
                      setConfirmedTerms(event.target.checked)
                    }
                    disabled={submitting}
                  />
                  <span>
                    Súhlasím s{" "}
                    <Link
                      href="/podmienky-pouzivania"
                      target="_blank"
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      Podmienkami používania
                    </Link>{" "}
                    (verzia {termsDoc.version}).
                  </span>
                </label>
              )}

              {privacyDoc && (
                <label className="flex items-start gap-3 rounded-xl border border-subtle p-4 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={confirmedPrivacy}
                    onChange={(event) =>
                      setConfirmedPrivacy(event.target.checked)
                    }
                    disabled={submitting}
                  />
                  <span>
                    Potvrdzujem, že som sa oboznámil/a so{" "}
                    <Link
                      href="/ochrana-osobnych-udajov"
                      target="_blank"
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      Zásadami ochrany osobných údajov
                    </Link>{" "}
                    (verzia {privacyDoc.version}).
                  </span>
                </label>
              )}
            </div>

            {submitError && (
              <p className="mt-4 text-sm font-medium text-red-700">
                {submitError}
              </p>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!confirmedTerms || !confirmedPrivacy || submitting}
              className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting ? "Ukladám..." : "Potvrdiť a pokračovať"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={submitting}
              className="mt-3 w-full text-center text-sm font-semibold text-muted-esblu hover:underline"
            >
              Odhlásiť sa
            </button>
          </div>
        </div>
      )}
    </>
  );
}
