"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import {
  PLAN_LIMIT_MESSAGE,
  isPlanLimitReachedError,
} from "@/lib/plan-limits";
import {
  exportAiEvidenceToExcel,
  type AiEvidenceExcelRecord,
} from "@/lib/export-ai-evidence-excel";
import { normalizeSpz } from "@/lib/normalize-spz";
import { normalizeWeightUnit } from "@/lib/normalize-weight-unit";
import {
  convertWeightToTons,
  getEffectiveNetto,
  normalizeAndValidateWeights,
  parseWeightValue,
} from "@/lib/weight-utils";

const WITHOUT_SPZ_GROUP = "BEZ ŠPZ";

function getSpzGroupKey(value: unknown): string {
  if (value === WITHOUT_SPZ_GROUP) return WITHOUT_SPZ_GROUP;
  return normalizeSpz(value) || WITHOUT_SPZ_GROUP;
}

function formatRecordWeight(
  record: Pick<AiEvidenceExcelRecord, "netto" | "quantity" | "unit">
): string {
  const hasNetto =
    record.netto !== null &&
    record.netto !== undefined &&
    record.netto !== "";
  const value = hasNetto ? record.netto : record.quantity;

  if (value === null || value === undefined || value === "") {
    return "Bez hmotnosti";
  }

  const unit = normalizeWeightUnit(record.unit);
  return unit ? `${value} ${unit}` : `${value} bez jednotky`;
}

type EvidenceSummary = {
  totalImport: number;
  totalExport: number;
  importCount: number;
  exportCount: number;
  importByMaterial: Record<string, number>;
  exportByMaterial: Record<string, number>;
};

function createEmptySummary(): EvidenceSummary {
  return {
    totalImport: 0,
    totalExport: 0,
    importCount: 0,
    exportCount: 0,
    importByMaterial: {},
    exportByMaterial: {},
  };
}

function addRecordToSummary(
  summary: EvidenceSummary,
  record: AiEvidenceExcelRecord
) {
  const movementType = (record.movement_type || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const category =
    record.material_category ||
    record.material_original ||
    record.material ||
    "iné";
  const weightInTons = convertWeightToTons(
    getEffectiveNetto(record),
    record.unit
  );

  if (movementType === "dovoz") {
    summary.importCount += 1;
    if (weightInTons !== null) {
      summary.totalImport += weightInTons;
      summary.importByMaterial[category] =
        (summary.importByMaterial[category] || 0) + weightInTons;
    }
  }

  if (movementType === "vyvoz") {
    summary.exportCount += 1;
    if (weightInTons !== null) {
      summary.totalExport += weightInTons;
      summary.exportByMaterial[category] =
        (summary.exportByMaterial[category] || 0) + weightInTons;
    }
  }
}

function Info({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1 font-bold text-slate-900">{value || "-"}</p>
    </div>
  );
}
type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

function normalizeRotation(value: number): number {
  return ((value % 360) + 360) % 360;
}

async function decodeImageWithOrientation(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Staršie prehliadače môžu createImageBitmap alebo jeho options odmietnuť.
    }
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Obrázok sa nepodarilo načítať."));
      img.src = imageUrl;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(imageUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(imageUrl);
    throw error;
  }
}

async function compressImage(file: File, rotation: number): Promise<File> {
  const decodedImage = await decodeImageWithOrientation(file);

  try {
    const normalizedRotation = normalizeRotation(rotation);
    const swapsDimensions =
      normalizedRotation === 90 || normalizedRotation === 270;
    const rotatedWidth = swapsDimensions
      ? decodedImage.height
      : decodedImage.width;
    const rotatedHeight = swapsDimensions
      ? decodedImage.width
      : decodedImage.height;
    const maxDimension = 1800;
    const scale = Math.min(
      1,
      maxDimension / Math.max(rotatedWidth, rotatedHeight)
    );
    const scaledSourceWidth = Math.max(
      1,
      Math.round(decodedImage.width * scale)
    );
    const scaledSourceHeight = Math.max(
      1,
      Math.round(decodedImage.height * scale)
    );
    const outputWidth = swapsDimensions
      ? scaledSourceHeight
      : scaledSourceWidth;
    const outputHeight = swapsDimensions
      ? scaledSourceWidth
      : scaledSourceHeight;

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Nepodarilo sa pripraviť kompresiu obrázka.");
    }

    if (normalizedRotation === 90) {
      context.translate(outputWidth, 0);
      context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
      context.translate(outputWidth, outputHeight);
      context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
      context.translate(0, outputHeight);
      context.rotate(-Math.PI / 2);
    }

    context.drawImage(
      decodedImage.source,
      0,
      0,
      scaledSourceWidth,
      scaledSourceHeight
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Obrázok sa nepodarilo skomprimovať."));
          }
        },
        "image/webp",
        0.8
      );
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("AI EVIDENCE IMAGE DEBUG", {
        originalWidth: decodedImage.width,
        originalHeight: decodedImage.height,
        outputWidth,
        outputHeight,
        rotation: normalizedRotation,
        outputMimeType: blob.type,
        outputSize: blob.size,
      });
    }

    const originalName =
      file.name.replace(/\.[^/.]+$/, "") || "dokument";

    return new File([blob], `${originalName}.webp`, {
      type: blob.type || "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    decodedImage.release();
  }
}
export default function AiEvidenciaPage() {
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<AiEvidenceExcelRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [documentPhotoUrl, setDocumentPhotoUrl] =
  useState<string | null>(null);
  const [selectedSpz, setSelectedSpz] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const saveInProgressRef = useRef(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const {
    usage: planUsage,
    limit: planLimit,
    isLimited: isPlanLimited,
    loading: planUsageLoading,
    refresh: refreshPlanUsage,
  } = usePlanUsage("ai_evidence");
  const isCreationBlocked = !planUsageLoading && isPlanLimited;

const groupedRecords = records.reduce((groups: any, record: any) => {
  const spz = getSpzGroupKey(record.spz);

  if (!groups[spz]) {
    groups[spz] = [];
  }

  groups[spz].push(record);

  return groups;
}, {});
const visibleDocuments = records.filter((record) => {
  if (!selectedSpz) {
    return true;
  }

  const recordSpz = getSpzGroupKey(record.spz);
  return recordSpz === getSpzGroupKey(selectedSpz);
});
const summary = records.reduce((accumulator, record) => {
  addRecordToSummary(accumulator, record);
  return accumulator;
}, createEmptySummary());
const summaryBySpz = records.reduce<Record<string, EvidenceSummary>>((groups, record) => {
  const spz = getSpzGroupKey(record.spz);

  if (!groups[spz]) {
    groups[spz] = createEmptySummary();
  }

  addRecordToSummary(groups[spz], record);

  return groups;
}, {});

  function revokePreviewObjectUrl() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  }

  function prepareImagePreview(file: File) {
    revokePreviewObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setPendingImageFile(file);
    setRotation(0);
  }

  function clearImagePreview(clearFileName = true) {
    revokePreviewObjectUrl();
    setPreviewUrl(null);
    setPendingImageFile(null);
    setRotation(0);

    if (clearFileName) {
      setFileName("");
    }
  }

  async function handleExportExcel() {
    if (exportLoading) return;

    if (visibleDocuments.length === 0) {
      setExportFeedback({
        type: "error",
        text: "Nie sú dostupné žiadne dokumenty na export.",
      });
      return;
    }

    setExportLoading(true);
    setExportFeedback(null);

    try {
      const { exportedCount, fileName } = await exportAiEvidenceToExcel(
        visibleDocuments
      );

      setExportFeedback({
        type: "success",
        text: `Exportovaných ${exportedCount} záznamov do súboru ${fileName}.`,
      });
    } catch (exportError: unknown) {
      console.error("Chyba pri exporte Excelu:", exportError);
      setExportFeedback({
        type: "error",
        text:
          exportError instanceof Error
            ? exportError.message
            : "Excel sa nepodarilo vygenerovať. Skús to znova.",
      });
    } finally {
      setExportLoading(false);
    }
  }
  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (planUsageLoading || isCreationBlocked) {
      setError(
        planUsageLoading
          ? "Overujem dostupnosť limitu. Skús to znova o chvíľu."
          : PLAN_LIMIT_MESSAGE
      );
      return;
    }

    setFileName(file.name);
    setResult(null);
    setSelectedFile(null);
    setError("");
    prepareImagePreview(file);
  }

  async function processPendingDocument() {
    if (!pendingImageFile || isProcessing) return;

    if (planUsageLoading || isCreationBlocked) {
      setError(
        planUsageLoading
          ? "Overujem dostupnosť limitu. Skús to znova o chvíľu."
          : PLAN_LIMIT_MESSAGE
      );
      return;
    }

    setError("");
    setIsProcessing(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Na AI spracovanie musíš byť prihlásený.");
      }

      const compressedFile = await compressImage(pendingImageFile, rotation);
      const formData = new FormData();
      formData.append("file", compressedFile);

      const response = await fetch("/api/scan-vehicle-doc", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "AI spracovanie zlyhalo.");
      }

      const scannedResult = data.data;
      const resolvedMovementType = resolveMovementType(scannedResult);

      setSelectedFile(compressedFile);
      setResult({
        ...scannedResult,
        spz: normalizeSpz(scannedResult.spz),
        movementType: resolvedMovementType || "",
      });
      clearImagePreview(false);
    } catch (processingError: unknown) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : "Nastala neznáma chyba."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function cancelPendingDocument() {
    if (isProcessing) return;

    clearImagePreview();
    setSelectedFile(null);
    setResult(null);
    setError("");
  }

  function updateResult(field: string, value: string) {
    setResult((prev: any) => ({
      ...prev,
      [field]: value,
    }));
  }

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveMovementType(result: any): string | null {
  const supplier = normalizeText(result.supplier);
  const material = normalizeText(
    result.materialOriginal || result.material
  );
  const rawText = normalizeText(result.rawText);

  const combinedText = `${supplier} ${material} ${rawText}`;

  // BRZ – odvoz stavebného odpadu zo stavby do recyklačného centra
  if (
    combinedText.includes("brz") ||
    combinedText.includes("recycling-zentrum")
  ) {
    if (
      combinedText.includes("bauschutt") ||
      combinedText.includes("boden") ||
      combinedText.includes("abfall") ||
      combinedText.includes("recyclingmaterial")
    ) {
      return "vývoz";
    }
  }

  // STIX – nový asfalt na stavbu
  if (supplier.includes("stix")) {
    if (
      combinedText.includes("ac8") ||
      combinedText.includes("ac 8") ||
      combinedText.includes("ac32") ||
      combinedText.includes("ac 32") ||
      combinedText.includes("asphaltmischgut")
    ) {
      return "dovoz";
    }

    // Starý vybúraný asfalt odvážaný zo stavby
    if (combinedText.includes("asphaltaufbruch")) {
      return "vývoz";
    }
  }

  // Doris Kaffenberger – piesok, štrk a splitt privážaný na stavbu
  if (
    supplier.includes("kaffenberger") &&
    (
      combinedText.includes("sand") ||
      combinedText.includes("kies") ||
      combinedText.includes("splitt")
    )
  ) {
    return "dovoz";
  }

  return result.movementType || null;
}
  async function saveEvidence() {
    if (!result || saveInProgressRef.current) return;

    saveInProgressRef.current = true;
    setIsSaving(true);
    setError("");
    let uploadedPhotoPath: string | null = null;
    let recordInserted = false;

    try {
      const validatedWeights = normalizeAndValidateWeights({
        quantity: result.quantity,
        brutto: result.brutto,
        tara: result.tara,
        netto: result.netto,
        unit: result.unit,
      });

      if (validatedWeights.invalidFields.length > 0) {
        throw new Error(
          `Skontrolujte číselný formát polí: ${validatedWeights.invalidFields.join(
            ", "
          )}. Nejednoznačné alebo neplatné hmotnosti sa nedajú uložiť.`
        );
      }

      const confidenceScore = parseWeightValue(result.confidenceScore);
      if (confidenceScore !== null && confidenceScore > 1) {
        throw new Error("Miera istoty musí byť číslo od 0 do 1.");
      }

      const latestUsage = await refreshPlanUsage();

      if (latestUsage?.isLimited) {
        setError(PLAN_LIMIT_MESSAGE);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Nie si prihlásený.");
      }
      const normalizedResultSpz = normalizeSpz(result.spz);
      let vehicleId = null;
      let canonicalSpz = normalizedResultSpz;

      if (normalizedResultSpz) {
        const { data: vehicles, error: vehiclesError } = await supabase
          .from("vehicles")
          .select("id, spz")
          .eq("user_id", session.user.id);

        if (vehiclesError) {
          console.error("Chyba pri načítaní vozidiel:", vehiclesError);
        }

        const matchedVehicle = vehicles?.find(
          (vehicle) => normalizeSpz(vehicle.spz) === normalizedResultSpz
        );

        vehicleId = matchedVehicle?.id ?? null;
        canonicalSpz =
          normalizeSpz(matchedVehicle?.spz) ?? normalizedResultSpz;
      }

      let photoPath: string | null = null;

if (selectedFile) {
  const storageSpz = canonicalSpz || "BEZSPZ";

  const uniqueName = `${Date.now()}-${crypto.randomUUID()}.webp`;

  photoPath = `${session.user.id}/${storageSpz}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from("ai-evidence-documents")
    .upload(photoPath, selectedFile, {
      contentType: selectedFile.type || "image/webp",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Fotku sa nepodarilo uložiť: ${uploadError.message}`);
  }

  uploadedPhotoPath = photoPath;
}
const resolvedMovementType = resolveMovementType(result);
      const reviewStatus = validatedWeights.needsReview
        ? "needs_review"
        : result.reviewStatus || "pending";
      const { error } = await supabase.from("ai_evidence").insert({
        user_id: session.user.id,
        vehicle_id: vehicleId,
        spz: canonicalSpz,
        document_type: result.documentType || null,
        movement_type: resolvedMovementType,
        supplier: result.supplier || null,
        document_number: result.documentNumber || null,
        material: result.material || null,
        material_original: result.materialOriginal || null,
material_category: result.materialCategory || null,
document_language: result.documentLanguage || null,
confidence_score: confidenceScore,
source_location: result.sourceLocation || null,
destination_location: result.destinationLocation || null,
review_status: reviewStatus,
        quantity: validatedWeights.quantity,
        unit: validatedWeights.unit,
        brutto: validatedWeights.brutto,
        tara: validatedWeights.tara,
        netto: validatedWeights.netto,
        construction_site: result.constructionSite || null,
        customer: result.customer || null,
        document_date: result.documentDate || null,
        document_time: result.documentTime || null,
        photo_url: photoPath,
        raw_text: result.rawText || null,
      });

      if (error) throw error;

      recordInserted = true;
      setResult(null);
      setSelectedFile(null);
      setFileName("");
      await Promise.all([loadRecords(), refreshPlanUsage()]);
      alert("Záznam bol uložený do AI evidencie.");
    } catch (saveError: unknown) {
      if (uploadedPhotoPath && !recordInserted) {
        const { error: cleanupError } = await supabase.storage
          .from("ai-evidence-documents")
          .remove([uploadedPhotoPath]);

        if (cleanupError) {
          console.error(
            "Insert zlyhal a osirotenú fotografiu sa nepodarilo odstrániť:",
            cleanupError
          );
        }
      }

      if (isPlanLimitReachedError(saveError, "ai_evidence")) {
        setError(PLAN_LIMIT_MESSAGE);
        await refreshPlanUsage();
      } else {
        setError(
          saveError instanceof Error ? saveError.message : "Uloženie zlyhalo."
        );
      }
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }
  async function deleteRecord(id: string) {
  if (!confirm("Naozaj chceš vymazať tento záznam?")) return;

  // Najprv zistíme, či má záznam uloženú fotografiu.
  const { data: record, error: recordError } = await supabase
    .from("ai_evidence")
    .select("photo_url")
    .eq("id", id)
    .single();

  if (recordError) {
    console.error("Chyba pri načítaní záznamu:", recordError);
    alert("Záznam sa nepodarilo načítať.");
    return;
  }

  // Vymažeme databázový záznam.
  const { error: deleteError } = await supabase
    .from("ai_evidence")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("Chyba pri mazaní záznamu:", deleteError);
    alert("Vymazanie záznamu zlyhalo.");
    return;
  }

  // Ak existuje fotografia, vymažeme ju aj zo Storage.
  if (record?.photo_url) {
    const { error: photoDeleteError } = await supabase.storage
      .from("ai-evidence-documents")
      .remove([record.photo_url]);

    if (photoDeleteError) {
      console.error(
        "Záznam bol vymazaný, ale fotografia zostala v Storage:",
        photoDeleteError
      );

      alert(
        "Záznam bol vymazaný, ale fotografiu sa nepodarilo odstrániť z úložiska."
      );
    }
  }

  setSelectedRecord(null);
  setDocumentPhotoUrl(null);
  await Promise.all([loadRecords(), refreshPlanUsage()]);
}

  async function loadRecords() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return;

  const { data, error } = await supabase
    .from("ai_evidence")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (!error && data) {
    setRecords(data);
  }
}
useEffect(() => {
  async function loadDocumentPhoto() {
    setDocumentPhotoUrl(null);

    console.log("PHOTO PATH:", selectedRecord?.photo_url);

    if (!selectedRecord?.photo_url) {
      return;
    }

    const { data, error } = await supabase.storage
      .from("ai-evidence-documents")
      .createSignedUrl(selectedRecord.photo_url, 3600);

    console.log("SIGNED URL RESULT:", { data, error });

    if (error) {
      console.error("Chyba pri načítaní fotografie:", error);
      return;
    }

    setDocumentPhotoUrl(data.signedUrl);
  }

  loadDocumentPhoto();
}, [selectedRecord]);

useEffect(() => {
  loadRecords();
}, []);

useEffect(() => {
  return () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  };
}, []);

const currentWeightValidation = result
  ? normalizeAndValidateWeights({
      quantity: result.quantity,
      brutto: result.brutto,
      tara: result.tara,
      netto: result.netto,
      unit: result.unit,
    })
  : null;

  return (
    <main
  className="min-h-screen bg-cover bg-center bg-fixed p-4 sm:p-6 lg:p-10"
  style={{ backgroundImage: "url('/images/background-dark.png')" }}
>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-4">
  <img
    src="/images/ai-evidencia.png"
    alt="AI Evidencia"
    className="h-16 w-16 object-contain"
  />
  <h1 className="text-4xl font-bold text-white drop-shadow-lg">
    AI EVIDENCIA
  </h1>
</div>

        {!planUsageLoading && isPlanLimited && (
          <PlanLimitNotice
            resource="ai_evidence"
            usage={planUsage}
            limit={planLimit}
            className="mt-6"
          />
        )}

        <div className="mt-10 rounded-3xl border-2 border-dashed border-blue-300 bg-blue-50 p-6 text-center">
  <span className="text-5xl">📄</span>

  <h2 className="mt-4 text-2xl font-bold text-slate-900">
    PRIDAŤ DOKUMENT
  </h2>

  <p className="mt-2 text-slate-700">
    Odfotiť dokument alebo vybrať obrázok zo zariadenia
  </p>

  <div className="mt-6 grid grid-cols-2 gap-3">
    <label
      className={`rounded-2xl bg-blue-600 px-4 py-4 font-bold text-white ${
        planUsageLoading || isPlanLimited || isProcessing || isSaving
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer"
      }`}
    >
      📷 Odfotiť
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={planUsageLoading || isPlanLimited || isProcessing || isSaving}
        onChange={handleFile}
      />
    </label>

    <label
      className={`rounded-2xl bg-white px-4 py-4 font-bold text-blue-700 shadow ${
        planUsageLoading || isPlanLimited || isProcessing || isSaving
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer"
      }`}
    >
      🖼️ Galéria
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={planUsageLoading || isPlanLimited || isProcessing || isSaving}
        onChange={handleFile}
      />
    </label>
  </div>
</div>

        {previewUrl && pendingImageFile && (
          <section className="mt-8 rounded-3xl bg-slate-50 p-5 sm:p-6">
            <div className="text-center">
              <h2 className="text-xl font-black text-slate-950">
                Skontrolujte orientáciu dokumentu
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Pred AI spracovaním otočte dokument tak, aby bol text čitateľný.
              </p>
              <p className="mt-2 text-sm font-bold text-blue-700">
                Rotácia: {rotation}°
              </p>
            </div>

            <div className="mx-auto mt-5 flex aspect-square w-full max-w-xl items-center justify-center overflow-hidden rounded-2xl bg-slate-200 p-3">
              <img
                src={previewUrl}
                alt="Náhľad dokumentu pred AI spracovaním"
                className="max-h-full max-w-full object-contain transition-transform duration-200"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setRotation((current) => normalizeRotation(current - 90))
                }
                disabled={isProcessing}
                className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-800 shadow disabled:cursor-not-allowed disabled:opacity-60"
              >
                ↺ Otočiť doľava
              </button>
              <button
                type="button"
                onClick={() =>
                  setRotation((current) => normalizeRotation(current + 90))
                }
                disabled={isProcessing}
                className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-800 shadow disabled:cursor-not-allowed disabled:opacity-60"
              >
                ↻ Otočiť doprava
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={processPendingDocument}
                disabled={
                  isProcessing || planUsageLoading || isCreationBlocked
                }
                className="flex-1 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessing
                  ? "AI spracováva dokument..."
                  : "Spracovať dokument"}
              </button>
              <button
                type="button"
                onClick={cancelPendingDocument}
                disabled={isProcessing}
                className="rounded-2xl bg-slate-200 px-5 py-4 font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-32"
              >
                Zrušiť
              </button>
            </div>
          </section>
        )}

        {fileName && (
          <div className="mt-8 rounded-2xl bg-slate-50 p-5">
            <p className="font-bold text-slate-900">Vybraný dokument:</p>
            <p className="mt-1 text-slate-600">{fileName}</p>

            {isProcessing && (
              <p className="mt-4 font-semibold text-blue-600">
                🤖 AI spracováva dokument...
              </p>
            )}

            {error && (
              <p className="mt-4 font-semibold text-red-600">Chyba: {error}</p>
            )}
          </div>
        )}

        {result && (
          <div className="mt-8 space-y-4 rounded-3xl bg-slate-50 p-6">
            <h2 className="text-2xl font-black text-slate-950">
              Načítané údaje
            </h2>

            {[
              ["documentType", "Typ dokumentu"],
              ["movementType", "Dovoz / vývoz"],
              ["spz", "ŠPZ"],
              ["supplier", "Dodávateľ"],
              ["customer", "Zákazník"],
              ["constructionSite", "Stavba / Herkunft"],
              ["documentNumber", "Číslo dokladu"],
              ["material", "Materiál"],
              ["quantity", "Množstvo"],
              ["unit", "Jednotka"],
              ["brutto", "Brutto"],
              ["tara", "Tara"],
              ["netto", "Netto"],
              ["documentDate", "Dátum"],
              ["documentTime", "Čas"],
            ].map(([field, label]) => (
              <div key={field}>
                <label className="text-sm font-bold text-slate-600">
                  {label}
                </label>
                <input
                  value={result[field] ?? ""}
                  onChange={(e) => updateResult(field, e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none"
                />
              </div>
            ))}

            {currentWeightValidation?.invalidFields.length ? (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Skontrolujte číselný formát polí: {" "}
                {currentWeightValidation.invalidFields.join(", ")}.
              </p>
            ) : currentWeightValidation?.hasMathMismatch ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Brutto, tara a netto si matematicky nezodpovedajú. Hodnoty sa
                automaticky neopravili a záznam bude označený na kontrolu.
              </p>
            ) : currentWeightValidation?.isUnitMissing ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Pri hmotnosti chýba rozpoznaná jednotka. Záznam bude označený
                na kontrolu.
              </p>
            ) : null}

            <button
              onClick={saveEvidence}
              disabled={
                isSaving ||
                planUsageLoading ||
                isPlanLimited ||
                Boolean(currentWeightValidation?.invalidFields.length)
              }
              className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white disabled:opacity-60"
            >
              {isSaving ? "Ukladám..." : "💾 Uložiť do evidencie"}
            </button>
          </div>
          )}
         {records.length > 0 && (
  <div className="mt-10">
    <h2 className="mb-4 text-2xl font-bold text-white drop-shadow-lg">
      Prehľad materiálu
    </h2>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-3xl border border-green-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-green-700">
          Dovoz
        </p>

        <p className="mt-2 text-4xl font-black text-slate-950">
          {summary.totalImport.toFixed(2)} t
        </p>

        <p className="mt-1 text-sm text-slate-600">
          {summary.importCount} dokladov
        </p>

        <div className="mt-5 space-y-2">
          {Object.entries(summary.importByMaterial).map(
            ([material, weight]: any) => (
              <div
                key={material}
                className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3"
              >
                <span className="font-semibold text-slate-800">
                  {material}
                </span>

                <span className="font-black text-green-700">
                  {Number(weight).toFixed(2)} t
                </span>
              </div>
            )
          )}

          {Object.keys(summary.importByMaterial).length === 0 && (
            <p className="text-sm text-slate-500">
              Zatiaľ nie je evidovaný žiadny dovoz.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-orange-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-orange-700">
          Vývoz
        </p>

        <p className="mt-2 text-4xl font-black text-slate-950">
          {summary.totalExport.toFixed(2)} t
        </p>

        <p className="mt-1 text-sm text-slate-600">
          {summary.exportCount} dokladov
        </p>

        <div className="mt-5 space-y-2">
          {Object.entries(summary.exportByMaterial).map(
            ([material, weight]: any) => (
              <div
                key={material}
                className="flex items-center justify-between rounded-xl bg-orange-50 px-4 py-3"
              >
                <span className="font-semibold text-slate-800">
                  {material}
                </span>

                <span className="font-black text-orange-700">
                  {Number(weight).toFixed(2)} t
                </span>
              </div>
            )
          )}

          {Object.keys(summary.exportByMaterial).length === 0 && (
            <p className="text-sm text-slate-500">
              Zatiaľ nie je evidovaný žiadny vývoz.
            </p>
          )}
        </div>
      </div>
    </div>
  </div>
  )}
  {records.length > 0 && (
  <div className="mt-10">
    <h2 className="mb-4 text-2xl font-bold text-white drop-shadow-lg">
      Prehľad podľa ŠPZ
    </h2>

    <div className="space-y-5">
      {Object.entries(summaryBySpz).map(
        ([spz, vehicleSummary]: any) => (
          <div
            key={spz}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                  Vozidlo
                </p>

                <h3 className="text-2xl font-black text-slate-950">
                  {spz}
                </h3>
              </div>

              <p className="text-sm text-slate-500">
                {vehicleSummary.importCount +
                  vehicleSummary.exportCount}{" "}
                dokladov
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-green-50 p-5">
                <p className="text-sm font-bold uppercase text-green-700">
                  Dovoz
                </p>

                <p className="mt-2 text-3xl font-black text-slate-950">
                  {vehicleSummary.totalImport.toFixed(2)} t
                </p>

                <div className="mt-4 space-y-2">
                  {Object.entries(
                    vehicleSummary.importByMaterial
                  ).map(([material, weight]: any) => (
                    <div
                      key={material}
                      className="flex justify-between rounded-xl bg-white px-3 py-2"
                    >
                      <span className="font-semibold text-slate-700">
                        {material}
                      </span>

                      <span className="font-black text-green-700">
                        {Number(weight).toFixed(2)} t
                      </span>
                    </div>
                  ))}

                  {Object.keys(
                    vehicleSummary.importByMaterial
                  ).length === 0 && (
                    <p className="text-sm text-slate-500">
                      Žiadny dovoz.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-orange-50 p-5">
                <p className="text-sm font-bold uppercase text-orange-700">
                  Vývoz
                </p>

                <p className="mt-2 text-3xl font-black text-slate-950">
                  {vehicleSummary.totalExport.toFixed(2)} t
                </p>

                <div className="mt-4 space-y-2">
                  {Object.entries(
                    vehicleSummary.exportByMaterial
                  ).map(([material, weight]: any) => (
                    <div
                      key={material}
                      className="flex justify-between rounded-xl bg-white px-3 py-2"
                    >
                      <span className="font-semibold text-slate-700">
                        {material}
                      </span>

                      <span className="font-black text-orange-700">
                        {Number(weight).toFixed(2)} t
                      </span>
                    </div>
                  ))}

                  {Object.keys(
                    vehicleSummary.exportByMaterial
                  ).length === 0 && (
                    <p className="text-sm text-slate-500">
                      Žiadny vývoz.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  </div>
)}
    {records.length > 0 && (
      <div className="mt-10">
    <h2 className="mb-4 text-2xl font-bold text-white drop-shadow-lg">
      Uložené doklady
    </h2>

    <div className="mt-5 space-y-3">
      {!selectedSpz &&
  Object.entries(groupedRecords).map(([spz, items]: any) => (
    <div
      key={spz}
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-600">
            🚛 Vozidlo
          </p>

          <h3 className="mt-2 text-2xl font-black text-slate-950">
            {spz}
          </h3>

          <p className="mt-1 text-sm text-slate-600">
            {items.length} {items.length === 1 ? "doklad" : "dokladov"}
          </p>
        </div>

        <button
          onClick={() => setSelectedSpz(spz)}
          className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white"
        >
          Otvoriť
        </button>
      </div>
    </div>
  ))}

{selectedSpz && (
  <>
    <button
      onClick={() => setSelectedSpz(null)}
      className="mb-4 rounded-2xl bg-slate-200 px-4 py-3 font-bold text-slate-700"
    >
      ← Späť na všetky ŠPZ
    </button>

    <h3 className="mb-4 text-2xl font-bold text-white drop-shadow-lg">
      🚛 {selectedSpz}
    </h3>

    <div className="space-y-3">
      {groupedRecords[selectedSpz]?.map((record: any) => (
        <div
          key={record.id}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-600">
                📄 {record.document_type || "Doklad"}
              </p>

              <h3 className="mt-2 text-xl font-black text-slate-950">
                {record.spz || "Bez ŠPZ"}
              </h3>
            </div>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              {record.movement_type || "nezaradené"}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>🏗️ {record.construction_site || "Bez stavby"}</p>
            <p>🏢 {record.supplier || "Bez dodávateľa"}</p>
            <p>👤 {record.customer || "Bez zákazníka"}</p>
            <p>📦 {record.material || "Bez materiálu"}</p>
            <p>
              ⚖️{" "}
              {formatRecordWeight(record)}
            </p>
            <p>
              📅 {record.document_date || "Bez dátumu"}{" "}
              {record.document_time || ""}
            </p>
          </div>

          <button
            onClick={() => setSelectedRecord(record)}
            className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
          >
            📄 Otvoriť detail
          </button>
        </div>
      ))}
    </div>
  </>
)}
    </div>
  </div>
)}
    <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-950">
            Export dokumentov
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Exportuje všetky načítané dokumenty rozdelené podľa ŠPZ.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportExcel}
          disabled={exportLoading || visibleDocuments.length === 0}
          aria-busy={exportLoading}
          className="rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportLoading ? "Generujem Excel..." : "Exportovať dokumenty"}
        </button>
      </div>

      {visibleDocuments.length === 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Nie sú dostupné žiadne dokumenty na export.
        </p>
      )}

      {exportFeedback && (
        <p
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            exportFeedback.type === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {exportFeedback.text}
        </p>
      )}
    </div>
{selectedRecord && (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8">

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black">
          📄 Detail dokumentu
        </h2>

        <button
          onClick={() => setSelectedRecord(null)}
          className="rounded-xl bg-slate-100 px-4 py-2"
        >
          ✕
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">

        <Info title="Typ" value={selectedRecord.document_type} />
        <Info title="Pohyb" value={selectedRecord.movement_type} />
        <Info title="SPZ" value={selectedRecord.spz} />
        <Info title="Dodávateľ" value={selectedRecord.supplier} />
        <Info title="Zákazník" value={selectedRecord.customer} />
        <Info title="Stavba" value={selectedRecord.construction_site} />
        <Info title="Materiál" value={selectedRecord.material} />
        <Info title="Množstvo" value={selectedRecord.quantity} />
        <Info title="Brutto" value={selectedRecord.brutto} />
        <Info title="Tara" value={selectedRecord.tara} />
        <Info title="Netto" value={selectedRecord.netto} />
        <Info
          title="Jednotka"
          value={normalizeWeightUnit(selectedRecord.unit) || "bez jednotky"}
        />
        <Info title="Dátum" value={selectedRecord.document_date} />
        <Info title="Čas" value={selectedRecord.document_time} />

      </div>
      {selectedRecord.photo_url && (
  <div className="mt-5">
    <p className="mb-2 text-sm font-bold text-slate-700">
      Originálny dokument
    </p>

    {documentPhotoUrl ? (
      <a
        href={documentPhotoUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src={documentPhotoUrl}
          alt="Originálny dokument"
          className="max-h-[500px] w-full rounded-2xl border border-slate-200 object-contain"
        />
      </a>
    ) : (
      <p className="text-sm text-slate-500">
        Načítavam fotografiu...
      </p>
    )}
  </div>
)}
      <button
        onClick={() => setSelectedRecord(null)}
        className="mt-8 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white"
      > 
        Zavrieť
      </button>
<button
  onClick={() => deleteRecord(selectedRecord.id)}
  className="mt-3 w-full rounded-2xl bg-red-600 py-4 font-bold text-white"
>
  🗑 Vymazať záznam
</button>
    </div>
  </div>
)}
      </div>
    </main>
  );
}
