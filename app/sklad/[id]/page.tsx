"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BackLink from "@/app/components/BackLink";

export default function InventoryItemDetailPage() {
  const { id } = useParams();
  const itemId = String(id);

  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    loadItem();
  }, []);

  async function loadItem() {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (!error) setItem(data);
  }

  if (!item) {
    return <div className="p-10">Načítavam...</div>;
  }

  const lowStock =
    item.min_quantity !== null &&
    item.min_quantity !== undefined &&
    Number(item.quantity || 0) <= Number(item.min_quantity);

  return (
    <main className="min-h-screen bg-slate-100 p-10">
      <BackLink href="/sklad" label="Sklad" className="mb-4" />

      <h1 className="text-4xl font-bold">📦 {item.name}</h1>

      {lowStock && (
        <div className="mt-6 rounded-xl bg-orange-100 p-4 font-bold text-orange-800">
          ⚠️ Nízky stav zásob
        </div>
      )}

      <div className="mt-8 rounded-2xl bg-white p-8 shadow">
        <div className="grid grid-cols-2 gap-5">
          <p><b>Kategória:</b> {item.category || "—"}</p>
          <p><b>Množstvo:</b> {item.quantity ?? 0} {item.unit || ""}</p>
          <p><b>Minimálne množstvo:</b> {item.min_quantity ?? "—"} {item.unit || ""}</p>
          <p><b>Umiestnenie:</b> {item.location || "—"}</p>
        </div>

        {item.notes && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <b>Poznámky:</b>
            <p className="mt-2">{item.notes}</p>
          </div>
        )}
      </div>
    </main>
  );
}