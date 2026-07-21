"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
async function compressImage(file: File): Promise<File> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Fotografiu sa nepodarilo načítať."));

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
export default function MachineDetailPage() {
  const { id } = useParams();
  const machineId = String(id);

  const [userId, setUserId] = useState("");
  const [machine, setMachine] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

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

  async function uploadPhoto(
  event: React.ChangeEvent<HTMLInputElement>
) {
  const originalFile = event.target.files?.[0];

  if (!originalFile || !userId || !machineId) return;

  setIsUploading(true);

  try {
    const compressedFile = await compressImage(originalFile);

    console.log(
      "Pôvodná veľkosť fotografie stroja:",
      originalFile.size,
      "bytes"
    );

    console.log(
      "Komprimovaná veľkosť fotografie stroja:",
      compressedFile.size,
      "bytes"
    );

    const filePath =
      `${userId}/${machineId}/${Date.now()}-${compressedFile.name}`;

    const { error: uploadError } = await supabase.storage
      .from("machine-photos")
      .upload(filePath, compressedFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: compressedFile.type,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { error: dbError } = await supabase
      .from("machine_photos")
      .insert({
        user_id: userId,
        machine_id: machineId,
        file_path: filePath,
      });

    if (dbError) {
      // Ak zlyhá zápis do databázy, odstránime už nahraný súbor.
      await supabase.storage
        .from("machine-photos")
        .remove([filePath]);

      throw dbError;
    }

    await loadPhotos();
  } catch (error: any) {
    console.error("Chyba pri nahrávaní fotografie stroja:", error);

    alert(
      "Chyba pri nahrávaní fotky: " +
        (error?.message || "Neznáma chyba")
    );
  } finally {
    setIsUploading(false);

    // Umožní znovu vybrať aj tú istú fotografiu.
    event.target.value = "";
  }
}
  async function deletePhoto(photo: any) {
    if (deletingPhotoId) return;

    const photoId = String(photo?.id || "");

    if (!photoId) {
      alert("Fotografia nemá platné databázové ID.");
      return;
    }

    const confirmed = confirm("Naozaj chceš vymazať túto fotografiu?");
    if (!confirmed) return;

    setDeletingPhotoId(photoId);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Nie ste prihlásený. Prihláste sa a skúste to znova.");
      }

      const { data: deletedPhotos, error: deletePhotoError } = await supabase
        .from("machine_photos")
        .delete()
        .eq("id", photoId)
        .eq("machine_id", machineId)
        .eq("user_id", user.id)
        .select("id, file_path");

      if (deletePhotoError) throw deletePhotoError;

      if (deletedPhotos?.length !== 1) {
        throw new Error(
          "Fotografia sa v databáze nevymazala. Záznam neexistuje alebo na jeho vymazanie nemáte oprávnenie."
        );
      }

      // UI aktualizujeme až po potvrdenom databázovom delete.
      setPhotos((currentPhotos) =>
        currentPhotos.filter(
          (currentPhoto) => String(currentPhoto.id) !== photoId
        )
      );

      const deletedFilePath = deletedPhotos[0].file_path;

      // Storage čistíme až po vymazaní DB riadku a aktualizácii UI.
      if (deletedFilePath) {
        const { error: storageError } = await supabase.storage
          .from("machine-photos")
          .remove([deletedFilePath]);

        if (storageError) {
          console.error(
            "Databázový záznam fotografie bol vymazaný, ale Storage cleanup zlyhal:",
            storageError
          );
          alert(
            "Fotografia bola odstránená z evidencie, ale jej súbor sa nepodarilo odstrániť z úložiska."
          );
        }
      }
    } catch (deleteError: unknown) {
      console.error("Chyba pri mazaní fotografie stroja:", deleteError);
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : typeof deleteError === "object" &&
              deleteError !== null &&
              "message" in deleteError
            ? String(deleteError.message)
            : "Neznáma chyba.";
      alert("Chyba pri mazaní fotografie: " + message);
    } finally {
      setDeletingPhotoId(null);
    }
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

          <div className="flex gap-3">
  <label className="cursor-pointer rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700">
    {isUploading ? "Nahrávam..." : "📷 Odfotiť"}
    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={uploadPhoto}
      disabled={isUploading}
    />
  </label>

  <label className="cursor-pointer rounded-xl bg-white px-5 py-3 text-slate-700 border">
    🖼️ Galéria
    <input
      type="file"
      accept="image/*"
      className="hidden"
      onChange={uploadPhoto}
      disabled={isUploading}
    />
  </label>
</div>
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
                  disabled={deletingPhotoId !== null}
                  className="mt-3 w-full rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {deletingPhotoId === String(photo.id)
                    ? "Mažem..."
                    : "🗑 Vymazať"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
