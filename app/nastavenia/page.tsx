"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NastaveniaPage() {
  const [userId, setUserId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);

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
    loadSettings(session.user.id);
  }

  async function loadSettings(currentUserId: string) {
    const { data } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", currentUserId)
      .limit(1)
      .single();

    if (data) {
      setCompanyName(data.company_name || "");
    }
  }

  async function saveSettings() {
    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    setLoading(true);

    const { data } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", userId)
      .limit(1);

    if (data && data.length > 0) {
      await supabase
        .from("settings")
        .update({
          company_name: companyName,
        })
        .eq("id", data[0].id)
        .eq("user_id", userId);
    } else {
      await supabase.from("settings").insert({
        user_id: userId,
        company_name: companyName,
      });
    }

    setLoading(false);
    alert("Nastavenia boli uložené.");
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
 <h1 className="text-4xl font-bold text-white drop-shadow-lg"> Nastavenia</h1>
</div>

      <div className="mt-8 max-w-2xl rounded-3xl border border-white/20 bg-white/45 p-8 shadow-lg backdrop-blur-xl">
        <h2 className="text-2xl font-bold text-slate-900">Firma</h2>

        <div className="mt-6">
          <label className="mb-2 block font-semibold">Názov firmy</label>

          <input
            className="w-full rounded-xl border p-3"
            placeholder="Napr. Moja firma s.r.o."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>

        <button
          onClick={saveSettings}
          disabled={loading}
          className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Ukladám..." : "💾 Uložiť"}
        </button>
      </div>
    </main>
  );
}