"use client";

import { useRef, useState, useEffect } from "react";
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
import { apiUrl } from "@/lib/api-url";
import { REQUEST_LOCALE_HEADER } from "@/lib/i18n/request-locale";
import { compressImage } from "@/lib/image-compress";
import {
  VIGNETTE_COUNTRIES,
  VIGNETTE_OTHER_COUNTRY_OPTION,
  isValidVignetteCountryCode,
  vignetteCountryLabel,
  type DraftVehicleVignette,
} from "@/lib/vehicle-vignettes";

// Diaľničné známky v TP review formulári — zoznam krajín, typ a lokalizovaný
// label sú zdieľané z lib/vehicle-vignettes.ts (rovnaký zdroj pravdy ako
// sekcia "Diaľničné známky" v detaile vozidla), nie duplikované natvrdo.
type RegistrationVignetteRow = DraftVehicleVignette & {
  // UI-only pole (neposiela sa na server) — riadi, či select zobrazuje
  // krajinu zo zoznamu, alebo voľný ISO alpha-2 vstup ("Iná krajina").
  countryMode: "list" | "custom";
};

// Vozidlo nájdené podľa VIN/ŠPZ pri spracovaní technického preukazu —
// presunuté z pôvodného Inbox (ai-evidencia) TP flow bezo zmeny správania
// (bod 2 zadania "UX reorganizácia Inbox + Vozidlá + Chat").
async function findDuplicateVehicle(
  companyId: string,
  vin: unknown,
  spz: unknown
): Promise<any | null> {
  const normalizedSpz = normalizeSpz(spz);
  const trimmedVin =
    typeof vin === "string" && vin.trim() ? vin.trim().toUpperCase() : "";

  if (!normalizedSpz && !trimmedVin) return null;

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("company_id", companyId);

  if (error || !data) {
    console.error("Chyba pri hľadaní duplicitného vozidla:", error);
    return null;
  }

  const vinMatch = trimmedVin
    ? data.find(
        (vehicle) =>
          typeof vehicle.vin === "string" &&
          vehicle.vin.trim().toUpperCase() === trimmedVin
      )
    : undefined;

  if (vinMatch) return vinMatch;

  if (!normalizedSpz) return null;

  return (
    data.find((vehicle) => normalizeSpz(vehicle.spz) === normalizedSpz) ??
    null
  );
}

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
  const { t, tCount, locale } = useLocale();
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

  // ---------------------------------------------------------------------
  // Technický preukaz vozidla (TP) — presunuté z Inbox (app/ai-evidencia/
  // page.tsx) do Vozidlá (bod 2 zadania "UX reorganizácia Inbox + Vozidlá +
  // Chat"): predná + voliteľná zadná strana sa spracujú AI ako JEDEN
  // dokument cez /api/scan-vehicle-registration (nie generický
  // /api/scan-document — ten TP typ dokumentu ani nepovoľuje). Vozidlo sa
  // vytvorí/aktualizuje AŽ po výslovnom potvrdení používateľom — rovnaká AI
  // Evidence zásada ako predtým v Inbox. Stav, handlery aj JSX sú presunuté
  // bezo zmeny správania.
  // ---------------------------------------------------------------------
  const [showRegistrationFlow, setShowRegistrationFlow] = useState(false);
  const [regFrontFile, setRegFrontFile] = useState<File | null>(null);
  const [regFrontPreview, setRegFrontPreview] = useState<string | null>(null);
  const [regBackFile, setRegBackFile] = useState<File | null>(null);
  const [regBackPreview, setRegBackPreview] = useState<string | null>(null);
  const [isPreparingRegFront, setIsPreparingRegFront] = useState(false);
  const [isPreparingRegBack, setIsPreparingRegBack] = useState(false);
  const [isProcessingRegistration, setIsProcessingRegistration] =
    useState(false);
  const [isSavingRegistration, setIsSavingRegistration] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [registrationFields, setRegistrationFields] = useState<Record<
    string,
    string
  > | null>(null);
  // Vozidlo nájdené podľa VIN/ŠPZ pri spracovaní technického preukazu —
  // ak je nastavené, uloženie AKTUALIZUJE toto vozidlo namiesto vytvorenia
  // duplicity.
  const [registrationDuplicateVehicle, setRegistrationDuplicateVehicle] =
    useState<any | null>(null);
  // Diaľničné známky zadané RUČNE v review formulári (AI ich z technického
  // preukazu neextrahuje, štandardne ho ani neobsahuje). Každý riadok je
  // nezávislý {country_code, valid_until} — voliteľné, predvolene prázdny
  // zoznam, pridávaný tlačidlom "+ Pridať ďalšiu známku". Uložené sú AŽ v
  // saveRegistrationDocument(), rovnakým vehicle_vignettes upsertom
  // (vehicle_id, country_code) ako v detaile vozidla — žiadny paralelný
  // dátový model.
  const [registrationVignettes, setRegistrationVignettes] = useState<
    RegistrationVignetteRow[]
  >([]);
  const saveRegistrationInProgressRef = useRef(false);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    return () => {
      if (regFrontPreview) URL.revokeObjectURL(regFrontPreview);
    };
  }, [regFrontPreview]);

  useEffect(() => {
    return () => {
      if (regBackPreview) URL.revokeObjectURL(regBackPreview);
    };
  }, [regBackPreview]);

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

  function clearRegistrationResult() {
    setRegistrationError("");
    setRegistrationFields(null);
    setRegistrationDuplicateVehicle(null);
    setRegistrationVignettes([]);
  }

  function clearRegistrationImages() {
    setRegFrontFile(null);
    setRegFrontPreview(null);
    setRegBackFile(null);
    setRegBackPreview(null);
    clearRegistrationResult();
  }

  async function handleRegistrationFileChange(
    side: "front" | "back",
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const setPreparing =
      side === "front" ? setIsPreparingRegFront : setIsPreparingRegBack;
    setPreparing(true);
    clearRegistrationResult();

    try {
      const compressedFile = await compressImage(file, 0, t);
      const previewUrl = URL.createObjectURL(compressedFile);

      if (side === "front") {
        setRegFrontFile(compressedFile);
        setRegFrontPreview(previewUrl);
      } else {
        setRegBackFile(compressedFile);
        setRegBackPreview(previewUrl);
      }
    } catch (fileError) {
      setRegistrationError(
        fileError instanceof Error
          ? fileError.message
          : t("inbox.errors.photoProcessFailed")
      );
    } finally {
      setPreparing(false);
    }
  }

  function removeRegistrationImage(side: "front" | "back") {
    if (side === "front") {
      setRegFrontFile(null);
      setRegFrontPreview(null);
    } else {
      setRegBackFile(null);
      setRegBackPreview(null);
    }

    clearRegistrationResult();
  }

  function updateRegistrationField(key: string, value: string) {
    setRegistrationFields((prev) => ({ ...(prev || {}), [key]: value }));
  }

  function addRegistrationVignetteRow() {
    setRegistrationVignettes((prev) => [
      ...prev,
      { country_code: "", valid_until: "", countryMode: "list" },
    ]);
  }

  function updateRegistrationVignetteRow(
    index: number,
    key: "country_code" | "valid_until",
    value: string
  ) {
    setRegistrationVignettes((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  }

  // Select nastaví buď priamo krajinu zo zoznamu, alebo (pri
  // VIGNETTE_OTHER_COUNTRY_OPTION) prepne daný riadok na voľný ISO alpha-2
  // vstup — rovnaký vzor ako v sekcii "Diaľničné známky" v detaile vozidla.
  function handleRegistrationVignetteCountrySelect(
    index: number,
    value: string
  ) {
    setRegistrationVignettes((prev) =>
      prev.map((row, i) =>
        i === index
          ? value === VIGNETTE_OTHER_COUNTRY_OPTION
            ? { ...row, country_code: "", countryMode: "custom" }
            : { ...row, country_code: value, countryMode: "list" }
          : row
      )
    );
  }

  function handleRegistrationVignetteCustomCountryInput(
    index: number,
    value: string
  ) {
    updateRegistrationVignetteRow(
      index,
      "country_code",
      value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2)
    );
  }

  function removeRegistrationVignetteRow(index: number) {
    setRegistrationVignettes((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleProcessRegistration() {
    if (!regFrontFile) {
      setRegistrationError(t("inbox.errors.addFrontFirst"));
      return;
    }

    if (legalHold) {
      setRegistrationError(t("common.legalHoldMessage"));
      return;
    }

    setIsProcessingRegistration(true);
    setRegistrationError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error(t("inbox.errors.aiLoginRequired"));
      }

      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error(t("inbox.errors.notLoggedIn"));
      }

      const formData = new FormData();
      formData.append("front", regFrontFile);

      if (regBackFile) {
        formData.append("back", regBackFile);
      }

      const response = await fetch(apiUrl("/api/scan-vehicle-registration"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          [REQUEST_LOCALE_HEADER]: locale,
        },
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || t("inbox.errors.registrationAiFailed"));
      }

      const extracted = data.data as Record<string, string | null>;
      const normalizedSpz = normalizeSpz(extracted.spz);
      const normalizedFields: Record<string, string> = {};

      Object.entries(extracted).forEach(([key, value]) => {
        normalizedFields[key] = value ?? "";
      });
      normalizedFields.spz = normalizedSpz || "";

      setRegistrationFields(normalizedFields);

      const duplicate = await findDuplicateVehicle(
        companyId,
        extracted.vin,
        normalizedSpz
      );
      setRegistrationDuplicateVehicle(duplicate);
    } catch (processingError: unknown) {
      setRegistrationError(
        processingError instanceof Error
          ? processingError.message
          : t("inbox.errors.registrationAiFailedGeneric")
      );
    } finally {
      setIsProcessingRegistration(false);
    }
  }

  function registrationVehiclePayload(userIdForPayload: string) {
    const f = registrationFields || {};

    return {
      user_id: userIdForPayload,
      spz: normalizeSpz(f.spz),
      vin: f.vin || null,
      znacka: f.znacka || null,
      model: f.model || null,
      rok_vyroby: f.rokVyroby ? Number(f.rokVyroby) : null,
      palivo: f.palivo || null,
      objem: f.objemMotora ? Number(f.objemMotora) : null,
      vykon: f.vykon || null,
      farba: f.farba || null,
      hmotnost: f.prevadzkovaHmotnost
        ? Number(String(f.prevadzkovaHmotnost).replace(" kg", ""))
        : null,
      pocet_miest: f.pocetMiest ? Number(f.pocetMiest) : null,
      datum_prvej_evidencie: f.datumPrvejEvidencie || null,
    };
  }

  async function saveRegistrationDocument() {
    if (!registrationFields || saveRegistrationInProgressRef.current) return;

    if (legalHold) {
      setRegistrationError(t("common.legalHoldMessage"));
      return;
    }

    // Riadok s vyplnenou iba jednou z dvoch hodnôt (krajina bez dátumu
    // alebo naopak) by inak ticho zmizol pri uložení — radšej používateľa
    // upozorniť, než mlčky zahodiť polovicu jeho vstupu. Úplne prázdny
    // riadok (obe hodnoty prázdne) je v poriadku, iba sa neskôr preskočí.
    const hasIncompleteVignetteRow = registrationVignettes.some(
      (row) => Boolean(row.country_code) !== Boolean(row.valid_until)
    );

    if (hasIncompleteVignetteRow) {
      setRegistrationError(t("inbox.errors.vignetteRowIncomplete"));
      return;
    }

    // Riadok v custom režime ("Iná krajina") s vyplneným, ale neplatným
    // ISO alpha-2 kódom — rovnaká kontrola ako v detaile vozidla,
    // server-side CHECK ostáva konečná autorita.
    const hasInvalidVignetteCountryCode = registrationVignettes.some(
      (row) =>
        row.countryMode === "custom" &&
        row.country_code &&
        !isValidVignetteCountryCode(row.country_code)
    );

    if (hasInvalidVignetteCountryCode) {
      setRegistrationError(t("vehicles.vignettes.invalidCountryCode"));
      return;
    }

    const isNewVehicle = !registrationDuplicateVehicle;

    if (isNewVehicle) {
      const latestVehicleUsage = await refreshPlanUsage();

      if (latestVehicleUsage?.isLimited) {
        setRegistrationError(t("common.planLimitMessage"));
        return;
      }
    }

    saveRegistrationInProgressRef.current = true;
    setIsSavingRegistration(true);
    setRegistrationError("");

    let uploadedFrontPath: string | null = null;
    let uploadedBackPath: string | null = null;
    let documentInserted = false;
    let vehicleWritten = false;
    let documentId: string | null = null;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error(t("inbox.errors.notLoggedIn"));
      }

      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error(t("inbox.errors.notLoggedIn"));
      }

      documentId = crypto.randomUUID();

      const frontUniqueName = `${Date.now()}-${crypto.randomUUID()}.webp`;
      const frontPath = `${session.user.id}/${documentId}/${frontUniqueName}`;

      const { error: frontUploadError } = await supabase.storage
        .from("ai-inbox-documents")
        .upload(frontPath, regFrontFile as File, {
          contentType: (regFrontFile as File).type || "image/webp",
          cacheControl: "3600",
          upsert: false,
        });

      if (frontUploadError) {
        throw new Error(
          t("inbox.errors.frontSaveFailed", { message: frontUploadError.message })
        );
      }

      uploadedFrontPath = frontPath;

      let backPath: string | null = null;

      if (regBackFile) {
        const backUniqueName = `${Date.now()}-${crypto.randomUUID()}.webp`;
        backPath = `${session.user.id}/${documentId}/${backUniqueName}`;

        const { error: backUploadError } = await supabase.storage
          .from("ai-inbox-documents")
          .upload(backPath, regBackFile, {
            contentType: regBackFile.type || "image/webp",
            cacheControl: "3600",
            upsert: false,
          });

        if (backUploadError) {
          throw new Error(
            t("inbox.errors.backSaveFailed", { message: backUploadError.message })
          );
        }

        uploadedBackPath = backPath;
      }

      // Vozidlo — AŽ TERAZ, po výslovnom potvrdení používateľom. Ak bolo
      // nájdené existujúce vozidlo (VIN/ŠPZ), aktualizujeme ho namiesto
      // vytvorenia duplicity; inak vzniká nové vozidlo.
      let vehicleId: string;

      if (registrationDuplicateVehicle) {
        const { data: updated, error: updateError } = await supabase
          .from("vehicles")
          .update(registrationVehiclePayload(session.user.id))
          .eq("id", registrationDuplicateVehicle.id)
          .eq("company_id", membership.company_id)
          .select("id")
          .single();

        if (updateError) throw updateError;

        vehicleId = updated.id;
      } else {
        const { data: inserted, error: insertVehicleError } = await supabase
          .from("vehicles")
          .insert(registrationVehiclePayload(session.user.id))
          .select("id")
          .single();

        if (insertVehicleError) throw insertVehicleError;

        vehicleId = inserted.id;
      }

      vehicleWritten = true;

      const { error: docInsertError } = await supabase
        .from("documents")
        .insert({
          id: documentId,
          user_id: session.user.id,
          storage_bucket: "ai-inbox-documents",
          storage_path: frontPath,
          original_filename: regFrontFile?.name || null,
          mime_type: regFrontFile?.type || null,
          file_size: regFrontFile?.size ?? null,
          document_type: "vehicle_registration",
          status: "confirmed",
          ai_raw_output: {
            documentType: "vehicle_registration",
            fields: registrationFields,
          },
          extracted_fields: registrationFields,
          field_confidence: [],
          note: null,
        });

      if (docInsertError) throw docInsertError;

      documentInserted = true;

      if (backPath) {
        const { error: attachmentError } = await supabase
          .from("document_attachments")
          .insert({
            user_id: session.user.id,
            document_id: documentId,
            storage_bucket: "ai-inbox-documents",
            storage_path: backPath,
            original_filename: regBackFile?.name || null,
            mime_type: regBackFile?.type || null,
            file_size: regBackFile?.size ?? null,
            attachment_type: "vehicle_registration_back",
          });

        if (attachmentError) {
          console.error(
            "Zadnú stranu sa nepodarilo priradiť k dokumentu:",
            attachmentError
          );
        }
      }

      // esblu_finalize_vehicle_document() — rovnaké atomické RPC ako pri PZP
      // v Inbox: upsertne primary document_links riadok A ZÁROVEŇ nastaví
      // documents.archived_from_inbox_at, takže TP po úspešnom uložení
      // vozidla už NIE JE súčasťou Inbox listingu — jeden canonical
      // documents riadok, teraz dostupný z detailu vozidla. Vozidlo aj
      // samotný dokument sú v tomto bode už bezpečne uložené (vehicleWritten
      // && documentInserted) — zlyhanie tohto volania preto NIKDY nestratí
      // vozidlo ani dokument, iba TP dočasne ostane viditeľné aj v Inboxe
      // (bezpečný, opraviteľný stav, nie strata dát).
      const { error: finalizeError } = await supabase.rpc(
        "esblu_finalize_vehicle_document",
        {
          p_document_id: documentId,
          p_vehicle_id: vehicleId,
        }
      );

      if (finalizeError) {
        console.error(
          "Priradenie technického preukazu k vozidlu sa nepodarilo dokončiť:",
          finalizeError
        );
      }

      const { error: logError } = await supabase
        .from("document_review_log")
        .insert({
          document_id: documentId,
          document_ref: documentId,
          user_id: session.user.id,
          action: "created",
        });

      if (logError) {
        console.error(
          "Záznam do document_review_log sa nepodarilo uložiť:",
          logError
        );
      }

      // Diaľničné známky zadané v review formulári — ukladajú sa AŽ TERAZ,
      // keď je vehicleId isté a vozidlo aj dokument sú už bezpečne uložené.
      // Upsert na (vehicle_id, country_code) — pri obnove existujúcej
      // krajiny sa iba aktualizuje valid_until, presne rovnaký model ako
      // pri ručnom pridávaní/úprave známky v detaile vozidla (žiadny
      // paralelný dátový model). AI tento údaj neextrahuje —
      // registrationVignettes obsahuje výhradne ručne zadané riadky.
      // Neúplné riadky boli odmietnuté vyššie ešte pred uploadom; úplne
      // prázdny zoznam flow jednoducho nijako neovplyvní (voliteľné pole).
      const vignetteRowsToSave = registrationVignettes.filter(
        (row) => row.country_code && row.valid_until
      );

      let vignetteSaveFailed = false;

      if (vignetteRowsToSave.length > 0) {
        const { error: vignetteError } = await supabase
          .from("vehicle_vignettes")
          .upsert(
            vignetteRowsToSave.map((row) => ({
              vehicle_id: vehicleId,
              country_code: row.country_code,
              valid_until: row.valid_until,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: "vehicle_id,country_code" }
          );

        if (vignetteError) {
          vignetteSaveFailed = true;
          console.error(
            "Diaľničné známky sa nepodarilo uložiť k vozidlu:",
            vignetteError
          );
        }
      }

      const wasUpdate = Boolean(registrationDuplicateVehicle);

      clearRegistrationImages();
      setShowRegistrationFlow(false);
      await Promise.all([loadVehicles(), refreshPlanUsage()]);

      const successMessage = wasUpdate
        ? t("inbox.errors.vehicleUpdatedWithRegistration")
        : t("inbox.errors.vehicleCreatedWithRegistration");

      alert(
        vignetteSaveFailed
          ? `${successMessage} ${t("inbox.errors.vignetteSaveFailedAfterVehicle")}`
          : successMessage
      );
    } catch (saveError: unknown) {
      if (uploadedFrontPath && !documentInserted) {
        const pathsToRemove = uploadedBackPath
          ? [uploadedFrontPath, uploadedBackPath]
          : [uploadedFrontPath];

        const { error: cleanupError } = await supabase.storage
          .from("ai-inbox-documents")
          .remove(pathsToRemove);

        if (cleanupError) {
          console.error(
            "Uloženie zlyhalo a osirotené fotografie sa nepodarilo odstrániť:",
            cleanupError
          );
        }
      }

      const message =
        saveError instanceof Error ? saveError.message : t("inbox.errors.saveFailed");

      if (isPlanLimitReachedError(saveError, "vehicles")) {
        setRegistrationError(t("common.planLimitMessage"));
        await refreshPlanUsage();
      } else if (vehicleWritten && !documentInserted) {
        // Vozidlo sa už uložilo, ale fotografie technického preukazu sa
        // nepodarilo priradiť — nehlásiť tichý úspech, jasne to označiť a
        // nechať používateľa dokument nahrať znova (vozidlo v module
        // Vozidlá pritom zostáva bezpečne použiteľné).
        setRegistrationError(
          t("inbox.errors.vehicleSavedButPhotosFailed", { message })
        );
        await Promise.all([loadVehicles(), refreshPlanUsage()]);
      } else {
        setRegistrationError(message);
      }
    } finally {
      saveRegistrationInProgressRef.current = false;
      setIsSavingRegistration(false);
    }
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

      {role !== "employee" && !showRegistrationFlow && !vehicle && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-subtle bg-surface-1 p-6 shadow-lg backdrop-blur-xl">
          <div>
            <h2 className="text-xl font-bold">{t("vehicles.list.addVehicleTitle")}</h2>
            <p className="mt-1 text-sm text-secondary">
              {t("vehicles.list.addVehicleDescription")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowRegistrationFlow(true)}
              disabled={isNewVehicleBlocked}
              className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {t("vehicles.list.scanRegistrationCta")}
            </button>
            <button
              type="button"
              onClick={() => setVehicle({})}
              disabled={isNewVehicleBlocked}
              className="rounded-xl border border-subtle bg-surface-2 px-5 py-3 font-medium text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("vehicles.list.addManuallyCta")}
            </button>
          </div>
        </div>
      )}

      {/* Technický preukaz (TP) — skenovanie AI, presunuté z Inbox (bod 2
          zadania). Zdieľa presne rovnaké handlery/stav/uloženie ako predtým
          v Inbox, iba UI vstupný bod je teraz tu na hlavnej obrazovke
          Vozidlá namiesto samostatnej sekcie v Inboxe. */}
      {role !== "employee" && showRegistrationFlow && (
        <div className="mt-8 rounded-3xl border border-subtle bg-surface-1 p-6 shadow-lg backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-primary">
                {t("inbox.registration.sectionTitle")}
              </h2>
              <p className="mt-2 text-sm text-secondary">
                {t("inbox.registration.sectionDescription")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowRegistrationFlow(false);
                clearRegistrationImages();
              }}
              className="shrink-0 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-secondary hover:bg-surface-hover"
            >
              {t("common.buttons.cancel")}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-surface-2 p-5 shadow-sm">
              <h3 className="text-lg font-bold">{t("inbox.registration.frontTitle")}</h3>
              <p className="mt-1 text-sm text-secondary">
                {t("inbox.registration.frontRequired")}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
                  {isPreparingRegFront ? t("inbox.registration.preparing") : t("inbox.registration.takePhoto")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={
                      isProcessingRegistration ||
                      isPreparingRegFront ||
                      legalHold
                    }
                    onChange={(event) =>
                      handleRegistrationFileChange("front", event)
                    }
                  />
                </label>

                <label className="cursor-pointer rounded-xl border border-subtle bg-surface-1 px-4 py-3 font-medium text-secondary hover:bg-surface-2">
                  {t("inbox.registration.chooseFromGallery")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={
                      isProcessingRegistration ||
                      isPreparingRegFront ||
                      legalHold
                    }
                    onChange={(event) =>
                      handleRegistrationFileChange("front", event)
                    }
                  />
                </label>
              </div>

              {regFrontPreview ? (
                <div className="mt-4">
                  <img
                    src={regFrontPreview}
                    alt={t("inbox.registration.frontAlt")}
                    className="h-64 w-full rounded-xl border border-subtle bg-surface-1 object-contain"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-esblu">
                      {t("inbox.registration.replaceHint")}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeRegistrationImage("front")}
                      disabled={isProcessingRegistration}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:bg-gray-400"
                    >
                      {t("inbox.registration.remove")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-subtle p-8 text-center text-sm text-muted-esblu">
                  {t("inbox.registration.frontNotSelected")}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-surface-2 p-5 shadow-sm">
              <h3 className="text-lg font-bold">{t("inbox.registration.backTitle")}</h3>
              <p className="mt-1 text-sm text-secondary">
                {t("inbox.registration.backOptional")}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
                  {isPreparingRegBack ? t("inbox.registration.preparing") : t("inbox.registration.takePhoto")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={
                      isProcessingRegistration ||
                      isPreparingRegBack ||
                      legalHold
                    }
                    onChange={(event) =>
                      handleRegistrationFileChange("back", event)
                    }
                  />
                </label>

                <label className="cursor-pointer rounded-xl border border-subtle bg-surface-1 px-4 py-3 font-medium text-secondary hover:bg-surface-2">
                  {t("inbox.registration.chooseFromGallery")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={
                      isProcessingRegistration ||
                      isPreparingRegBack ||
                      legalHold
                    }
                    onChange={(event) =>
                      handleRegistrationFileChange("back", event)
                    }
                  />
                </label>
              </div>

              {regBackPreview ? (
                <div className="mt-4">
                  <img
                    src={regBackPreview}
                    alt={t("inbox.registration.backAlt")}
                    className="h-64 w-full rounded-xl border border-subtle bg-surface-1 object-contain"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-esblu">
                      {t("inbox.registration.replaceHint")}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeRegistrationImage("back")}
                      disabled={isProcessingRegistration}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:bg-gray-400"
                    >
                      {t("inbox.registration.remove")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-subtle p-8 text-center text-sm text-muted-esblu">
                  {t("inbox.registration.backNotSelected")}
                </div>
              )}
            </section>
          </div>

          <button
            type="button"
            onClick={handleProcessRegistration}
            disabled={
              !regFrontFile ||
              isProcessingRegistration ||
              isPreparingRegFront ||
              isPreparingRegBack ||
              legalHold
            }
            className="mt-6 rounded-xl bg-green-600 px-6 py-3 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isProcessingRegistration
              ? t("inbox.registration.loadingData")
              : t("inbox.registration.loadDataWithAi")}
          </button>

          {registrationError && (
            <p className="mt-4 rounded-xl bg-danger-soft p-4 text-sm font-medium text-red-700">
              {registrationError}
            </p>
          )}

          {registrationFields && (
            <div className="mt-6 space-y-4 rounded-2xl border border-subtle bg-surface-2 p-5">
              {registrationDuplicateVehicle ? (
                <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-bold text-amber-400">
                  {t("inbox.registration.duplicateFoundPrefix")}
                  {registrationDuplicateVehicle.spz || t("inbox.noPlate")}
                  {t("inbox.registration.duplicateFoundSuffix")}
                </p>
              ) : (
                <p className="badge-success rounded-xl p-3 text-sm font-medium">
                  {t("inbox.registration.noDuplicateFound")}
                </p>
              )}

              <h3 className="text-lg font-bold text-primary">
                {t("inbox.registration.reviewTitle")}
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  ["spz", t("inbox.fields.spz")],
                  ["vin", t("inbox.fields.vin")],
                  ["znacka", t("inbox.fields.znacka")],
                  ["model", t("inbox.fields.model")],
                  ["rokVyroby", t("inbox.fields.rokVyroby")],
                  ["datumPrvejEvidencie", t("inbox.fields.datumPrvejEvidencie")],
                  ["palivo", t("inbox.fields.palivo")],
                  ["objemMotora", t("inbox.fields.objemMotora")],
                  ["vykon", t("inbox.fields.vykon")],
                  ["farba", t("inbox.fields.farba")],
                  ["prevadzkovaHmotnost", t("inbox.fields.prevadzkovaHmotnost")],
                  ["pocetMiest", t("inbox.fields.pocetMiest")],
                  ["kategoriaVozidla", t("inbox.fields.kategoriaVozidla")],
                  ["druhVozidla", t("inbox.fields.druhVozidla")],
                  [
                    "najvacsiaPripustnaCelkovaHmotnost",
                    t("inbox.fields.najvacsiaPripustnaCelkovaHmotnost"),
                  ],
                  ["cisloTechnickehoPreukazu", t("inbox.fields.cisloTechnickehoPreukazu")],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-sm font-medium text-secondary">
                      {label}
                    </span>
                    <input
                      className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 p-3 outline-none"
                      value={registrationFields[key] ?? ""}
                      onChange={(e) =>
                        updateRegistrationField(key, e.target.value)
                      }
                    />
                  </label>
                ))}
              </div>

              {/* Diaľničné známky — ručné, voliteľné, predvolene prázdne
                  (AI ich z technického preukazu neextrahuje, štandardne ho
                  ani neobsahuje). Podporuje viac riadkov naraz (jeden na
                  krajinu) — presne rovnaký country/valid_until model ako
                  sekcia "Diaľničné známky" v detaile vozidla, uložený AŽ pri
                  potvrdení vytvorenia/aktualizácie vozidla nižšie. */}
              <div className="mt-2 rounded-2xl border border-subtle bg-surface-1 p-5">
                <h4 className="text-sm font-bold text-primary">
                  {t("inbox.registration.vignettesSectionTitle")}
                </h4>
                <p className="mt-1 text-xs text-muted-esblu">
                  {t("inbox.registration.vignettesSectionDescription")}
                </p>

                {registrationVignettes.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {registrationVignettes.map((row, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 gap-3 rounded-xl border border-subtle bg-surface-2 p-4 md:grid-cols-[1fr_1fr_auto]"
                      >
                        <label className="block">
                          <span className="text-xs font-medium text-secondary">
                            {t("vehicles.vignettes.country")}
                          </span>
                          <select
                            className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 p-3 outline-none"
                            value={
                              row.countryMode === "custom"
                                ? VIGNETTE_OTHER_COUNTRY_OPTION
                                : row.country_code
                            }
                            onChange={(e) =>
                              handleRegistrationVignetteCountrySelect(
                                index,
                                e.target.value
                              )
                            }
                          >
                            <option value="">
                              {t("vehicles.vignettes.selectCountryPlaceholder")}
                            </option>
                            {VIGNETTE_COUNTRIES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {vignetteCountryLabel(c.code, locale)}
                              </option>
                            ))}
                            <option value={VIGNETTE_OTHER_COUNTRY_OPTION}>
                              {t("vehicles.vignettes.otherCountry")}
                            </option>
                          </select>

                          {row.countryMode === "custom" && (
                            <input
                              className="mt-2 w-full rounded-xl border border-subtle bg-surface-1 p-3 uppercase outline-none"
                              maxLength={2}
                              placeholder={t(
                                "vehicles.vignettes.otherCountryCodePlaceholder"
                              )}
                              value={row.country_code}
                              onChange={(e) =>
                                handleRegistrationVignetteCustomCountryInput(
                                  index,
                                  e.target.value
                                )
                              }
                            />
                          )}
                        </label>

                        <label className="block">
                          <span className="text-xs font-medium text-secondary">
                            {t("vehicles.vignettes.validUntil")}
                          </span>
                          <input
                            type="date"
                            className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 p-3 outline-none"
                            value={row.valid_until}
                            onChange={(e) =>
                              updateRegistrationVignetteRow(
                                index,
                                "valid_until",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => removeRegistrationVignetteRow(index)}
                          className="self-end rounded-xl bg-surface-1 px-4 py-3 text-xs font-bold text-secondary hover:bg-surface-hover md:self-center"
                        >
                          {t("vehicles.vignettes.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addRegistrationVignetteRow}
                  className="mt-4 rounded-xl border border-subtle bg-surface-2 px-4 py-2 text-sm font-semibold text-secondary hover:bg-surface-hover"
                >
                  {t("vehicles.vignettes.addAnother")}
                </button>
              </div>

              <button
                type="button"
                onClick={saveRegistrationDocument}
                disabled={
                  isSavingRegistration ||
                  legalHold ||
                  (!registrationDuplicateVehicle &&
                    (planUsageLoading || isPlanLimited))
                }
                className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white disabled:opacity-60"
              >
                {isSavingRegistration
                  ? t("common.buttons.saving")
                  : registrationDuplicateVehicle
                    ? t("inbox.registration.updateVehicle")
                    : t("inbox.registration.createVehicle")}
              </button>

              {!registrationDuplicateVehicle &&
                !planUsageLoading &&
                isPlanLimited && (
                  <p className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-red-700">
                    {t("common.planLimitMessage")}
                  </p>
                )}
            </div>
          )}
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

            {vehicle && (
              <button
                onClick={cancelEdit}
                className="rounded-xl bg-surface-2 px-6 py-3 text-primary hover:bg-surface-hover"
              >
                {editingId ? t("vehicles.forms.cancelEdit") : t("common.buttons.cancel")}
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
