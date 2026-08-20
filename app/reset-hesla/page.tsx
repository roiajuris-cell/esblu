"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function ResetHeslaPage() {
  const router = useRouter();
  const { t } = useLocale();

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
      alert(t("auth.resetPassword.linkInvalid"));
      return;
    }

    if (newPassword.length < 8) {
      alert(t("settings.password.tooShort"));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert(t("settings.password.mismatch"));
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (error) {
      alert(t("settings.password.changeFailedPrefix", { message: error.message }));
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");

    alert(t("auth.resetPassword.updatedRedirect"));

    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  return (
    <main className="app-shell-bg flex min-h-screen items-center justify-center p-6">
      <div className="surface-card w-full max-w-md p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-primary">
          {t("auth.resetPassword.pageTitle")}
        </h1>

        <p className="mt-2 text-secondary">
          {t("auth.resetPassword.pageSubtitle")}
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("auth.resetPassword.newPassword")}
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
            placeholder={t("auth.resetPassword.confirmPassword")}
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
          {loading
            ? t("settings.password.changing")
            : t("auth.resetPassword.submitNew")}
        </button>

        {!recoveryReady && (
          <p className="mt-4 text-center text-sm text-muted-esblu">
            {t("auth.resetPassword.waitingForLink")}
          </p>
        )}
      </div>
    </main>
  );
}