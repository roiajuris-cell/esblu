"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetHeslaPage() {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION"
      ) {
        setRecoveryReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setRecoveryReady(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function updatePassword() {
    if (!recoveryReady) {
      alert(
        "Odkaz na obnovu hesla nie je platný alebo jeho platnosť vypršala."
      );
      return;
    }

    if (newPassword.length < 8) {
      alert("Nové heslo musí mať minimálne 8 znakov.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert("Nové heslá sa nezhodujú.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (error) {
      alert("Heslo sa nepodarilo zmeniť: " + error.message);
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");

    alert("Heslo bolo úspešne zmenené. Teraz sa môžeš prihlásiť.");

    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-cover bg-center p-6"
      style={{
        backgroundImage: "url('/images/background-dark.png')",
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/90 p-8 shadow-xl backdrop-blur-xl">
        <h1 className="text-3xl font-bold text-slate-900">
          Nové heslo
        </h1>

        <p className="mt-2 text-slate-600">
          Zadaj nové heslo pre svoj účet Esblu.
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nové heslo"
            className="w-full rounded-xl border p-3"
            value={newPassword}
            onChange={(event) =>
              setNewPassword(event.target.value)
            }
            disabled={loading}
          />

          <input
            type="password"
            autoComplete="new-password"
            placeholder="Potvrdenie nového hesla"
            className="w-full rounded-xl border p-3"
            value={confirmNewPassword}
            onChange={(event) =>
              setConfirmNewPassword(event.target.value)
            }
            disabled={loading}
          />
        </div>

        <button
          type="button"
          onClick={updatePassword}
          disabled={loading || !recoveryReady}
          className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Mením heslo..." : "Nastaviť nové heslo"}
        </button>

        {!recoveryReady && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Čakám na overenie odkazu na obnovu hesla...
          </p>
        )}
      </div>
    </main>
  );
}