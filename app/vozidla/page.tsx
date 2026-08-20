"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import { isPlanLimitReachedError } from "@/lib/plan-limits";
import { normalizeSpz } from "@/lib/normalize-spz";
import VehicleCard from "../components/VehicleCard";
import BackLink from "../components/BackLink";
import {
  getMyActiveMembership,
  isOwnerOrAdmin,
  type CompanyMemberRole,
} from "@/lib/company";
import { useCompanyDpaLegalHold } from "@/app/components/CompanyDpaGate";
import { useLocale } from "@/lib/i18n/LocaleProvider";

async function compressVehiclePhoto(
  file: File,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<File> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error(t("vehicles.errors.photoLoadFailed")));

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
      throw new Error(t("vehicles.errors.photoCompressPrepFailed"));
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error(t("vehicles.errors.photoCompressFailed")));
          }
        },
        "image/webp",
        0.78
      );
    });

    const baseName =
      file.name.replace(/\.[^/.]+$/, "") ||
      t("vehicles.gallery.defaultPhotoFileName");

    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function VozidlaPage() {
  const { t, tCount } = useLocale();
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
      alert(t("vehicles.errors.loadVehiclesFailed", { message: error.message }));
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
        text: t("vehicles.gallery.selectVehicleFirst"),
      });
      return;
    }

    if (!userId) {
      setPhotoUploadFeedback({
        type: "error",
        text: t("inbox.errors.notLoggedIn"),
      });
      return;
    }

    if (legalHold) {
      setPhotoUploadFeedback({ type: "error", text: t("common.legalHoldMessage") });
      return;
    }

    setIsUploadingVehiclePhotos(true);
    setPhotoUploadFeedback(null);

    let failedCount = 0;

    try {
      for (const originalFile of files) {
        try {
          const compressedFile = await compressVehiclePhoto(originalFile, t);
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
          text: tCount("vehicles.gallery.photosSavedCount", successCount),
        });
      } else {
        setPhotoUploadFeedback({
          type: "error",
          text: t("vehicles.errors.photosUploadFailedCount", {
            failedCount,
            total: files.length,
          }),
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
      alert(t("inbox.errors.notLoggedIn"));
      return;
    }

    // Obranná kontrola pred samotným INSERTom (nad rámec toho, že tlačidlo
    // je pri legalHold už disabled) — používateľ nemá vyplniť celý
    // formulár a až pri uložení naraziť na ESBLU_COMPANY_DPA_NOT_ACCEPTED
    // z DB triggera. Netýka sa editácie existujúceho vozidla.
    if (!editingId && legalHold) {
      alert(t("common.legalHoldMessage"));
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

        alert(t("vehicles.messages.vehicleUpdated"));
        setEditingId(null);
        setVehicle(null);
        await loadVehicles();
        return;
      }

      const latestUsage = await refreshPlanUsage();

      if (latestUsage?.isLimited) {
        alert(t("common.planLimitMessage"));
        return;
      }

      const { error } = await supabase.from("vehicles").insert(vehiclePayload());

      if (error) throw error;

      alert(t("vehicles.messages.vehicleSaved"));
      setVehicle(null);
      await Promise.all([loadVehicles(), refreshPlanUsage()]);
    } catch (saveError: unknown) {
      if (isPlanLimitReachedError(saveError, "vehicles")) {
        alert(t("common.planLimitMessage"));
        await refreshPlanUsage();
      } else {
        const message =
          saveError instanceof Error
            ? saveError.message
            : t("vehicles.errors.unknownError");
        alert(
          editingId
            ? t("vehicles.errors.vehicleUpdateFailedPrefix", { message })
            : t("vehicles.errors.vehicleSaveFailedPrefix", { message })
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
    const confirmed = confirm(t("vehicles.list.confirmDeleteVehicle"));
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

    // PZP/technický preukaz priradené k tomuto vozidlu (document_links,
    // pozri esblu_finalize_vehicle_document a
    // 20260820090000_add_documents_vehicle_archive.sql) načítame PRED
    // zmazaním vozidla z rovnakého dôvodu ako fotografie vyššie —
    // document_links.vehicle_id má ON DELETE CASCADE, takže po zmazaní
    // vozidla už nebude možné zistiť, ktoré dokumenty boli naň naviazané.
    // Samotný dokument (public.documents) sa NIKDY nemaže spolu s vozidlom
    // — iba stráca vlastníka, takže ho po zmazaní vozidla vrátime späť do
    // bežného Inbox listingu (archived_from_inbox_at = null), aby nezostal
    // "zavesený" bez akéhokoľvek miesta, kde by bol viditeľný.
    const { data: linkedPzpTpDocs } = await supabase
      .from("document_links")
      .select("document_id, documents!inner(document_type)")
      .eq("vehicle_id", id)
      .eq("company_id", companyId)
      .in("documents.document_type", ["insurance", "vehicle_registration"]);

    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      alert(t("vehicles.errors.vehicleDeleteFailedPrefix", { message: error.message }));
      return;
    }

    const documentIdsToUnarchive = (linkedPzpTpDocs || [])
      .map((row) => row.document_id)
      .filter((docId): docId is string => Boolean(docId));

    if (documentIdsToUnarchive.length > 0) {
      // Vozidlo zmazať smie iba owner/admin (vehicles_delete_owner_admin) —
      // teda aj tento plain UPDATE na documents (bežne owner/admin only,
      // documents_update_owner_admin) je tu vždy v súlade s RLS, keďže sme
      // sa sem dostali iba vďaka tomu, že volajúci už owner/admin je.
      const { error: unarchiveError } = await supabase
        .from("documents")
        .update({ archived_from_inbox_at: null })
        .in("id", documentIdsToUnarchive)
        .eq("company_id", companyId);

      if (unarchiveError) {
        console.error(
          "Dokumenty zmazaného vozidla sa nepodarilo vrátiť do Inboxu:",
          unarchiveError
        );
      }
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
      <BackLink href="/" label={t("inbox.backToMenu")} className="mb-4" />

      <div className="flex items-center gap-4">
  <img
    src="/images/van.png"
    alt={t("nav.vehicles")}
    className="h-20 w-20 object-contain"
  />
  <h1 className="text-4xl font-bold text-primary">{t("nav.vehicles")}</h1>
</div>

      <p className="mt-4 text-secondary">
        {t("vehicles.list.subtitle")}
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
            <h2 className="text-xl font-bold">{t("vehicles.list.addViaInboxTitle")}</h2>
            <p className="mt-1 text-sm text-secondary">
              {t("vehicles.list.addViaInboxDescription")}
            </p>
          </div>
          <Link
            href="/ai-evidencia"
            className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
          >
            {t("vehicles.list.openInboxCta")}
          </Link>
        </div>
      )}

      {/* Pridávanie fotografií smie aj employee (rovnaké oprávnenie ako
          SELECT/INSERT na vehicle_photos) — samotné vozidlá (vytváranie/
          úprava/mazanie v tomto module) ostávajú employeeovi naďalej
          nedostupné, toto sa ich netýka. */}
      {role && (
        <div className="mt-6 rounded-2xl border border-subtle bg-surface-1 p-6 shadow-lg backdrop-blur-xl">
          <h2 className="text-xl font-bold">{t("vehicles.gallery.addPhotosTitle")}</h2>
          <p className="mt-1 text-sm text-secondary">
            {t("vehicles.gallery.addPhotosDescription")}
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={photoTargetVehicleId}
              onChange={(e) => setPhotoTargetVehicleId(e.target.value)}
              className="rounded-xl border border-subtle bg-surface-2 px-4 py-3 outline-none sm:flex-1"
            >
              <option value="">{t("inbox.chooseVehiclePlaceholder")}</option>
              {vehicles.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.spz || t("inbox.noPlateCapitalized")}
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
              {isUploadingVehiclePhotos ? t("inbox.uploading") : t("vehicles.gallery.takeOrUploadPhotos")}
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
              {t("vehicles.list.noneYetShort")}
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
            {editingId ? t("vehicles.forms.editVehicleTitle") : t("vehicles.forms.reviewVehicleTitle")}
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              [t("inbox.fields.spz"), "spz"],
              [t("inbox.fields.vin"), "vin"],
              [t("inbox.fields.znacka"), "znacka"],
              [t("inbox.fields.model"), "model"],
              [t("inbox.fields.rokVyroby"), "rokVyroby"],
              [t("inbox.fields.palivo"), "palivo"],
              [t("inbox.fields.objemMotora"), "objemMotora"],
              [t("inbox.fields.vykon"), "vykon"],
              [t("inbox.fields.farba"), "farba"],
              [t("inbox.fields.datumPrvejEvidencie"), "datumPrvejEvidencie"],
              [t("vehicles.fields.hmotnost"), "hmotnost"],
              [t("inbox.fields.pocetMiest"), "pocetMiest"],
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
                {t("vehicles.fields.stkValidUntil")}
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
                {t("vehicles.fields.ekValidUntil")}
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
                ? t("common.buttons.saving")
                : editingId
                ? t("vehicles.forms.saveChanges")
                : t("vehicles.forms.saveVehicle")}
            </button>

            {editingId && (
              <button
                onClick={cancelEdit}
                className="rounded-xl bg-surface-2 px-6 py-3 text-primary hover:bg-surface-hover"
              >
                {t("vehicles.forms.cancelEdit")}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-4 text-2xl font-bold text-primary">
  {t("vehicles.list.savedVehiclesTitle")}
</h2>

        {vehicles.length === 0 ? (
          <div className="rounded-2xl bg-surface-1 p-6 shadow">
            <p className="text-muted-esblu">
              {t("vehicles.list.noneYet")}
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
