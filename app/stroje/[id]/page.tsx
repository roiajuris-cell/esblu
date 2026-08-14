"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BackLink from "@/app/components/BackLink";
import { getMyActiveMembership } from "@/lib/company";

type MachineService = {
  id: string;
  machine_id: string;
  user_id: string;
  service_date: string;
  mileage: number | string | null;
  title: string;
  description: string | null;
  cost: number | string | null;
  technician: string | null;
  next_service_date: string | null;
  created_at: string;
};

const emptyService = {
  service_date: "",
  mileage: "",
  title: "",
  description: "",
  cost: "",
  technician: "",
  next_service_date: "",
};

function parseOptionalNonNegativeNumber(
  value: string,
  fieldName: string,
  requireSafeInteger = false
): number | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) return null;

  const parsedValue = Number(trimmedValue);
  const isValidInteger =
    !requireSafeInteger || Number.isSafeInteger(parsedValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0 || !isValidInteger) {
    const expectedValue = requireSafeInteger
      ? "platné nezáporné celé číslo"
      : "platné nezáporné číslo";
    throw new Error(`Pole „${fieldName}“ musí obsahovať ${expectedValue}.`);
  }

  return parsedValue;
}

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
  const [companyId, setCompanyId] = useState("");
  const [machine, setMachine] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [services, setServices] = useState<MachineService[]>([]);
  const [service, setService] = useState(emptyService);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [isServiceSaving, setIsServiceSaving] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const serviceSaveInProgressRef = useRef(false);
  const serviceDeleteInProgressRef = useRef(false);

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

    const membership = await getMyActiveMembership();

    if (!membership) {
      setCompanyId("");
      setMachine(null);
      setPhotos([]);
      setServices([]);
      return;
    }

    setCompanyId(membership.company_id);
    loadMachine(membership.company_id);
    loadPhotos(membership.company_id);
    loadServices(membership.company_id);
  }

  async function loadMachine(currentCompanyId: string) {
    const { data } = await supabase
      .from("machines")
      .select("*")
      .eq("id", machineId)
      .eq("company_id", currentCompanyId)
      .single();

    setMachine(data);
  }

  async function loadPhotos(currentCompanyId: string = companyId) {
    if (!currentCompanyId) return;

    const { data } = await supabase
      .from("machine_photos")
      .select("*")
      .eq("machine_id", machineId)
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false });

    setPhotos(data || []);
  }

  async function loadServices(currentCompanyId: string = companyId) {
    if (!currentCompanyId) return;

    const { data, error } = await supabase
      .from("machine_services")
      .select("*")
      .eq("machine_id", machineId)
      .eq("company_id", currentCompanyId)
      .order("service_date", { ascending: false });

    if (error) {
      alert("Chyba pri načítaní servisov stroja: " + error.message);
      return;
    }

    setServices(data || []);
  }

  function updateService(key: keyof typeof emptyService, value: string) {
    setService((currentService) => ({
      ...currentService,
      [key]: value,
    }));
  }

  function startEditService(item: MachineService) {
    setEditingServiceId(item.id);
    setShowServiceForm(true);
    setService({
      service_date: item.service_date || "",
      mileage: item.mileage == null ? "" : String(item.mileage),
      title: item.title || "",
      description: item.description || "",
      cost: item.cost == null ? "" : String(item.cost),
      technician: item.technician || "",
      next_service_date: item.next_service_date || "",
    });
  }

  function cancelServiceEdit() {
    setEditingServiceId(null);
    setService(emptyService);
    setShowServiceForm(false);
  }

  async function saveService() {
    if (
      serviceSaveInProgressRef.current ||
      serviceDeleteInProgressRef.current
    ) {
      return;
    }

    if (!service.service_date || !service.title.trim()) {
      alert("Vyplňte dátum servisu a názov servisu.");
      return;
    }

    serviceSaveInProgressRef.current = true;
    setIsServiceSaving(true);

    try {
      const mileage = parseOptionalNonNegativeNumber(
        service.mileage,
        "Motohodiny",
        true
      );
      const cost = parseOptionalNonNegativeNumber(service.cost, "Cena");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          "Na uloženie servisného záznamu musíte byť prihlásený."
        );
      }

      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error(
          "Na uloženie servisného záznamu musíte byť prihlásený."
        );
      }

      const payload = {
        machine_id: machineId,
        user_id: user.id,
        service_date: service.service_date,
        mileage,
        title: service.title.trim(),
        description: service.description.trim() || null,
        cost,
        technician: service.technician.trim() || null,
        next_service_date: service.next_service_date || null,
      };

      if (editingServiceId) {
        const { data: updatedServices, error: updateError } = await supabase
          .from("machine_services")
          .update(payload)
          .eq("id", editingServiceId)
          .eq("machine_id", machineId)
          .eq("company_id", membership.company_id)
          .select("id");

        if (updateError) throw updateError;

        if (updatedServices?.length !== 1) {
          throw new Error(
            "Servisný záznam sa nepodarilo upraviť alebo naň nemáte oprávnenie."
          );
        }
      } else {
        const { data: insertedServices, error: insertError } = await supabase
          .from("machine_services")
          .insert(payload)
          .select("id");

        if (insertError) throw insertError;

        if (insertedServices?.length !== 1) {
          throw new Error("Servisný záznam sa nepodarilo uložiť.");
        }
      }

      setService(emptyService);
      setEditingServiceId(null);
      setShowServiceForm(false);
      await loadServices(membership.company_id);
    } catch (saveError: unknown) {
      const message =
        saveError instanceof Error ? saveError.message : "Neznáma chyba.";
      alert("Chyba pri ukladaní servisu: " + message);
    } finally {
      serviceSaveInProgressRef.current = false;
      setIsServiceSaving(false);
    }
  }

  async function deleteService(serviceId: string) {
    if (
      serviceDeleteInProgressRef.current ||
      serviceSaveInProgressRef.current
    ) {
      return;
    }

    const confirmed = confirm("Naozaj chcete vymazať tento servisný záznam?");
    if (!confirmed) return;

    serviceDeleteInProgressRef.current = true;
    setDeletingServiceId(serviceId);

    try {
      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error(
          "Na vymazanie servisného záznamu musíte byť prihlásený."
        );
      }

      const { data: deletedServices, error: deleteError } = await supabase
        .from("machine_services")
        .delete()
        .eq("id", serviceId)
        .eq("machine_id", machineId)
        .eq("company_id", membership.company_id)
        .select("id");

      if (deleteError) throw deleteError;

      if (deletedServices?.length !== 1) {
        throw new Error(
          "Servisný záznam sa nevymazal alebo naň nemáte oprávnenie."
        );
      }

      setServices((currentServices) =>
        currentServices.filter((item) => item.id !== serviceId)
      );

      if (editingServiceId === serviceId) {
        cancelServiceEdit();
      }
    } catch (deleteError: unknown) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Neznáma chyba.";
      alert("Chyba pri mazaní servisu: " + message);
    } finally {
      serviceDeleteInProgressRef.current = false;
      setDeletingServiceId(null);
    }
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
      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error("Nie ste prihlásený. Prihláste sa a skúste to znova.");
      }

      const { data: deletedPhotos, error: deletePhotoError } = await supabase
        .from("machine_photos")
        .delete()
        .eq("id", photoId)
        .eq("machine_id", machineId)
        .eq("company_id", membership.company_id)
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
      <BackLink href="/stroje" label="Stroje" className="mb-4" />

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

      <section className="mt-10 rounded-2xl bg-white p-5 shadow sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">Servis</h2>

          <button
            type="button"
            onClick={() => {
              if (showServiceForm) {
                cancelServiceEdit();
              } else {
                setService(emptyService);
                setEditingServiceId(null);
                setShowServiceForm(true);
              }
            }}
            disabled={isServiceSaving || deletingServiceId !== null}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
          >
            {showServiceForm ? "Zavrieť formulár" : "➕ Pridať servis"}
          </button>
        </div>

        {showServiceForm && (
          <div className="mt-6 rounded-2xl border bg-slate-50 p-4 sm:p-6">
            <h3 className="text-xl font-bold">
              {editingServiceId ? "Upraviť servis" : "Pridať servis"}
            </h3>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="min-w-0 text-sm font-medium text-slate-700">
                Dátum servisu
                <input
                  type="date"
                  value={service.service_date}
                  onChange={(event) =>
                    updateService("service_date", event.target.value)
                  }
                  disabled={isServiceSaving}
                  className="mt-1 w-full min-w-0 rounded-xl border bg-white p-3 text-base font-normal text-slate-900 disabled:bg-slate-200"
                />
              </label>

              <label className="min-w-0 text-sm font-medium text-slate-700">
                Motohodiny
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={service.mileage}
                  onChange={(event) =>
                    updateService("mileage", event.target.value)
                  }
                  disabled={isServiceSaving}
                  className="mt-1 w-full min-w-0 rounded-xl border bg-white p-3 text-base font-normal text-slate-900 disabled:bg-slate-200"
                />
              </label>

              <label className="min-w-0 text-sm font-medium text-slate-700">
                Názov servisu
                <input
                  value={service.title}
                  onChange={(event) =>
                    updateService("title", event.target.value)
                  }
                  disabled={isServiceSaving}
                  className="mt-1 w-full min-w-0 rounded-xl border bg-white p-3 text-base font-normal text-slate-900 disabled:bg-slate-200"
                />
              </label>

              <label className="min-w-0 text-sm font-medium text-slate-700">
                Cena (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={service.cost}
                  onChange={(event) =>
                    updateService("cost", event.target.value)
                  }
                  disabled={isServiceSaving}
                  className="mt-1 w-full min-w-0 rounded-xl border bg-white p-3 text-base font-normal text-slate-900 disabled:bg-slate-200"
                />
              </label>

              <label className="min-w-0 text-sm font-medium text-slate-700">
                Servis / technik
                <input
                  value={service.technician}
                  onChange={(event) =>
                    updateService("technician", event.target.value)
                  }
                  disabled={isServiceSaving}
                  className="mt-1 w-full min-w-0 rounded-xl border bg-white p-3 text-base font-normal text-slate-900 disabled:bg-slate-200"
                />
              </label>

              <label className="min-w-0 text-sm font-medium text-slate-700">
                Ďalší servis
                <input
                  type="date"
                  value={service.next_service_date}
                  onChange={(event) =>
                    updateService("next_service_date", event.target.value)
                  }
                  disabled={isServiceSaving}
                  className="mt-1 w-full min-w-0 rounded-xl border bg-white p-3 text-base font-normal text-slate-900 disabled:bg-slate-200"
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Popis
              <textarea
                value={service.description}
                onChange={(event) =>
                  updateService("description", event.target.value)
                }
                disabled={isServiceSaving}
                rows={4}
                className="mt-1 w-full min-w-0 resize-y rounded-xl border bg-white p-3 text-base font-normal text-slate-900 disabled:bg-slate-200"
              />
            </label>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveService}
                disabled={isServiceSaving || deletingServiceId !== null}
                className="w-full rounded-xl bg-green-600 px-5 py-3 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
              >
                {isServiceSaving
                  ? "Ukladám..."
                  : editingServiceId
                    ? "Uložiť zmeny"
                    : "Uložiť servis"}
              </button>

              <button
                type="button"
                onClick={cancelServiceEdit}
                disabled={isServiceSaving}
                className="w-full rounded-xl bg-slate-300 px-5 py-3 text-slate-900 hover:bg-slate-400 disabled:cursor-not-allowed disabled:bg-gray-200 sm:w-auto"
              >
                Zrušiť
              </button>
            </div>
          </div>
        )}

        {services.length === 0 ? (
          <p className="mt-6 text-slate-500">
            Zatiaľ nebol pridaný žiadny servisný záznam.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {services.map((item) => (
              <article
                key={item.id}
                className="min-w-0 rounded-2xl border bg-slate-50 p-4 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="break-words text-xl font-bold text-slate-900 sm:text-2xl">
                      🔧 {item.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      📅 {item.service_date}
                    </p>
                  </div>

                  {item.cost != null && (
                    <div className="self-start rounded-xl bg-green-100 px-4 py-2 font-bold text-green-700">
                      {item.cost} €
                    </div>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-slate-500">Motohodiny</p>
                    <p className="break-words text-lg font-bold">
                      {item.mileage != null ? item.mileage : "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-slate-500">Servis / technik</p>
                    <p className="break-words text-lg font-bold">
                      {item.technician || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white p-4">
                    <p className="text-sm text-slate-500">Ďalší servis</p>
                    <p className="break-words text-lg font-bold">
                      {item.next_service_date || "—"}
                    </p>
                  </div>
                </div>

                {item.description && (
                  <p className="mt-5 whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-slate-700">
                    {item.description}
                  </p>
                )}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => startEditService(item)}
                    disabled={
                      isServiceSaving || deletingServiceId !== null
                    }
                    className="w-full rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
                  >
                    Upraviť
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteService(item.id)}
                    disabled={
                      isServiceSaving || deletingServiceId !== null
                    }
                    className="w-full rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
                  >
                    {deletingServiceId === item.id ? "Mažem..." : "Vymazať"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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
