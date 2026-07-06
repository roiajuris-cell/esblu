"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert("Chyba pri prihlásení: " + error.message);
      return;
    }

    router.push("/");
  }

  async function register() {
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert("Chyba pri registrácii: " + error.message);
      return;
    }

    alert("Registrácia prebehla. Teraz sa môžeš prihlásiť.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-slate-900">Prihlásenie</h1>

        <p className="mt-2 text-slate-500">
          Prihlás sa do aplikácie Esblu.
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="E-mail"
            className="w-full rounded-xl border p-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Heslo"
            className="w-full rounded-xl border p-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={login}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Pracujem..." : "Prihlásiť sa"}
        </button>

        <button
          onClick={register}
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-slate-900 px-6 py-3 text-white hover:bg-slate-800 disabled:bg-gray-400"
        >
          Vytvoriť účet
        </button>
      </div>
    </main>
  );
}