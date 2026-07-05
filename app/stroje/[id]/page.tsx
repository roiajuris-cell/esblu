"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function MachineDetailPage() {
  const { id } = useParams();
  const machineId = String(id);

  const [userId, setUserId] = useState("");
  const [machine, setMachine] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);

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
    loadMachine(session.user.id);
    loadPhotos(session.user.id);
  }

  async function loadMachine(currentUserId: string) {
    const { data } = await supabase
      .from("machines")
      .select("*")
      .eq("id", machineId)
      .eq("user_id", currentUserId)
      .single();

    setMachine(data);
  }

  async function loadPhotos(currentUserId: string = userId) {
    if (!currentUserId) return;

    const { data } = await supabase
      .from("machine_photos")
      .select("*")
      .eq("machine_id", machineId)
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    setPhotos(data || []);
  }

  async function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    setIsUploading(true);

    const filePath = `${userId}/${machineId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("machine-photos")
      .upload(filePath, file);

    if (uploadError) {
      setIsUploading(false);
      alert("Chyba pri nahrávaní fotky: " + uploadError.message);
      return;
    }

    const { error: dbError } = await supabase.from("machine_photos").insert({
      user_id: userId,
      machine_id: machineId,
      file_path: filePath,
    });

    setIsUploading(false);

    if (dbError) {
      alert("Chyba pri ukladaní fotky: " + dbError.message);
      return;
    }

    loadPhotos();
  }

  async function deletePhoto(photo: any) {
    const confirmed = confirm("Naozaj chceš vymazať túto fotografiu?");
    if (!confirmed) return;

    await supabase.storage.from("machine-photos").remove([photo.file_path]);

    await supabase
      .from("machine_photos")
      .delete()
      .eq("id", photo.id)
      .eq("user_id", userId);

    loadPhotos();
  }

  function photoUrl(path: string) {
    const { data } = supabase.storage
      .from("machine-photos")
      .getPublicUrl(path);

    return data.publicUrl;
  }

  if (!machine) {
    return <div className="p-10">Načítavam...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-10">
      <h1 className="text-4xl font-bold">🚜 {machine.name}</h1>

      <div className="mt-8 rounded-2xl bg-white p-8 shadow">
        <div className="grid grid-cols-2 gap-5">
          <p><b>Kategória:</b> {machine.category || "—"}</p>
          <p><b>Výrobca:</b> {machine.manufacturer || "—"}</p>
          <p><b>Model:</b> {machine.model || "—"}</p>
          <p><b>Sériové číslo:</b> {machine.serial_number || "—"}</p>
          <p><b>Rok výroby:</b> {machine.year || "—"}</p>
          <p><b>Dátum kúpy:</b> {machine.purchase_date || "—"}</p>
          <p><b>Stav:</b> {machine.status || "—"}</p>
        </div>

        {machine.notes && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <b>Poznámky:</b>
            <p className="mt-2">{machine.notes}</p>
          </div>
        )}
      </div>

      <div className="mt-10 rounded-2xl bg-white p-8 shadow">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">📷 Galéria</h2>

          <label className="cursor-pointer rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700">
            {isUploading ? "Nahrávam..." : "➕ Pridať fotografiu"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={uploadPhoto}
              disabled={isUploading}
            />
          </label>
        </div>

        {photos.length === 0 ? (
          <p className="mt-6 text-slate-500">
            Zatiaľ nie sú pridané žiadne fotografie.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="rounded-xl border bg-slate-50 p-3">
                <img
                  src={photoUrl(photo.file_path)}
                  alt="Fotografia stroja"
                  className="h-48 w-full rounded-xl object-cover"
                />

                <button
                  onClick={() => deletePhoto(photo)}
                  className="mt-3 w-full rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                  🗑 Vymazať
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}