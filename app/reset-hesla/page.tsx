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
    <main className="app-shell-bg flex min-h-screen items-center justify-center p-6">
      <div className="surface-card w-full max-w-md p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-primary">
          Nové heslo
        </h1>

        <p className="mt-2 text-secondary">
          Zadaj nové heslo pre svoj účet Esblu.
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nové heslo"
            className="input-dark w-full p-3"
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
            className="input-dark w-full p-3"
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
          className="btn-primary mt-6 w-full px-6 py-3"
        >
          {loading ? "Mením heslo..." : "Nastaviť nové heslo"}
        </button>

        {!recoveryReady && (
          <p className="mt-4 text-center text-sm text-muted-esblu">
            Čakám na overenie odkazu na obnovu hesla...
          </p>
        )}
      </div>
    </main>
  );
}