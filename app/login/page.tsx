"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
  email: normalizedEmail,
  password,
  options: {
    emailRedirectTo: "https://esblu.com/login",
  },
});

    setLoading(false);

    if (error) {
      alert("Registrácia sa nepodarila: " + error.message);
      return;
    }

    setPassword("");
    setConfirmPassword("");

    if (data.session) {
      alert("Účet bol vytvorený. Teraz si prihlásený.");
      router.push("/");
      router.refresh();
      return;
    }

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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-slate-900">
          {mode === "login" ? "Prihlásenie" : "Registrácia firmy"}
        </h1>

        <p className="mt-2 text-slate-500">
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

        <button
  type="button"
  onClick={mode === "login" ? login : register}
  disabled={loading}
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
          className="mt-3 w-full rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          {mode === "login"
            ? "Nemáš účet? Registrovať firmu"
            : "Už máš účet? Prihlásiť sa"}
        </button>
      </div>
    </main>
  );
}