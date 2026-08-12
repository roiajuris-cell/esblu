"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import {
  PLAN_LIMIT_MESSAGE,
  isPlanLimitReachedError,
} from "@/lib/plan-limits";
import BackLink from "@/app/components/BackLink";
async function compressImage(file: File): Promise<File> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Fotografiu sa nepodarilo načítať."));
      img.src = imageUrl;
    });

    const maxDimension = 1600;
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.width, image.height)
    );

    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Nepodarilo sa pripraviť kompresiu fotografie.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Fotografiu sa nepodarilo skomprimovať."));
          }
        },
        "image/webp",
        0.78
      );
    });

    const baseName = file.name.replace(/\.[^/.]+$/, "");

    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
export default function SkladPage() {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const saveInProgressRef = useRef(false);
  const {
    usage: planUsage,
    limit: planLimit,
    isLimited: isPlanLimited,
    loading: planUsageLoading,
    refresh: refreshPlanUsage,
  } = usePlanUsage("inventory_items");
  const isItemCreationUnavailable = planUsageLoading || isPlanLimited;

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
function inventoryPhotoUrl(path: string) {
  const { data } = supabase.storage
    .from("inventory-photos")
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

    const itemIds = (data || []).map((item) => item.id);

let photosData: any[] = [];

if (itemIds.length > 0) {
  const { data: photos } = await supabase
    .from("inventory_photos")
    .select("*")
    .in("inventory_item_id", itemIds)
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false });

  photosData = photos || [];
}

const itemsWithPhotos = (data || []).map((item) => {
  const firstPhoto = photosData.find(
    (photo) => photo.inventory_item_id === item.id
  );

  return {
    ...item,
    first_photo_url: firstPhoto
      ? inventoryPhotoUrl(firstPhoto.file_path)
      : null,
  };
});

setItems(itemsWithPhotos);
  }

  function updateItem(key: string, value: string) {
    setItem((prev) => ({ ...prev, [key]: value }));
  }
  async function handlePhotoChange(
  e: React.ChangeEvent<HTMLInputElement>
) {
  const file = e.target.files?.[0];

  if (!file) return;

  try {
    const compressedFile = await compressImage(file);

    setPhotoFile(compressedFile);
    setPhotoPreview(URL.createObjectURL(compressedFile));

    console.log("Pôvodná veľkosť:", file.size, "bytes");
    console.log(
      "Komprimovaná veľkosť:",
      compressedFile.size,
      "bytes"
    );
  } catch (error) {
    console.error("Chyba pri kompresii fotografie:", error);
    alert("Fotografiu sa nepodarilo spracovať.");
  }
}

  async function saveItem() {
    if (saveInProgressRef.current) return;

    if (!item.name) {
      alert("Vyplň názov položky.");
      return;
    }

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    saveInProgressRef.current = true;
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

    let createdNewItem = false;

    try {
  let savedItemId = editingId;

  if (editingId) {
    const { error } = await supabase
      .from("inventory_items")
      .update(payload)
      .eq("id", editingId)
      .eq("user_id", userId);

    if (error) throw error;
  } else {
    const latestUsage = await refreshPlanUsage();

    if (latestUsage?.isLimited) {
      alert(PLAN_LIMIT_MESSAGE);
      return;
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;

    savedItemId = data.id;
    createdNewItem = true;
  }

  if (photoFile && savedItemId) {
    const fileExtension =
      photoFile.name.split(".").pop()?.toLowerCase() || "jpg";

    const filePath =
      `${userId}/${savedItemId}/${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("inventory-photos")
      .upload(filePath, photoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: photoFile.type,
      });

    if (uploadError) throw uploadError;

    const { error: photoError } = await supabase
      .from("inventory_photos")
      .insert({
        inventory_item_id: savedItemId,
        user_id: userId,
        file_path: filePath,
      });

    if (photoError) throw photoError;
  }

  setItem(emptyItem);
  setEditingId(null);
  setShowForm(false);
  setPhotoFile(null);

  if (photoPreview) {
    URL.revokeObjectURL(photoPreview);
  }

  setPhotoPreview(null);
  if (createdNewItem) {
    await Promise.all([loadItems(), refreshPlanUsage()]);
  } else {
    await loadItems();
  }
} catch (saveError: unknown) {
  if (isPlanLimitReachedError(saveError, "inventory_items")) {
    alert(PLAN_LIMIT_MESSAGE);
    await refreshPlanUsage();
  } else {
    const message =
      saveError instanceof Error ? saveError.message : "Neznáma chyba.";
    alert("Chyba pri ukladaní položky: " + message);

    if (createdNewItem) {
      await Promise.all([loadItems(), refreshPlanUsage()]);
    }
  }
} finally {
  saveInProgressRef.current = false;
  setIsSaving(false);
}
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
  const confirmed = confirm(
    "Naozaj chceš vymazať túto skladovú položku?"
  );

  if (!confirmed) return;

  const { data: itemPhotos, error: photosError } = await supabase
    .from("inventory_photos")
    .select("file_path")
    .eq("inventory_item_id", id)
    .eq("user_id", userId);

  if (photosError) {
    console.error(
      "Chyba pri načítaní fotografií skladovej položky:",
      photosError
    );
    alert("Nepodarilo sa načítať fotografie skladovej položky.");
    return;
  }

  const photoPaths = (itemPhotos || [])
    .map((photo: any) => photo.file_path)
    .filter(Boolean);

  if (photoPaths.length > 0) {
  
    const { error: storageError } = await supabase.storage
  .from("inventory-photos")
  .remove(photoPaths);


    if (storageError) {
      console.error(
        "Chyba pri mazaní fotografií zo Storage:",
        storageError
      );
      alert("Fotografie položky sa nepodarilo vymazať z úložiska.");
      return;
    }
  }

  const { error: deleteError } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (deleteError) {
    alert("Chyba pri mazaní položky: " + deleteError.message);
    return;
  }

  await Promise.all([loadItems(), refreshPlanUsage()]);
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
      <BackLink href="/" label="Hlavné menu" className="mb-4" />

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

      {!planUsageLoading && isPlanLimited && (
        <PlanLimitNotice
          resource="inventory_items"
          usage={planUsage}
          limit={planLimit}
          className="mt-6"
        />
      )}

      <button
        onClick={() => {
          setShowForm(!showForm);
          setEditingId(null);
          setItem(emptyItem);
        }}
        disabled={isItemCreationUnavailable}
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
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
          <div className="mt-5 grid grid-cols-2 gap-3">
  <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700">
    📷 Odfotiť
    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      disabled={!editingId && isItemCreationUnavailable}
      onChange={handlePhotoChange}
    />
  </label>

  <label className="cursor-pointer rounded-xl border bg-white px-4 py-3 text-center font-semibold text-blue-700 shadow hover:bg-slate-100">
    🖼️ Galéria
    <input
      type="file"
      accept="image/*"
      className="hidden"
      disabled={!editingId && isItemCreationUnavailable}
      onChange={handlePhotoChange}
    />
  </label>
</div>

{photoPreview && (
  <div className="mt-4">
    <img
      src={photoPreview}
      alt="Náhľad fotografie"
      className="h-48 w-full rounded-xl object-cover"
    />
  </div>
)}
          <button
            onClick={saveItem}
            disabled={isSaving || (!editingId && isItemCreationUnavailable)}
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
              >{row.first_photo_url ? (
  <img
    src={row.first_photo_url}
    alt={row.name || "Fotografia položky"}
    className="mb-4 h-56 w-full rounded-xl object-cover"
  />
) : (
  <div className="mb-4 flex h-56 w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-100">
    <div className="text-center text-slate-500">
      <div className="text-6xl">📦</div>
      <p className="mt-2 text-sm font-medium">
        Bez fotografie
      </p>
    </div>
  </div>
)}
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
