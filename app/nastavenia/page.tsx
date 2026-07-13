"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NastaveniaPage() {
  const [userId, setUserId] = useState("");
  const [companyName, setCompanyName] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    setUserId(session.user.id);
    await loadSettings(session.user.id);
  }

  async function loadSettings(currentUserId: string) {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", currentUserId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Chyba pri načítaní nastavení:", error);
      return;
    }

    if (data) {
      setCompanyName(data.company_name || "");
    }
  }

  async function saveSettings() {
    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    setSettingsLoading(true);

    const { data, error: findError } = await supabase
      .from("settings")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (findError) {
      setSettingsLoading(false);
      alert("Nastavenia sa nepodarilo načítať.");
      return;
    }

    if (data) {
      const { error } = await supabase
        .from("settings")
        .update({
          company_name: companyName.trim(),
        })
        .eq("id", data.id)
        .eq("user_id", userId);

      if (error) {
        setSettingsLoading(false);
        alert("Nastavenia sa nepodarilo uložiť: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("settings").insert({
        user_id: userId,
        company_name: companyName.trim(),
      });

      if (error) {
        setSettingsLoading(false);
        alert("Nastavenia sa nepodarilo uložiť: " + error.message);
        return;
      }
    }

    setSettingsLoading(false);
    alert("Nastavenia boli uložené.");
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      alert("Nové heslo musí mať minimálne 8 znakov.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert("Nové heslá sa nezhodujú.");
      return;
    }

    setPasswordLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setPasswordLoading(false);

    if (error) {
      alert("Heslo sa nepodarilo zmeniť: " + error.message);
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");

    alert("Heslo bolo úspešne zmenené.");
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
      style={{ backgroundImage: "url('/images/background-dark.png')" }}
    >
      <div className="flex items-center gap-4">
        <img
          src="/images/settings.png"
          alt="Nastavenia"
          className="h-20 w-20 object-contain"
        />

        <h1 className="text-4xl font-bold text-white drop-shadow-lg">
          Nastavenia
        </h1>
      </div>

      <div className="mt-8 max-w-2xl space-y-6">
        <section className="rounded-3xl border border-white/20 bg-white/45 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-slate-900">
            Firma
          </h2>

          <div className="mt-6">
            <label className="mb-2 block font-semibold">
              Názov firmy
            </label>

            <input
              className="w-full rounded-xl border p-3"
              placeholder="Napr. Moja firma s.r.o."
              value={companyName}
              onChange={(event) =>
                setCompanyName(event.target.value)
              }
              disabled={settingsLoading}
            />
          </div>

          <button
            type="button"
            onClick={saveSettings}
            disabled={settingsLoading}
            className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {settingsLoading ? "Ukladám..." : "💾 Uložiť"}
          </button>
        </section>

        <section className="rounded-3xl border border-white/20 bg-white/45 p-8 shadow-lg backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-slate-900">
            Zmena hesla
          </h2>

          <p className="mt-2 text-sm text-slate-700">
            Nové heslo musí mať minimálne 8 znakov.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block font-semibold">
                Nové heslo
              </label>

              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl border p-3"
                placeholder="Zadaj nové heslo"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                disabled={passwordLoading}
              />
            </div>

            <div>
              <label className="mb-2 block font-semibold">
                Potvrdenie nového hesla
              </label>

              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl border p-3"
                placeholder="Zadaj nové heslo znova"
                value={confirmNewPassword}
                onChange={(event) =>
                  setConfirmNewPassword(event.target.value)
                }
                disabled={passwordLoading}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={changePassword}
            disabled={passwordLoading}
            className="mt-8 rounded-xl bg-slate-900 px-6 py-3 text-white hover:bg-slate-800 disabled:bg-gray-400"
          >
            {passwordLoading
              ? "Mením heslo..."
              : "Zmeniť heslo"}
          </button>
        </section>
      </div>
    </main>
  );
}