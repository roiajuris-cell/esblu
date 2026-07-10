"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SkladPage() {
  const [userId, setUserId] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyItem = {
    name: "",
    category: "",
    quantity: "",
    unit: "",
    min_quantity: "",
    location: "",
    notes: "",
  };

  const [item, setItem] = useState(emptyItem);

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
    loadItems(session.user.id);
  }

  async function loadItems(currentUserId: string = userId) {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      alert("Chyba pri načítaní skladu: " + error.message);
      return;
    }

    setItems(data || []);
  }

  function updateItem(key: string, value: string) {
    setItem((prev) => ({ ...prev, [key]: value }));
  }

  async function saveItem() {
    if (!item.name) {
      alert("Vyplň názov položky.");
      return;
    }

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    setIsSaving(true);

    const payload = {
      user_id: userId,
      name: item.name || null,
      category: item.category || null,
      quantity: item.quantity ? Number(item.quantity) : 0,
      unit: item.unit || null,
      min_quantity: item.min_quantity ? Number(item.min_quantity) : null,
      location: item.location || null,
      notes: item.notes || null,
    };

    const { error } = editingId
      ? await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId)
      : await supabase.from("inventory_items").insert(payload);

    setIsSaving(false);

    if (error) {
      alert("Chyba pri ukladaní položky: " + error.message);
      return;
    }

    setItem(emptyItem);
    setEditingId(null);
    setShowForm(false);
    loadItems();
  }

  function editItem(row: any) {
    setEditingId(row.id);
    setShowForm(true);

    setItem({
      name: row.name || "",
      category: row.category || "",
      quantity: row.quantity || "",
      unit: row.unit || "",
      min_quantity: row.min_quantity || "",
      location: row.location || "",
      notes: row.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteItem(id: string) {
    const confirmed = confirm("Naozaj chceš vymazať túto skladovú položku?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      alert("Chyba pri mazaní položky: " + error.message);
      return;
    }

    loadItems();
  }

  function isLowStock(row: any) {
    if (row.min_quantity === null || row.min_quantity === undefined) return false;
    return Number(row.quantity || 0) <= Number(row.min_quantity);
  }

  return (
    <main
  className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
  style={{ backgroundImage: "url('/images/background-dark.png')" }}
>
      <div className="flex items-center gap-4">
  <img
    src="/images/warehouse.png"
    alt="Sklad"
    className="h-20 w-20 object-contain"
  />
  <h1 className="text-4xl font-bold text-white drop-shadow-lg">
  Sklad
</h1>
</div>

      <p className="mt-4 text-white/80">
        Evidencia náradia, materiálu a skladových zásob.
      </p>

      <button
        onClick={() => {
          setShowForm(!showForm);
          setEditingId(null);
          setItem(emptyItem);
        }}
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
      >
        ➕ Pridať položku
      </button>

      {showForm && (
        <div className="mt-8 rounded-2xl border border-white/20 bg-white/45 p-6 shadow-lg backdrop-blur-xl">
          <h2 className="mb-6 text-2xl font-bold">
            {editingId ? "Upraviť položku" : "Pridať položku"}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              placeholder="Názov položky"
              className="rounded-xl border p-3"
              value={item.name}
              onChange={(e) => updateItem("name", e.target.value)}
            />

            <input
              placeholder="Kategória"
              className="rounded-xl border p-3"
              value={item.category}
              onChange={(e) => updateItem("category", e.target.value)}
            />

            <input
              type="number"
              placeholder="Množstvo"
              className="rounded-xl border p-3"
              value={item.quantity}
              onChange={(e) => updateItem("quantity", e.target.value)}
            />

            <input
              placeholder="Jednotka (ks, m, kg...)"
              className="rounded-xl border p-3"
              value={item.unit}
              onChange={(e) => updateItem("unit", e.target.value)}
            />

            <input
              type="number"
              placeholder="Minimálne množstvo"
              className="rounded-xl border p-3"
              value={item.min_quantity}
              onChange={(e) => updateItem("min_quantity", e.target.value)}
            />

            <input
              placeholder="Umiestnenie"
              className="rounded-xl border p-3"
              value={item.location}
              onChange={(e) => updateItem("location", e.target.value)}
            />
          </div>

          <textarea
            placeholder="Poznámky"
            className="mt-4 w-full rounded-xl border p-3"
            value={item.notes}
            onChange={(e) => updateItem("notes", e.target.value)}
          />

          <button
            onClick={saveItem}
            disabled={isSaving}
            className="mt-5 rounded-xl bg-green-600 px-6 py-3 text-white hover:bg-green-700 disabled:bg-gray-400"
          >
            {isSaving
              ? "Ukladám..."
              : editingId
              ? "💾 Uložiť zmeny"
              : "💾 Uložiť položku"}
          </button>
        </div>
      )}

        <div className="mt-10">
  <h2 className="mb-4 text-2xl font-bold text-white drop-shadow-lg">
    Uložené položky
  </h2>

        {items.length === 0 ? (
         <div className="rounded-2xl border border-white/20 bg-white/45 p-6 shadow-lg backdrop-blur-xl"> 
           <p className="font-medium text-white/90 drop-shadow"> Zatiaľ nie je uložená žiadna položka.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {items.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold">
                      {row.name || "Bez názvu"}
                    </h3>

                    <p className="mt-2 text-slate-600">
                      Kategória: {row.category || "—"}
                    </p>
                  </div>

                  {isLowStock(row) && (
                    <div className="rounded-xl bg-orange-100 px-4 py-2 font-bold text-orange-700">
                      Nízky stav
                    </div>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <p><b>Množstvo:</b> {row.quantity ?? 0} {row.unit || ""}</p>
                  <p><b>Minimum:</b> {row.min_quantity ?? "—"} {row.unit || ""}</p>
                  <p><b>Umiestnenie:</b> {row.location || "—"}</p>
                  <p><b>Poznámky:</b> {row.notes || "—"}</p>
                </div>

                <div className="mt-5 flex gap-3">
                  <Link
                    href={`/sklad/${row.id}`}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                  >
                    Detail
                  </Link>

                  <button
                    onClick={() => editItem(row)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-white"
                  >
                    Upraviť
                  </button>

                  <button
                    onClick={() => deleteItem(row.id)}
                    className="rounded-xl bg-red-600 px-4 py-2 text-white"
                  >
                    Vymazať
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}