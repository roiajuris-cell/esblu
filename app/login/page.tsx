"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureMyOwnerCompany } from "@/lib/company";
import { acceptLegalDocumentAtRegistration } from "@/lib/legal-acceptance";
import { REQUIRED_ACCEPTANCE_DOCUMENTS } from "@/lib/legal-config";

// DÔLEŽITÉ: táto stránka slúži AJ existujúcim používateľom (owner, admin,
// employee) na bežné prihlásenie — login() preto NIKDY nesmie volať
// ensureMyOwnerCompany(). Keby ju volal, pozvaný employee/admin, ktorý sa
// omylom prihlási tu namiesto prijatia pozvánky na /invite/[token], by si
// automaticky založil vlastnú owner company a znemožnil by si tým prijatie
// pôvodnej pozvánky (esblu_accept_company_invite by následne zlyhala s
// ESBLU_ALREADY_HAS_ACTIVE_MEMBERSHIP).
//
// register() SMIE volať ensureMyOwnerCompany() iba v prípade, že Supabase
// vráti session OKAMŽITE (email confirmation vypnuté) — vtedy sme stále
// vnútri explicitného "Registrovať firmu" klik-handlera, čiže intent je
// jednoznačný z volajúcej funkcie, nie odvodený z toho, či user má/nemá
// membership.
//
// Keď session okamžite nepríde (čaká sa na potvrdenie e-mailu), owner-
// registration intent sa NEPRENÁŠA cez /login (tá slúži univerzálne aj pre
// bežný login) — namiesto toho signUp() smeruje emailRedirectTo na
// samostatnú, explicitnú route /onboarding/company, ktorá jediná (mimo
// register() vyššie) smie zavolať bootstrap. Pozri
// app/onboarding/company/page.tsx.

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  function validateEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function login() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      alert("Zadaj platnú e-mailovú adresu.");
      return;
    }

    if (!password) {
      alert("Zadaj heslo.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    setLoading(false);

    if (error) {
      alert("Prihlásenie sa nepodarilo. Skontroluj e-mail a heslo.");
      return;
    }

    // Zámerne ŽIADNY bootstrap tu — bežné prihlásenie iba pokračuje podľa
    // existujúceho membershipu používateľa (alebo jeho absencie). Pozri
    // komentár nad komponentom.
    router.push("/");
    router.refresh();
  }

  async function register() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      alert("Zadaj platnú e-mailovú adresu.");
      return;
    }

    if (password.length < 8) {
      alert("Heslo musí mať minimálne 8 znakov.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Heslá sa nezhodujú.");
      return;
    }

    if (!agreedTerms || !agreedPrivacy) {
      alert(
        "Pred registráciou musíš súhlasiť s Podmienkami používania a potvrdiť oboznámenie sa so Zásadami ochrany osobných údajov."
      );
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
  email: normalizedEmail,
  password,
  options: {
    // NIE "/login" — /login slúži aj bežnému loginu existujúcich
    // používateľov a nesmie z toho odvodzovať owner-registration intent.
    // /onboarding/company je explicitná, na tento účel vyhradená route.
    emailRedirectTo: "https://esblu.com/onboarding/company",
  },
});

    if (error) {
      setLoading(false);
      alert("Registrácia sa nepodarila: " + error.message);
      return;
    }

    setPassword("");
    setConfirmPassword("");

    if (data.session) {
      // Explicitný owner-registration flow — session prišla hneď (email
      // confirmation je vypnuté alebo bolo už predtým potvrdené).
      await ensureMyOwnerCompany();

      // Zápis acceptance hneď, keď už máme session — checkboxy boli
      // povinne odškrtnuté vyššie. Ak session príde až po potvrdení
      // e-mailu (branch nižšie), acceptance sa nezapíše tu, ale
      // LegalAcceptanceGate ju vyžiada pri prvom prihlásení po potvrdení
      // (fail-safe, nie "dôveruj a zabudni").
      await Promise.all(
        REQUIRED_ACCEPTANCE_DOCUMENTS.map((doc) =>
          acceptLegalDocumentAtRegistration(doc.type, doc.version)
        )
      );

      setLoading(false);
      alert("Účet bol vytvorený. Teraz si prihlásený.");
      router.push("/");
      router.refresh();
      return;
    }

    setLoading(false);

    alert(
      "Registrácia prebehla úspešne. Skontroluj svoj e-mail a potvrď registráciu."
    );

    setMode("login");
  }
async function resetPassword() {
  const normalizedEmail = email.trim().toLowerCase();

  if (!validateEmail(normalizedEmail)) {
    alert("Najprv zadaj platnú e-mailovú adresu.");
    return;
  }

  setResetLoading(true);

  const { error } = await supabase.auth.resetPasswordForEmail(
    normalizedEmail,
    {
      redirectTo: "https://esblu.com/reset-hesla",
    }
  );

  setResetLoading(false);

  if (error) {
    alert("E-mail na obnovu hesla sa nepodarilo odoslať: " + error.message);
    return;
  }

  alert(
    "Odkaz na vytvorenie nového hesla bol odoslaný. Skontroluj aj priečinok Spam."
  );
}
  function switchMode() {
    setMode((currentMode) =>
      currentMode === "login" ? "register" : "login"
    );

    setPassword("");
    setConfirmPassword("");
  }

  return (
    <main className="app-shell-bg flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface-1 p-8 shadow">
        <h1 className="text-3xl font-bold text-primary">
          {mode === "login" ? "Prihlásenie" : "Registrácia firmy"}
        </h1>

        <p className="mt-2 text-muted-esblu">
          {mode === "login"
            ? "Prihlás sa do aplikácie Esblu."
            : "Vytvor nový účet pre svoju firmu."}
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="E-mail"
            autoComplete="email"
            className="w-full rounded-xl border p-3"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Heslo"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            className="w-full rounded-xl border p-3"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
          />

          {mode === "register" && (
            <input
              type="password"
              placeholder="Potvrdenie hesla"
              autoComplete="new-password"
              className="w-full rounded-xl border p-3"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              disabled={loading}
            />
          )}
        </div>

        {mode === "register" && (
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 text-sm leading-6 text-secondary">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={agreedTerms}
                onChange={(event) => setAgreedTerms(event.target.checked)}
                disabled={loading}
              />
              <span>
                Súhlasím s{" "}
                <Link
                  href="/podmienky-pouzivania"
                  target="_blank"
                  className="font-semibold text-blue-700 hover:underline"
                >
                  Podmienkami používania
                </Link>
                .
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm leading-6 text-secondary">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={agreedPrivacy}
                onChange={(event) => setAgreedPrivacy(event.target.checked)}
                disabled={loading}
              />
              <span>
                Potvrdzujem, že som sa oboznámil/a so{" "}
                <Link
                  href="/ochrana-osobnych-udajov"
                  target="_blank"
                  className="font-semibold text-blue-700 hover:underline"
                >
                  Zásadami ochrany osobných údajov
                </Link>
                .
              </span>
            </label>
          </div>
        )}

        <button
  type="button"
  onClick={mode === "login" ? login : register}
  disabled={
    loading ||
    (mode === "register" && (!agreedTerms || !agreedPrivacy))
  }
  className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
>
  {loading
    ? "Pracujem..."
    : mode === "login"
      ? "Prihlásiť sa"
      : "Vytvoriť účet"}
</button>

{mode === "login" && (
  <button
    type="button"
    onClick={resetPassword}
    disabled={loading || resetLoading}
    className="mt-3 w-full text-center text-sm font-semibold text-blue-700 hover:underline disabled:text-gray-400"
  >
    {resetLoading
      ? "Odosielam odkaz..."
      : "Zabudol si heslo?"}
  </button>
)}

        <button
          type="button"
          onClick={switchMode}
          disabled={loading}
          className="mt-3 w-full rounded-xl border border-subtle px-6 py-3 font-semibold text-secondary hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          {mode === "login"
            ? "Nemáš účet? Registrovať firmu"
            : "Už máš účet? Prihlásiť sa"}
        </button>

        <nav
          aria-label="Právne a kontaktné informácie"
          className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-subtle pt-5 text-center text-xs font-medium text-secondary"
        >
          <Link href="/ochrana-osobnych-udajov" className="hover:text-blue-700 hover:underline">
            Ochrana osobných údajov
          </Link>
          <Link href="/podmienky-pouzivania" className="hover:text-blue-700 hover:underline">
            Podmienky používania
          </Link>
          <Link href="/cookies" className="hover:text-blue-700 hover:underline">
            Cookies
          </Link>
          <Link href="/kontakt" className="hover:text-blue-700 hover:underline">
            Kontakt
          </Link>
        </nav>
      </div>
    </main>
  );
}
