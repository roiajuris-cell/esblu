"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BackLink from "@/app/components/BackLink";
import {
  getMyActiveMembership,
  isOwnerOrAdmin,
  type CompanyMemberRole,
} from "@/lib/company";
import { useCompanyDpaLegalHold } from "@/app/components/CompanyDpaGate";
import { LEGAL_HOLD_MESSAGE } from "@/lib/company-dpa";

// Dokumenty priradené k vozidlu z AI Inboxu (PZP, technický preukaz) —
// bod 2/3 zadania: po potvrdení v Inboxe majú tieto dokumenty "skončiť"
// priamo pri vozidle. Reuse existujúceho document/document_links modelu
// (žiadna nová tabuľka) — rovnaké riadky, aké appka už zapisuje z
// app/ai-evidencia, iba čítané tu cez vehicle_id namiesto company_id.
const LINKED_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  insurance: "PZP / poistná zmluva",
  vehicle_registration: "Technický preukaz",
};

const LINKED_ATTACHMENT_TYPE_LABELS: Record<string, string> = {
  white_card: "Biela karta",
  green_card: "Zelená karta / potvrdenie o poistení",
  insurance_event: "Záznam o poistnej udalosti",
  vehicle_registration_back: "Zadná strana technického preukazu",
  other: "Iný súvisiaci dokument",
};

type LinkedVehicleDocument = {
  id: string;
  document_type: string | null;
  extracted_fields: Record<string, unknown> | null;
  storage_bucket: string | null;
  storage_path: string | null;
  original_filename: string | null;
  created_at: string | null;
  signedUrl: string | null;
  attachments: {
    id: string;
    attachment_type: string;
    signedUrl: string | null;
  }[];
};

function describeInsuranceSummary(fields: Record<string, unknown> | null): string {
  if (!fields) return "";
  const provider = typeof fields.provider === "string" ? fields.provider : "";
  const policyNumber =
    typeof fields.policyNumber === "string" ? fields.policyNumber : "";
  const parts = [provider, policyNumber ? `č. ${policyNumber}` : ""].filter(
    Boolean
  );
  return parts.join(" — ");
}

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

export default function VehicleDetailPage() {
  const { id } = useParams();
  const vehicleId = String(id);

  const [vehicle, setVehicle] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [role, setRole] = useState<CompanyMemberRole | null>(null);
  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [photos, setPhotos] = useState<any[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<any>(null);
  const [linkedDocuments, setLinkedDocuments] = useState<
    LinkedVehicleDocument[]
  >([]);
  const [linkedDocumentsLoading, setLinkedDocumentsLoading] = useState(false);

  const emptyService = {
    service_date: "",
    mileage: "",
    title: "",
    description: "",
    cost: "",
    technician: "",
    next_service_date: "",
  };

  const [service, setService] = useState(emptyService);
  const { legalHold } = useCompanyDpaLegalHold();

  useEffect(() => {
    loadVehicle();
    loadServices();
    loadMembership();
  }, []);

  async function loadMembership() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    setUserId(session?.user?.id || "");

    const membership = await getMyActiveMembership();
    setRole(membership?.role ?? null);
    setCompanyId(membership?.company_id ?? "");

    if (membership?.company_id) {
      loadPhotos(membership.company_id);
      loadLinkedDocuments(membership.company_id);
    }
  }

  // Dokumenty priradené k tomuto vozidlu z AI Inboxu (PZP, technický
  // preukaz) — pozri komentár pri LINKED_DOCUMENT_TYPE_LABELS vyššie.
  // Číta výhradne existujúce public.documents/document_links/
  // document_attachments (žiadna nová tabuľka), RLS je rovnaká pre
  // owner/admin/employee (SELECT je pre všetky aktívne role firmy).
  async function loadLinkedDocuments(currentCompanyId: string = companyId) {
    if (!currentCompanyId) {
      setLinkedDocuments([]);
      return;
    }

    setLinkedDocumentsLoading(true);

    try {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, document_type, extracted_fields, storage_bucket, storage_path, original_filename, created_at, document_links!inner(vehicle_id)"
        )
        .eq("company_id", currentCompanyId)
        .eq("document_links.vehicle_id", vehicleId)
        .in("document_type", ["insurance", "vehicle_registration"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error || !data) {
        console.error("Chyba pri načítaní dokumentov vozidla:", error);
        setLinkedDocuments([]);
        return;
      }

      type LinkedDocumentRow = {
        id: string;
        document_type: string | null;
        extracted_fields: Record<string, unknown> | null;
        storage_bucket: string | null;
        storage_path: string | null;
        original_filename: string | null;
        created_at: string | null;
      };
      type LinkedAttachmentRow = {
        id: string;
        document_id: string;
        storage_bucket: string;
        storage_path: string;
        attachment_type: string;
      };

      const documentRows = data as unknown as LinkedDocumentRow[];
      const documentIds = documentRows.map((doc) => doc.id);

      const { data: attachmentsData, error: attachmentsError } =
        documentIds.length > 0
          ? await supabase
              .from("document_attachments")
              .select("id, document_id, storage_bucket, storage_path, attachment_type")
              .eq("company_id", currentCompanyId)
              .in("document_id", documentIds)
          : { data: [] as LinkedAttachmentRow[], error: null };

      if (attachmentsError) {
        console.error(
          "Chyba pri načítaní príloh dokumentov vozidla:",
          attachmentsError
        );
      }

      const enriched = await Promise.all(
        documentRows.map(async (doc) => {
          let signedUrl: string | null = null;

          if (doc.storage_bucket && doc.storage_path) {
            const { data: signed } = await supabase.storage
              .from(doc.storage_bucket)
              .createSignedUrl(doc.storage_path, 3600);
            signedUrl = signed?.signedUrl ?? null;
          }

          const docAttachments = ((attachmentsData as LinkedAttachmentRow[]) || []).filter(
            (a) => a.document_id === doc.id
          );

          const attachmentsWithUrls = await Promise.all(
            docAttachments.map(async (a) => {
              let attachmentUrl: string | null = null;

              if (a.storage_bucket && a.storage_path) {
                const { data: signed } = await supabase.storage
                  .from(a.storage_bucket)
                  .createSignedUrl(a.storage_path, 3600);
                attachmentUrl = signed?.signedUrl ?? null;
              }

              return {
                id: a.id,
                attachment_type: a.attachment_type,
                signedUrl: attachmentUrl,
              };
            })
          );

          return {
            id: doc.id,
            document_type: doc.document_type,
            extracted_fields: doc.extracted_fields,
            storage_bucket: doc.storage_bucket,
            storage_path: doc.storage_path,
            original_filename: doc.original_filename,
            created_at: doc.created_at,
            signedUrl,
            attachments: attachmentsWithUrls,
          } as LinkedVehicleDocument;
        })
      );

      setLinkedDocuments(enriched);
    } finally {
      setLinkedDocumentsLoading(false);
    }
  }

  async function loadPhotos(currentCompanyId: string = companyId) {
    if (!currentCompanyId) return;

    const { data, error } = await supabase
      .from("vehicle_photos")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false });

    if (!error) setPhotos(data || []);
  }

  function photoUrl(path: string) {
    const { data } = supabase.storage.from("vehicle-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadVehiclePhotos(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0 || !userId) return;

    if (legalHold) {
      alert(LEGAL_HOLD_MESSAGE);
      return;
    }

    setIsUploadingPhotos(true);

    const uploadedPaths: string[] = [];
    let failedCount = 0;

    try {
      for (const originalFile of files) {
        try {
          const compressedFile = await compressVehiclePhoto(originalFile);
          const filePath = `${userId}/${vehicleId}/${Date.now()}-${crypto.randomUUID()}-${compressedFile.name}`;

          const { error: uploadError } = await supabase.storage
            .from("vehicle-photos")
            .upload(filePath, compressedFile, {
              cacheControl: "3600",
              upsert: false,
              contentType: compressedFile.type,
            });

          if (uploadError) throw uploadError;

          uploadedPaths.push(filePath);

          const { error: dbError } = await supabase
            .from("vehicle_photos")
            .insert({
              user_id: userId,
              vehicle_id: vehicleId,
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

      await loadPhotos();

      if (failedCount > 0) {
        alert(
          `${failedCount} z ${files.length} fotografií sa nepodarilo nahrať. Skús to znova.`
        );
      }
    } finally {
      setIsUploadingPhotos(false);
    }
  }

  async function deletePhoto(photo: any) {
    if (deletingPhotoId) return;

    const photoId = String(photo?.id || "");
    if (!photoId) return;

    const confirmed = confirm("Naozaj chceš vymazať túto fotografiu?");
    if (!confirmed) return;

    setDeletingPhotoId(photoId);

    try {
      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error("Nie ste prihlásený. Prihláste sa a skúste to znova.");
      }

      const { data: deletedPhotos, error: deleteError } = await supabase
        .from("vehicle_photos")
        .delete()
        .eq("id", photoId)
        .eq("vehicle_id", vehicleId)
        .eq("company_id", membership.company_id)
        .select("id, storage_path");

      if (deleteError) throw deleteError;

      if (deletedPhotos?.length !== 1) {
        throw new Error(
          "Fotografia sa v databáze nevymazala. Záznam neexistuje alebo na jeho vymazanie nemáte oprávnenie."
        );
      }

      setPhotos((current) => current.filter((p) => String(p.id) !== photoId));
      setLightboxPhoto((current: any) =>
        current && String(current.id) === photoId ? null : current
      );

      const deletedPath = deletedPhotos[0].storage_path;

      if (deletedPath) {
        const { error: storageError } = await supabase.storage
          .from("vehicle-photos")
          .remove([deletedPath]);

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
      const message =
        deleteError instanceof Error ? deleteError.message : "Neznáma chyba.";
      alert("Chyba pri mazaní fotografie: " + message);
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function loadVehicle() {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .single();

    if (!error) setVehicle(data);
  }

  async function loadServices() {
    const { data, error } = await supabase
      .from("vehicle_services")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("service_date", { ascending: false });

    if (!error) setServices(data || []);
  }

  function updateService(key: string, value: string) {
    setService((prev) => ({ ...prev, [key]: value }));
  }

  function startEditService(item: any) {
    setEditingServiceId(item.id);
    setShowForm(true);

    setService({
      service_date: item.service_date || "",
      mileage: item.mileage || "",
      title: item.title || "",
      description: item.description || "",
      cost: item.cost || "",
      technician: item.technician || "",
      next_service_date: item.next_service_date || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelServiceEdit() {
    setEditingServiceId(null);
    setService(emptyService);
    setShowForm(false);
  }

  async function saveService() {
    if (!service.service_date || !service.title) {
      alert("Vyplň dátum servisu a názov servisu.");
      return;
    }

    // Obranná kontrola pred INSERTom — DB trigger na vehicle_services by
    // to aj tak odmietol (ESBLU_COMPANY_DPA_NOT_ACCEPTED), ale používateľ
    // nemá vyplniť celý formulár a až pri uložení naraziť na chybu.
    // Úpravu existujúceho servisu (editingServiceId nastavené) neblokuje.
    if (!editingServiceId && legalHold) {
      alert(LEGAL_HOLD_MESSAGE);
      return;
    }

    setIsSaving(true);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsSaving(false);
      alert("Na uloženie servisného záznamu musíte byť prihlásený.");
      return;
    }

    const payload = {
      user_id: user.id,
      vehicle_id: vehicleId,
      service_date: service.service_date,
      mileage: service.mileage ? Number(service.mileage) : null,
      title: service.title,
      description: service.description || null,
      cost: service.cost ? Number(service.cost) : null,
      technician: service.technician || null,
      next_service_date: service.next_service_date || null,
    };

    const { error } = editingServiceId
      ? await supabase
          .from("vehicle_services")
          .update(payload)
          .eq("id", editingServiceId)
      : await supabase.from("vehicle_services").insert(payload);

    setIsSaving(false);

    if (error) {
      alert("Chyba pri ukladaní servisu: " + error.message);
      return;
    }

    setService(emptyService);
    setEditingServiceId(null);
    setShowForm(false);
    loadServices();
  }

  async function deleteService(serviceId: string) {
    const confirmed = confirm("Naozaj chceš vymazať tento servis?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("vehicle_services")
      .delete()
      .eq("id", serviceId);

    if (error) {
      alert("Chyba pri mazaní servisu: " + error.message);
      return;
    }

    loadServices();
  }

  if (!vehicle) {
    return <div className="p-10">Načítavam...</div>;
  }

  return (
    <main className="app-shell-bg min-h-screen p-10">
      <BackLink href="/vozidla" label="Vozidlá" className="mb-4" />

      <h1 className="text-4xl font-bold">
        {vehicle.znacka} {vehicle.model}
      </h1>

      <div className="surface-card mt-8 p-8">
        <div className="grid grid-cols-2 gap-5">
          <p><b>ŠPZ:</b> {vehicle.spz}</p>
          <p><b>VIN:</b> {vehicle.vin}</p>
          <p><b>Rok výroby:</b> {vehicle.rok_vyroby}</p>
          <p><b>Palivo:</b> {vehicle.palivo}</p>
          <p><b>Výkon:</b> {vehicle.vykon}</p>
          <p><b>Objem:</b> {vehicle.objem}</p>
          <p><b>Farba:</b> {vehicle.farba}</p>
          <p><b>Hmotnosť:</b> {vehicle.hmotnost}</p>
          <p><b>Počet miest:</b> {vehicle.pocet_miest}</p>
          <p><b>STK:</b> {vehicle.stk || "nedoplnené"}</p>
          <p><b>EK:</b> {vehicle.ek || "nedoplnené"}</p>
        </div>
      </div>

      <div className="surface-card mt-10 p-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">História servisov</h2>

          <button
            onClick={() => {
              if (!editingServiceId && legalHold) {
                alert(LEGAL_HOLD_MESSAGE);
                return;
              }
              setShowForm(!showForm);
              setEditingServiceId(null);
              setService(emptyService);
            }}
            disabled={!editingServiceId && legalHold && !showForm}
            className="rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            ➕ Pridať servis
          </button>
        </div>

        {!editingServiceId && legalHold && (
          <p className="mt-3 text-sm text-amber-400">
            {LEGAL_HOLD_MESSAGE}
          </p>
        )}

        {showForm && (
          <div className="mt-6 rounded-2xl border border-subtle bg-surface-2 p-6">
            <h3 className="mb-4 text-xl font-bold">
              {editingServiceId ? "Upraviť servis" : "Pridať servis"}
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input
                type="date"
                className="rounded-xl border p-3"
                value={service.service_date}
                onChange={(e) => updateService("service_date", e.target.value)}
              />

              <input
                type="number"
                placeholder="Stav km"
                className="rounded-xl border p-3"
                value={service.mileage}
                onChange={(e) => updateService("mileage", e.target.value)}
              />

              <input
                placeholder="Názov servisu"
                className="rounded-xl border p-3"
                value={service.title}
                onChange={(e) => updateService("title", e.target.value)}
              />

              <input
                type="number"
                placeholder="Cena €"
                className="rounded-xl border p-3"
                value={service.cost}
                onChange={(e) => updateService("cost", e.target.value)}
              />

              <input
                placeholder="Servisoval"
                className="rounded-xl border p-3"
                value={service.technician}
                onChange={(e) => updateService("technician", e.target.value)}
              />

              <input
                type="date"
                className="rounded-xl border p-3"
                value={service.next_service_date}
                onChange={(e) =>
                  updateService("next_service_date", e.target.value)
                }
              />
            </div>

            <textarea
              placeholder="Popis servisu"
              className="mt-4 w-full rounded-xl border p-3"
              value={service.description}
              onChange={(e) => updateService("description", e.target.value)}
            />

            <div className="mt-4 flex gap-3">
              <button
                onClick={saveService}
                disabled={isSaving}
                className="rounded-xl bg-green-600 px-5 py-3 text-white hover:bg-green-700 disabled:bg-gray-400"
              >
                {isSaving
                  ? "Ukladám..."
                  : editingServiceId
                  ? "💾 Uložiť zmeny"
                  : "💾 Uložiť servis"}
              </button>

              {editingServiceId && (
                <button
                  onClick={cancelServiceEdit}
                  className="rounded-xl bg-surface-2 px-5 py-3 text-primary hover:bg-surface-hover"
                >
                  Zrušiť úpravu
                </button>
              )}
            </div>
          </div>
        )}

        {services.length === 0 ? (
          <p className="mt-6 text-muted-esblu">
            Zatiaľ nebol pridaný žiadny servis.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {services.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-subtle bg-surface-2 p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-primary">
                      🔧 {item.title}
                    </h3>

                    <p className="mt-1 text-sm text-muted-esblu">
                      📅 {item.service_date}
                    </p>
                  </div>

                  <div className="badge-success rounded-xl px-4 py-2 text-lg font-bold">
                    {item.cost ? `${item.cost} €` : "Cena neuvedená"}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl bg-surface-1 p-4">
                    <p className="text-sm text-muted-esblu">Stav km</p>
                    <p className="text-lg font-bold">
                      {item.mileage ? `${item.mileage} km` : "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-surface-1 p-4">
                    <p className="text-sm text-muted-esblu">Servisoval</p>
                    <p className="text-lg font-bold">
                      {item.technician || "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-surface-1 p-4">
                    <p className="text-sm text-muted-esblu">Ďalší servis</p>
                    <p className="text-lg font-bold">
                      {item.next_service_date || "—"}
                    </p>
                  </div>
                </div>

                {item.description && (
                  <p className="mt-5 rounded-xl bg-surface-1 p-4 text-secondary">
                    {item.description}
                  </p>
                )}

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => startEditService(item)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    ✏️ Upraviť
                  </button>

                  {role !== "employee" && (
                    <button
                      onClick={() => deleteService(item.id)}
                      className="rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                    >
                      🗑 Vymazať
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card mt-10 p-8">
        <h2 className="text-2xl font-bold">📄 PZP a technický preukaz</h2>
        <p className="mt-1 text-sm text-muted-esblu">
          Dokumenty potvrdené v AI Inboxe a priradené k tomuto vozidlu.
        </p>

        {linkedDocumentsLoading ? (
          <p className="mt-6 text-muted-esblu">Načítavam dokumenty...</p>
        ) : linkedDocuments.length === 0 ? (
          <p className="mt-6 text-muted-esblu">
            Zatiaľ tu nie je priradené žiadne PZP ani technický preukaz.
            Nahraj ich cez AI Inbox — po potvrdení sa automaticky zobrazia tu.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {linkedDocuments.map((doc) => (
              <div
                key={doc.id}
                className="rounded-2xl border border-subtle bg-surface-2 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-primary">
                      {LINKED_DOCUMENT_TYPE_LABELS[doc.document_type || ""] ||
                        "Dokument"}
                    </h3>

                    {doc.document_type === "insurance" && (
                      <p className="mt-1 text-sm text-muted-esblu">
                        {describeInsuranceSummary(doc.extracted_fields) ||
                          "Bez ďalších podrobností"}
                      </p>
                    )}

                    {doc.created_at && (
                      <p className="mt-1 text-xs text-muted-esblu">
                        Nahraté {new Date(doc.created_at).toLocaleDateString("sk-SK")}
                      </p>
                    )}
                  </div>

                  {doc.signedUrl && (
                    <a
                      href={doc.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Otvoriť
                    </a>
                  )}
                </div>

                {doc.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {doc.attachments.map((attachment) =>
                      attachment.signedUrl ? (
                        <a
                          key={attachment.id}
                          href={attachment.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-xs font-semibold text-secondary hover:bg-surface-hover"
                        >
                          {LINKED_ATTACHMENT_TYPE_LABELS[
                            attachment.attachment_type
                          ] || "Príloha"}
                        </a>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card mt-10 p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">📷 Fotografie vozidla</h2>

          {/* Pridávanie fotografií smie aj employee (rovnaké oprávnenie ako
              SELECT/INSERT na vehicle_photos) — vymazanie fotografie ostáva
              iba owner/admin nižšie. Toto sa netýka samotného vozidla
              (vehicles) — employee ho naďalej nemôže editovať ani mazať. */}
          <div className="flex gap-3">
            <label className="cursor-pointer rounded-xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700">
              {isUploadingPhotos ? "Nahrávam..." : "📷 Odfotiť"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={uploadVehiclePhotos}
                disabled={isUploadingPhotos || legalHold}
              />
            </label>

            <label className="cursor-pointer rounded-xl border border-subtle bg-surface-1 px-5 py-3 text-secondary">
              🖼️ Pridať fotografie
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={uploadVehiclePhotos}
                disabled={isUploadingPhotos || legalHold}
              />
            </label>
          </div>
        </div>

        {legalHold && (
          <p className="mt-3 text-sm text-amber-400">{LEGAL_HOLD_MESSAGE}</p>
        )}

        {photos.length === 0 ? (
          <p className="mt-6 text-muted-esblu">
            Zatiaľ nie sú pridané žiadne fotografie vozidla.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="rounded-xl border border-subtle bg-surface-2 p-2"
              >
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(photo)}
                  className="block w-full"
                >
                  <img
                    src={photoUrl(photo.storage_path)}
                    alt="Fotografia vozidla"
                    className="h-32 w-full rounded-lg object-cover sm:h-36"
                  />
                </button>

                {isOwnerOrAdmin(role) && (
                  <button
                    onClick={() => deletePhoto(photo)}
                    disabled={deletingPhotoId !== null}
                    className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {deletingPhotoId === String(photo.id)
                      ? "Mažem..."
                      : "🗑 Vymazať"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl">
            <img
              src={photoUrl(lightboxPhoto.storage_path)}
              alt="Fotografia vozidla — zväčšený náhľad"
              className="max-h-[90vh] max-w-full rounded-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-4 -right-4 rounded-full bg-surface-1 px-3 py-2 text-lg font-bold text-primary shadow-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
