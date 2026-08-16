"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import { isPlanLimitReachedError, PLAN_LIMIT_MESSAGE } from "@/lib/plan-limits";
import { normalizeSpz } from "@/lib/normalize-spz";
import VehicleCard from "../components/VehicleCard";
import BackLink from "../components/BackLink";
import {
  getMyActiveMembership,
  isOwnerOrAdmin,
  type CompanyMemberRole,
} from "@/lib/company";
import { useCompanyDpaLegalHold } from "@/app/components/CompanyDpaGate";
import { LEGAL_HOLD_MESSAGE } from "@/lib/company-dpa";

async function compressVehiclePhoto(file: File): Promise<File> {
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

    const baseName = file.name.replace(/\.[^/.]+$/, "") || "vozidlo";

    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function VozidlaPage() {
  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState<CompanyMemberRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [vehicle, setVehicle] = useState<any | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photoTargetVehicleId, setPhotoTargetVehicleId] = useState("");
  const [isUploadingVehiclePhotos, setIsUploadingVehiclePhotos] =
    useState(false);
  const [photoUploadFeedback, setPhotoUploadFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const saveInProgressRef = useRef(false);
  const {
    usage: planUsage,
    limit: planLimit,
    isLimited: isPlanLimited,
    loading: planUsageLoading,
    refresh: refreshPlanUsage,
  } = usePlanUsage("vehicles");
  const { legalHold } = useCompanyDpaLegalHold();
  // Legal-hold blokuje IBA vytváranie NOVÝCH vozidiel (rovnako ako
  // plan-limit vyššie) — presne to, čo by aj tak odmietol DB trigger
  // esblu_require_company_dpa_before_insert na tabuľke vehicles
  // (20260816090000_add_company_dpa_acceptance.sql). Úprava/mazanie
  // existujúceho vozidla (editingId nastavené) ostáva nedotknutá.
  const isNewVehicleBlocked =
    !editingId && (planUsageLoading || isPlanLimited || legalHold);

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
      setRole(null);
      setVehicles([]);
      return;
    }

    setCompanyId(membership.company_id);
    setRole(membership.role);
    loadVehicles(membership.company_id);
  }

  async function loadVehicles(currentCompanyId: string = companyId) {
    if (!currentCompanyId) return;

    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", currentCompanyId)
      .order("znacka", { ascending: true });

    if (error) {
      alert("Chyba pri načítaní vozidiel: " + error.message);
      return;
    }

    setVehicles(data || []);
  }

  async function uploadVehiclePhotosFromList(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    if (!photoTargetVehicleId) {
      setPhotoUploadFeedback({
        type: "error",
        text: "Najprv vyber vozidlo, ku ktorému fotografie patria.",
      });
      return;
    }

    if (!userId) {
      setPhotoUploadFeedback({ type: "error", text: "Nie si prihlásený." });
      return;
    }

    if (legalHold) {
      setPhotoUploadFeedback({ type: "error", text: LEGAL_HOLD_MESSAGE });
      return;
    }

    setIsUploadingVehiclePhotos(true);
    setPhotoUploadFeedback(null);

    let failedCount = 0;

    try {
      for (const originalFile of files) {
        try {
          const compressedFile = await compressVehiclePhoto(originalFile);
          const filePath = `${userId}/${photoTargetVehicleId}/${Date.now()}-${crypto.randomUUID()}-${compressedFile.name}`;

          const { error: uploadError } = await supabase.storage
            .from("vehicle-photos")
            .upload(filePath, compressedFile, {
              cacheControl: "3600",
              upsert: false,
              contentType: compressedFile.type,
            });

          if (uploadError) throw uploadError;

          const { error: dbError } = await supabase
            .from("vehicle_photos")
            .insert({
              user_id: userId,
              vehicle_id: photoTargetVehicleId,
              storage_path: filePath,
            });

          if (dbError) {
            await supabase.storage.from("vehicle-photos").remove([filePath]);
            throw dbError;
          }
        } catch (singleUploadError) {
          failedCount += 1;
          console.error(
            "Chyba pri nahrávaní fotografie vozidla:",
            singleUploadError
          );
        }
      }

      const successCount = files.length - failedCount;

      if (failedCount === 0) {
        setPhotoUploadFeedback({
          type: "success",
          text: `${successCount} ${successCount === 1 ? "fotografia bola uložená" : "fotografií bolo uložených"}.`,
        });
      } else {
        setPhotoUploadFeedback({
          type: "error",
          text: `${failedCount} z ${files.length} fotografií sa nepodarilo nahrať. Skús to znova.`,
        });
      }
    } finally {
      setIsUploadingVehiclePhotos(false);
    }
  }

  function updateVehicle(key: string, value: string) {
    setVehicle((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  }

  function vehiclePayload() {
    return {
      user_id: userId,
      spz: normalizeSpz(vehicle.spz),
      vin: vehicle.vin || null,
      znacka: vehicle.znacka || null,
      model: vehicle.model || null,
      rok_vyroby: vehicle.rokVyroby ? Number(vehicle.rokVyroby) : null,
      palivo: vehicle.palivo || null,
      objem: vehicle.objemMotora ? Number(vehicle.objemMotora) : null,
      vykon: vehicle.vykon || null,
      farba: vehicle.farba || null,
      hmotnost: vehicle.hmotnost
        ? Number(String(vehicle.hmotnost).replace(" kg", ""))
        : null,
      pocet_miest: vehicle.pocetMiest ? Number(vehicle.pocetMiest) : null,
      datum_prvej_evidencie: vehicle.datumPrvejEvidencie || null,
      stk: vehicle.stk || null,
      ek: vehicle.ek || null,
    };
  }

  async function handleSaveVehicle() {
    if (!vehicle || saveInProgressRef.current) return;

    if (!userId) {
      alert("Nie si prihlásený.");
      return;
    }

    // Obranná kontrola pred samotným INSERTom (nad rámec toho, že tlačidlo
    // je pri legalHold už disabled) — používateľ nemá vyplniť celý
    // formulár a až pri uložení naraziť na ESBLU_COMPANY_DPA_NOT_ACCEPTED
    // z DB triggera. Netýka sa editácie existujúceho vozidla.
    if (!editingId && legalHold) {
      alert(LEGAL_HOLD_MESSAGE);
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from("vehicles")
          .update(vehiclePayload())
          .eq("id", editingId)
          .eq("company_id", companyId);

        if (error) throw error;

        alert("Vozidlo bolo upravené.");
        setEditingId(null);
        setVehicle(null);
        await loadVehicles();
        return;
      }

      const latestUsage = await refreshPlanUsage();

      if (latestUsage?.isLimited) {
        alert(PLAN_LIMIT_MESSAGE);
        return;
      }

      const { error } = await supabase.from("vehicles").insert(vehiclePayload());

      if (error) throw error;

      alert("Vozidlo bolo uložené.");
      setVehicle(null);
      await Promise.all([loadVehicles(), refreshPlanUsage()]);
    } catch (saveError: unknown) {
      if (isPlanLimitReachedError(saveError, "vehicles")) {
        alert(PLAN_LIMIT_MESSAGE);
        await refreshPlanUsage();
      } else {
        const message =
          saveError instanceof Error ? saveError.message : "Neznáma chyba.";
        alert(
          editingId
            ? "Chyba pri úprave: " + message
            : "Chyba pri ukladaní: " + message
        );
      }
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  function handleEdit(car: any) {
    setEditingId(car.id);

    setVehicle({
      spz: car.spz || "",
      vin: car.vin || "",
      znacka: car.znacka || "",
      model: car.model || "",
      rokVyroby: car.rok_vyroby || "",
      palivo: car.palivo || "",
      objemMotora: car.objem || "",
      vykon: car.vykon || "",
      farba: car.farba || "",
      hmotnost: car.hmotnost || "",
      pocetMiest: car.pocet_miest || "",
      datumPrvejEvidencie: car.datum_prvej_evidencie || "",
      stk: car.stk || "",
      ek: car.ek || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteVehicle(id: string) {
    const confirmed = confirm("Naozaj chceš vymazať toto vozidlo?");
    if (!confirmed) return;

    // Cesty fotografií vozidla načítame PRED zmazaním vozidla — DB riadky
    // vehicle_photos sa zmažú automaticky (FK ON DELETE CASCADE), ale
    // súbory v Storage treba odstrániť samostatne, aby po vozidle
    // nezostali osirotené fotografie v bucket-e vehicle-photos.
    const { data: photosToClean } = await supabase
      .from("vehicle_photos")
      .select("storage_path")
      .eq("vehicle_id", id)
      .eq("company_id", companyId);

    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      alert("Chyba pri mazaní: " + error.message);
      return;
    }

    const paths = (photosToClean || [])
      .map((p) => p.storage_path)
      .filter((p): p is string => Boolean(p));

    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("vehicle-photos")
        .remove(paths);

      if (storageError) {
        console.error(
          "Vozidlo bolo vymazané, ale fotografie sa nepodarilo odstrániť zo Storage:",
          storageError
        );
      }
    }

    await Promise.all([loadVehicles(), refreshPlanUsage()]);
  }

  function cancelEdit() {
    setEditingId(null);
    setVehicle(null);
  }

  return (
    <main className="app-shell-bg min-h-screen p-4 sm:p-6 lg:p-10">
      <BackLink href="/" label="Hlavné menu" className="mb-4" />

      <div className="flex items-center gap-4">
  <img
    src="/images/van.png"
    alt="Vozidlá"
    className="h-20 w-20 object-contain"
  />
  <h1 className="text-4xl font-bold text-primary">Vozidlá</h1>
</div>

      <p className="mt-4 text-secondary">
        Evidencia firemných vozidiel.
      </p>

      {!planUsageLoading && isPlanLimited && (
        <PlanLimitNotice
          resource="vehicles"
          usage={planUsage}
          limit={planLimit}
          className="mt-6"
        />
      )}

      {role !== "employee" && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-subtle bg-surface-1 p-6 shadow-lg backdrop-blur-xl">
          <div>
            <h2 className="text-xl font-bold">Nové vozidlo pridáte cez Inbox</h2>
            <p className="mt-1 text-sm text-secondary">
              Odfotografujte technický preukaz (prednú a zadnú stranu) v
              module Inbox — AI údaje načíta a po vašom potvrdení vozidlo
              automaticky založí alebo priradí k existujúcemu.
            </p>
          </div>
          <Link
            href="/ai-evidencia"
            className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
          >
            Otvoriť Inbox →
          </Link>
        </div>
      )}

      {/* Pridávanie fotografií smie aj employee (rovnaké oprávnenie ako
          SELECT/INSERT na vehicle_photos) — samotné vozidlá (vytváranie/
          úprava/mazanie v tomto module) ostávajú employeeovi naďalej
          nedostupné, toto sa ich netýka. */}
      {role && (
        <div className="mt-6 rounded-2xl border border-subtle bg-surface-1 p-6 shadow-lg backdrop-blur-xl">
          <h2 className="text-xl font-bold">📷 Pridať fotografie vozidla</h2>
          <p className="mt-1 text-sm text-secondary">
            Vyber vozidlo a nahraj jednu alebo viac fotografií naraz. Fotky
            uvidíš v galérii na detaile vozidla.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={photoTargetVehicleId}
              onChange={(e) => setPhotoTargetVehicleId(e.target.value)}
              className="rounded-xl border border-subtle bg-surface-2 px-4 py-3 outline-none sm:flex-1"
            >
              <option value="">— vyber vozidlo —</option>
              {vehicles.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.spz || "Bez ŠPZ"}
                  {car.znacka ? ` — ${car.znacka} ${car.model || ""}` : ""}
                </option>
              ))}
            </select>

            <label
              className={`rounded-xl px-5 py-3 text-center font-medium ${
                isUploadingVehiclePhotos || !photoTargetVehicleId || legalHold
                  ? "cursor-not-allowed bg-surface-2 text-muted-esblu"
                  : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isUploadingVehiclePhotos ? "Nahrávam..." : "📷 Odfotiť / nahrať"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={
                  isUploadingVehiclePhotos ||
                  !photoTargetVehicleId ||
                  legalHold
                }
                onChange={uploadVehiclePhotosFromList}
              />
            </label>
          </div>

          {vehicles.length === 0 && (
            <p className="mt-2 text-xs text-muted-esblu">
              Zatiaľ nemáš uložené žiadne vozidlo.
            </p>
          )}

          {photoUploadFeedback && (
            <p
              className={`mt-3 rounded-xl p-3 text-sm font-medium ${
                photoUploadFeedback.type === "success"
                  ? "badge-success"
                  : "bg-danger-soft text-red-700"
              }`}
            >
              {photoUploadFeedback.text}
            </p>
          )}
        </div>
      )}

      {role !== "employee" && vehicle && (
        <div className="mt-8 rounded-2xl bg-surface-1 p-6 shadow">
          <h2 className="mb-6 text-2xl font-bold">
            {editingId ? "Upraviť vozidlo" : "Skontrolujte údaje vozidla"}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ["ŠPZ", "spz"],
              ["VIN", "vin"],
              ["Značka", "znacka"],
              ["Model", "model"],
              ["Rok výroby", "rokVyroby"],
              ["Palivo", "palivo"],
              ["Objem motora", "objemMotora"],
              ["Výkon", "vykon"],
              ["Farba", "farba"],
              ["Dátum prvej evidencie", "datumPrvejEvidencie"],
              ["Hmotnosť", "hmotnost"],
              ["Počet miest", "pocetMiest"],
            ].map(([label, key]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-secondary">
                  {label}
                </span>
                <input
                  className="mt-1 w-full rounded-xl border p-3"
                  value={vehicle?.[key] || ""}
                  onChange={(e) => updateVehicle(key, e.target.value)}
                />
              </label>
            ))}

            <label className="block">
              <span className="text-sm font-medium text-secondary">
                STK platí do
              </span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                type="date"
                value={vehicle.stk || ""}
                onChange={(e) => updateVehicle("stk", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-secondary">
                EK platí do
              </span>
              <input
                className="mt-1 w-full rounded-xl border p-3"
                type="date"
                value={vehicle.ek || ""}
                onChange={(e) => updateVehicle("ek", e.target.value)}
              />
            </label>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSaveVehicle}
              disabled={isSaving || isNewVehicleBlocked}
              className="rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isSaving
                ? "Ukladám..."
                : editingId
                ? "💾 Uložiť zmeny"
                : "💾 Uložiť vozidlo"}
            </button>

            {editingId && (
              <button
                onClick={cancelEdit}
                className="rounded-xl bg-surface-2 px-6 py-3 text-primary hover:bg-surface-hover"
              >
                Zrušiť úpravu
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-4 text-2xl font-bold text-primary">
  Uložené vozidlá
</h2>

        {vehicles.length === 0 ? (
          <div className="rounded-2xl bg-surface-1 p-6 shadow">
            <p className="text-muted-esblu">
              Zatiaľ nie je uložené žiadne vozidlo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {vehicles.map((car) => (
              <VehicleCard
                key={car.id}
                car={car}
                onDelete={handleDeleteVehicle}
                onEdit={handleEdit}
                canManage={isOwnerOrAdmin(role)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
