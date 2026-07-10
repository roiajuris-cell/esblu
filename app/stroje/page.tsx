"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function StrojePage() {
  const [userId, setUserId] = useState("");
  const [machines, setMachines] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyMachine = {
    name: "",
    category: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    year: "",
    purchase_date: "",
    status: "",
    notes: "",
  };

  const [machine, setMachine] = useState(emptyMachine);

  useEffect(() => {
    checkUser();
  }, []);

  function photoUrl(path: string) {
    const { data } = supabase.storage
      .from("machine-photos")
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async function checkUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    setUserId(session.user.id);
    loadMachines(session.user.id);
  }

  async function loadMachines(currentUserId: string = userId) {
    if (!currentUserId) return;

    const { data: machinesData, error } = await supabase
      .from("machines")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Chyba pri načítaní strojov: " + error.message);
      return;
    }

    const machineIds = (machinesData || []).map((m) => m.id);

    let photosData: any[] = [];

    if (machineIds.length > 0) {
      const { data } = await supabase
        .from("machine_photos")
        .select("*")
        .in("machine_id", machineIds)
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      photosData = data || [];
    }

    const machinesWithPhotos = (machinesData || []).map((item) => {
      const firstPhoto = photosData.find(
        (photo) => photo.machine_id === item.id
      );

      return {
        ...item,
        first_photo_url: firstPhoto ? photoUrl(firstPhoto.file_path) : null,
      };
    });

    setMachines(machinesWithPhotos);
  }

  function updateMachine(key: string, value: string) {
    setMachine((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveMachine() {
    if (!machine.name) {
      alert("Vyplň názov stroja.");
      return;
    }

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    setIsSaving(true);

    const payload = {
      user_id: userId,
      name: machine.name || null,
      category: machine.category || null,
      manufacturer: machine.manufacturer || null,
      model: machine.model || null,
      serial_number: machine.serial_number || null,
      year: machine.year ? Number(machine.year) : null,
      purchase_date: machine.purchase_date || null,
      status: machine.status || null,
      notes: machine.notes || null,
    };

    const { error } = editingId
      ? await supabase
          .from("machines")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId)
      : await supabase.from("machines").insert(payload);

    setIsSaving(false);

    if (error) {
      alert("Chyba pri ukladaní stroja: " + error.message);
      return;
    }

    setMachine(emptyMachine);
    setEditingId(null);
    setShowForm(false);
    loadMachines();
  }

  function editMachine(item: any) {
    setEditingId(item.id);
    setShowForm(true);

    setMachine({
      name: item.name || "",
      category: item.category || "",
      manufacturer: item.manufacturer || "",
      model: item.model || "",
      serial_number: item.serial_number || "",
      year: item.year || "",
      purchase_date: item.purchase_date || "",
      status: item.status || "",
      notes: item.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteMachine(id: string) {
    const confirmed = confirm("Naozaj chceš vymazať tento stroj?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("machines")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      alert("Chyba pri mazaní stroja: " + error.message);
      return;
    }

    loadMachines();
  }

  function cancelEdit() {
    setEditingId(null);
    setMachine(emptyMachine);
    setShowForm(false);
  }

  return (
    <main
  className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
  style={{ backgroundImage: "url('/images/background-dark.png')" }}
>
      <div className="flex items-center gap-4">
  <img
    src="/images/excavator.png"
    alt="Stroje"
    className="h-20 w-20 object-contain"
  />
  <h1 className="text-4xl font-bold text-white drop-shadow-lg">Stroje</h1>
</div>

      <p className="mt-4 text-white/80">
        Evidencia firemných strojov a techniky.
      </p>

      <button
        onClick={() => {
          setShowForm(!showForm);
          setEditingId(null);
          setMachine(emptyMachine);
        }}
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
      >
        ➕ Pridať stroj
      </button>

      {showForm && (
        <div className="mt-8 rounded-2xl bg-white/45 border border-white/20 backdrop-blur-xl p-6 shadow-lg">
          <h2 className="mb-6 text-2xl font-bold">
            {editingId ? "Upraviť stroj" : "Pridať nový stroj"}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              placeholder="Názov stroja"
              className="rounded-xl border p-3"
              value={machine.name}
              onChange={(e) => updateMachine("name", e.target.value)}
            />

            <input
              placeholder="Kategória"
              className="rounded-xl border p-3"
              value={machine.category}
              onChange={(e) => updateMachine("category", e.target.value)}
            />

            <input
              placeholder="Výrobca"
              className="rounded-xl border p-3"
              value={machine.manufacturer}
              onChange={(e) => updateMachine("manufacturer", e.target.value)}
            />

            <input
              placeholder="Model"
              className="rounded-xl border p-3"
              value={machine.model}
              onChange={(e) => updateMachine("model", e.target.value)}
            />

            <input
              placeholder="Sériové číslo"
              className="rounded-xl border p-3"
              value={machine.serial_number}
              onChange={(e) => updateMachine("serial_number", e.target.value)}
            />

            <input
              type="number"
              placeholder="Rok výroby"
              className="rounded-xl border p-3"
              value={machine.year}
              onChange={(e) => updateMachine("year", e.target.value)}
            />

            <input
              type="date"
              className="rounded-xl border p-3"
              value={machine.purchase_date}
              onChange={(e) => updateMachine("purchase_date", e.target.value)}
            />

            <input
              placeholder="Stav / status"
              className="rounded-xl border p-3"
              value={machine.status}
              onChange={(e) => updateMachine("status", e.target.value)}
            />
          </div>

          <textarea
            placeholder="Poznámky"
            className="mt-4 w-full rounded-xl border p-3"
            value={machine.notes}
            onChange={(e) => updateMachine("notes", e.target.value)}
          />

          <div className="mt-5 flex gap-3">
            <button
              onClick={saveMachine}
              disabled={isSaving}
              className="rounded-xl bg-green-600 px-6 py-3 text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {isSaving
                ? "Ukladám..."
                : editingId
                ? "💾 Uložiť zmeny"
                : "💾 Uložiť stroj"}
            </button>

            {editingId && (
              <button
                onClick={cancelEdit}
                className="rounded-xl bg-slate-300 px-6 py-3 text-slate-900 hover:bg-slate-400"
              >
                Zrušiť úpravu
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-4 text-2xl font-bold">Uložené stroje</h2>

        {machines.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 shadow">
            <p className="text-slate-500">
              Zatiaľ nie je uložený žiadny stroj.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {machines.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border bg-white shadow-sm"
              >
                {item.first_photo_url ? (
                  <img
                    src={item.first_photo_url}
                    alt={item.name || "Fotografia stroja"}
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-56 w-full items-center justify-center bg-slate-200 text-slate-500">
                    Bez fotografie
                  </div>
                )}

                <div className="p-6">
                  <h3 className="text-2xl font-bold">
                    {item.name || "Bez názvu"}
                  </h3>

                  <p className="mt-2 text-slate-600">
                    Kategória: {item.category || "—"}
                  </p>
                  <p className="text-slate-600">
                    Výrobca: {item.manufacturer || "—"}
                  </p>
                  <p className="text-slate-600">
                    Model: {item.model || "—"}
                  </p>
                  <p className="text-slate-600">
                    Sériové číslo: {item.serial_number || "—"}
                  </p>
                  <p className="text-slate-600">
                    Rok výroby: {item.year || "—"}
                  </p>
                  <p className="text-slate-600">
                    Stav: {item.status || "—"}
                  </p>

                  <div className="mt-5 flex gap-3">
                    <Link
                      href={`/stroje/${item.id}`}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                    >
                      Detail
                    </Link>

                    <button
                      onClick={() => editMachine(item)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      Upraviť
                    </button>

                    <button
                      onClick={() => deleteMachine(item.id)}
                      className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                    >
                      Vymazať
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}