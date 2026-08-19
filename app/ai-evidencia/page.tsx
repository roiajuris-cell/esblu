"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PlanLimitNotice from "@/app/components/PlanLimitNotice";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import {
  PLAN_LIMIT_MESSAGE,
  isPlanLimitReachedError,
} from "@/lib/plan-limits";
import BackLink from "@/app/components/BackLink";
import {
  exportAiEvidenceToExcel,
  type AiEvidenceExcelRecord,
} from "@/lib/export-ai-evidence-excel";
import {
  exportAiInboxFolderToExcel,
  type AiInboxFolderKind,
} from "@/lib/export-ai-inbox-documents-excel";
import { normalizeSpz } from "@/lib/normalize-spz";
import {
  getMyActiveMembership,
  isOwnerOrAdmin,
  type CompanyMemberRole,
} from "@/lib/company";
import { useCompanyDpaLegalHold } from "@/app/components/CompanyDpaGate";
import { LEGAL_HOLD_MESSAGE } from "@/lib/company-dpa";
import { normalizeWeightUnit } from "@/lib/normalize-weight-unit";
import {
  convertWeightToTons,
  getEffectiveNetto,
  normalizeAndValidateWeights,
  parseWeightValue,
} from "@/lib/weight-utils";

type ScanDocumentType =
  | "weigh_ticket"
  | "delivery_note"
  | "invoice"
  | "receipt"
  | "insurance"
  | "service_document"
  | "vehicle_registration"
  | "other";

const DOCUMENT_TYPE_LABELS: Record<ScanDocumentType, string> = {
  weigh_ticket: "vážny lístok",
  delivery_note: "dodací list",
  invoice: "faktúra",
  receipt: "bloček",
  insurance: "PZP / poistná zmluva",
  service_document: "servisný doklad",
  vehicle_registration: "technický preukaz vozidla",
  other: "dokument na kontrolu",
};

// Typy dokumentov, ktoré sa ukladajú cez documents/document_links (druhý,
// všeobecný AI Inbox model — pozri saveOtherDocument nižšie), s ručným
// priradením k vozidlu/stroju. Vážny lístok a dodací list majú vlastný,
// nezávislý flow (ai_evidence, automatické priradenie podľa ŠPZ).
type OtherDocumentType = Exclude<
  ScanDocumentType,
  "weigh_ticket" | "delivery_note"
>;

// Riadok public.documents (s embedovaným public.document_links) tak, ako ho
// vracia .select("*, document_links(*)") — pozri loadOtherDocuments nižšie.
type OtherDocumentRow = {
  id: string;
  document_type: string | null;
  status: string | null;
  created_at: string | null;
  extracted_fields: Record<string, unknown> | null;
  storage_bucket: string | null;
  storage_path: string | null;
  original_filename: string | null;
  note: string | null;
  document_links?: { vehicle_id: string | null; machine_id: string | null }[];
};

// Riadok public.document_attachments — jednoduché prílohy k dokumentu
// (dnes iba PZP/insurance detail, pozri sekciu "Prílohy" nižšie).
type AttachmentRow = {
  id: string;
  document_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  attachment_type: string;
  created_at: string | null;
};

const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
  white_card: "Biela karta",
  green_card: "Zelená karta / potvrdenie o poistení",
  insurance_event: "Záznam o poistnej udalosti",
  other: "Iný súvisiaci dokument",
};

// Dokumenty typu receipt/invoice bez priradenia k vozidlu/stroju sa v zozname
// zobrazujú zoskupené do zložiek "Bločky"/"Faktúry" (pozri bod 4 zadania),
// nie samostatne v plochom zozname "Ostatné dokumenty" — aby sa rovnaký
// dokument nikdy nezobrazil na dvoch miestach naraz.
function isDocumentAssigned(doc: OtherDocumentRow): boolean {
  const link = Array.isArray(doc?.document_links) ? doc.document_links[0] : null;
  return Boolean(link && (link.vehicle_id || link.machine_id));
}

// SK popisky polí pre zobrazenie/editáciu v UI aj pre detail uloženého
// dokumentu (documents.extracted_fields má rovnaký tvar ako tieto fields
// objekty z /api/scan-document, takže rovnaká mapa funguje pre obe miesta).
const REVIEW_ONLY_FIELD_LABELS: Record<OtherDocumentType, [string, string][]> = {
  invoice: [
    ["supplier", "Dodávateľ"],
    ["customer", "Zákazník"],
    ["invoiceNumber", "Číslo faktúry"],
    ["issueDate", "Dátum vystavenia"],
    ["dueDate", "Dátum splatnosti"],
    ["totalAmount", "Suma"],
    ["vatAmount", "DPH"],
    ["currency", "Mena"],
    ["variableSymbol", "Variabilný symbol"],
    ["description", "Popis"],
  ],
  receipt: [
    ["merchant", "Obchodník"],
    ["purchaseDate", "Dátum"],
    ["totalAmount", "Suma"],
    ["currency", "Mena"],
    ["paymentMethod", "Spôsob platby"],
    ["category", "Kategória"],
  ],
  insurance: [
    ["provider", "Poisťovňa"],
    ["policyNumber", "Číslo zmluvy"],
    ["insuranceType", "Druh poistenia"],
    ["vehicleIdentifier", "Vozidlo / stroj (ŠPZ)"],
    ["vin", "VIN"],
    ["validFrom", "Platnosť od"],
    ["validTo", "Platnosť do"],
    ["premiumAmount", "Poistné"],
    ["currency", "Mena"],
  ],
  service_document: [
    ["provider", "Poskytovateľ servisu"],
    ["serviceDate", "Dátum servisu"],
    ["vehicleOrMachineIdentifier", "Vozidlo / stroj"],
    ["description", "Popis"],
    ["cost", "Cena"],
    ["currency", "Mena"],
    ["nextServiceDate", "Ďalší servis"],
  ],
  vehicle_registration: [
    ["spz", "ŠPZ"],
    ["vin", "VIN"],
    ["znacka", "Značka"],
    ["model", "Model"],
    ["rokVyroby", "Rok výroby"],
    ["farba", "Farba"],
    ["cisloTechnickehoPreukazu", "Číslo technického preukazu"],
  ],
  other: [["summary", "Zhrnutie"]],
};

function describeScanError(status: number, data: any): string {
  const serverMessage =
    (data && typeof data.message === "string" && data.message) ||
    (data &&
      typeof data.error === "string" &&
      data.error !== "AI_INCONSISTENT_OUTPUT" &&
      data.error) ||
    null;

  if (serverMessage) return serverMessage;

  switch (status) {
    case 401:
      return "Prihlásenie vypršalo. Prihlás sa znova.";
    case 400:
    case 415:
      return "Nepodporovaný alebo neplatný súbor. Skús JPEG, PNG alebo WebP obrázok.";
    case 413:
      return "Obrázok je príliš veľký (max. 10 MB).";
    case 422:
      return "AI nevrátila jednoznačný výsledok. Skús sken dokumentu zopakovať.";
    case 500:
      return "AI spracovanie dokumentu zlyhalo. Skús to znova o chvíľu.";
    default:
      return "Nastala neznáma chyba pri spracovaní dokumentu.";
  }
}

// Sploští weighTicketFields/deliveryNoteFields z nového /api/scan-document
// do rovnakého plochého tvaru, aký doteraz vracal /api/scan-vehicle-doc.
// Vďaka tomu saveEvidence() nižšie zostáva úplne nezmenená a naďalej
// zapisuje do ai_evidence presne tak, ako predtým.
function buildFlatWeighTicketResult(
  documentType: "weigh_ticket" | "delivery_note",
  fields: Record<string, any>,
  common: {
    rawText: string | null;
    confidenceScore: number | null;
    reviewStatus: string | null;
    documentLanguage: string | null;
  }
) {
  return {
    documentType: DOCUMENT_TYPE_LABELS[documentType],
    movementType: fields.movementType ?? null,
    spz: fields.spz ?? null,
    supplier: fields.supplier ?? null,
    customer: fields.customer ?? null,
    constructionSite: fields.constructionSite ?? null,
    documentNumber: fields.documentNumber ?? null,
    material: fields.material ?? null,
    materialOriginal: fields.materialOriginal ?? null,
    materialCategory: fields.materialCategory ?? null,
    documentLanguage: common.documentLanguage,
    confidenceScore: common.confidenceScore,
    sourceLocation: fields.sourceLocation ?? null,
    destinationLocation: fields.destinationLocation ?? null,
    reviewStatus: common.reviewStatus === "needs_review" ? "needs_review" : "confirmed",
    quantity: fields.quantity ?? null,
    unit: fields.unit ?? null,
    brutto: fields.brutto ?? null,
    tara: fields.tara ?? null,
    netto: fields.netto ?? null,
    documentDate: fields.documentDate ?? null,
    documentTime: fields.documentTime ?? null,
    rawText: common.rawText,
  };
}

// -----------------------------------------------------------------------------
// Priraďovanie k vozidlu/stroju — zdieľané dopyty nad vlastnými záznamami
// prihláseného používateľa (user_id filter drží RLS izoláciu).
//
// resolveVehicleIdBySpz sa používa pre vážny lístok/dodací list: priradenie
// je čisto automatické podľa ŠPZ rozpoznanej AI, nikdy nezlyhá a nikdy
// neblokuje uloženie dokumentu — ak vozidlo s danou ŠPZ v module Vozidlá
// neexistuje (alebo dopyt zlyhá), vráti vehicleId: null a dokument sa aj tak
// uloží, iba bez väzby na konkrétne vozidlo.
//
// resolveMachineIdByLabel je pripravená pre budúce doplnenie ukladania
// ostatných typov dokumentov (faktúra, bloček, servisný doklad, PZP a
// pod.) s ručným priradením k vozidlu/stroju — dnes ju nikde nevoláme,
// keďže ukladanie týchto typov ešte nie je implementované.
// -----------------------------------------------------------------------------

async function resolveVehicleIdBySpz(
  companyId: string,
  spz: unknown
): Promise<{ vehicleId: string | null; canonicalSpz: string | null }> {
  const normalizedSpz = normalizeSpz(spz);

  if (!normalizedSpz) {
    return { vehicleId: null, canonicalSpz: null };
  }

  const { data: vehicles, error: vehiclesError } = await supabase
    .from("vehicles")
    .select("id, spz")
    .eq("company_id", companyId);

  if (vehiclesError) {
    console.error("Chyba pri načítaní vozidiel:", vehiclesError);
    return { vehicleId: null, canonicalSpz: normalizedSpz };
  }

  const matchedVehicle = vehicles?.find(
    (vehicle) => normalizeSpz(vehicle.spz) === normalizedSpz
  );

  return {
    vehicleId: matchedVehicle?.id ?? null,
    canonicalSpz: normalizeSpz(matchedVehicle?.spz) ?? normalizedSpz,
  };
}

// Duplicitná kontrola pre technický preukaz vozidla (bod 2 zadania) — hľadá
// existujúce vozidlo firmy podľa VIN (spoľahlivejší, prakticky unikátny
// identifikátor) a až potom podľa ŠPZ. Nikdy nezlyhá s chybou — pri
// zlyhaní dopytu vráti null, aby AI-preview flow vždy ponúklo aspoň
// vytvorenie nového vozidla namiesto tvrdého zlyhania.
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

// Deterministické párovanie PZP → existujúce vozidlo firmy (bod 2 zadania).
// Poradie: 1) VIN (spoľahlivejší, prakticky unikátny identifikátor), 2) ŠPZ.
// Pracuje nad už načítaným vehicleOptions (žiadny ďalší DB dotaz) —
// vehicleOptions je vždy filtrovaný na aktívnu firmu volajúceho (RLS +
// company_id filter v loadVehicleAndMachineOptions), takže párovanie nikdy
// neopustí hranicu firmy.
//
// NIKDY nehádaj potichu: ak identifikátor zodpovedá VIACERÝM vozidlám naraz
// (ambiguous), nevracia sa žiadne vozidlo — iba príznak, že treba ručný
// výber. Ak nezodpovedá žiadnemu, tiež sa nič nepredvyberie (no-match) a
// UI nechá používateľa vybrať vozidlo ručne alebo flow zastaví.
function matchInsuranceVehicle(
  vin: unknown,
  vehicleIdentifier: unknown,
  vehicleOptions: { id: string; spz: string | null; vin: string | null }[]
): {
  vehicleId: string | null;
  ambiguous: boolean;
  matchedBy: "vin" | "spz" | null;
} {
  const trimmedVin =
    typeof vin === "string" && vin.trim().length > 0
      ? vin.trim().toUpperCase()
      : "";

  if (trimmedVin) {
    const vinMatches = vehicleOptions.filter(
      (vehicle) =>
        typeof vehicle.vin === "string" &&
        vehicle.vin.trim().toUpperCase() === trimmedVin
    );

    if (vinMatches.length === 1) {
      return { vehicleId: vinMatches[0].id, ambiguous: false, matchedBy: "vin" };
    }

    if (vinMatches.length > 1) {
      return { vehicleId: null, ambiguous: true, matchedBy: null };
    }

    // 0 zhôd na VIN — pokračuj na ŠPZ, VIN v dokumente mohol byť
    // nesprávne prečítaný alebo vozidlo v evidencii nemá VIN vyplnené.
  }

  const normalizedSpz = normalizeSpz(vehicleIdentifier);

  if (!normalizedSpz) {
    return { vehicleId: null, ambiguous: false, matchedBy: null };
  }

  const spzMatches = vehicleOptions.filter(
    (vehicle) => normalizeSpz(vehicle.spz) === normalizedSpz
  );

  if (spzMatches.length === 1) {
    return { vehicleId: spzMatches[0].id, ambiguous: false, matchedBy: "spz" };
  }

  if (spzMatches.length > 1) {
    return { vehicleId: null, ambiguous: true, matchedBy: null };
  }

  return { vehicleId: null, ambiguous: false, matchedBy: null };
}

function normalizeMachineLabel(value: unknown): string {
  return (typeof value === "string" ? value : "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Zámerne zatiaľ nikde nevolaná — pripravená pre budúce doplnenie ukladania
// ostatných typov dokumentov (pozri komentár vyššie pri
// resolveVehicleIdBySpz). Potlačené lint upozornenie na nepoužitú funkciu,
// kým sa táto funkcia nezapojí do reálneho save flow.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function resolveMachineIdByLabel(
  companyId: string,
  label: string
): Promise<{ machineId: string | null; machineLabel: string | null }> {
  const trimmedLabel = label.trim();

  if (!trimmedLabel) {
    return { machineId: null, machineLabel: null };
  }

  const { data: machines, error: machinesError } = await supabase
    .from("machines")
    .select("id, name")
    .eq("company_id", companyId);

  if (machinesError) {
    console.error("Chyba pri načítaní strojov:", machinesError);
    return { machineId: null, machineLabel: null };
  }

  const normalizedLabel = normalizeMachineLabel(trimmedLabel);
  const matchedMachine = machines?.find(
    (machine) => normalizeMachineLabel(machine.name) === normalizedLabel
  );

  return {
    machineId: matchedMachine?.id ?? null,
    machineLabel: matchedMachine?.name ?? null,
  };
}

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
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="text-xs text-muted-esblu">{title}</p>
      <p className="mt-1 font-bold text-primary">{value || "-"}</p>
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
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState<CompanyMemberRole | null>(null);
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
  const [otherDocumentPhotoUrl, setOtherDocumentPhotoUrl] =
    useState<string | null>(null);
  const [selectedSpz, setSelectedSpz] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [scanDocumentType, setScanDocumentType] =
    useState<ScanDocumentType | null>(null);
  const [otherResult, setOtherResult] = useState<{
    fields: Record<string, any>;
    reviewStatus: string | null;
    confidenceScore: number | null;
    rawText: string | null;
    documentLanguage: string | null;
    fieldConfidence: { field: string; confidence: number }[];
  } | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<
    "vehicle" | "machine" | "none" | null
  >(null);
  // Výber z existujúcich vozidiel/strojov (dropdown, nie voľný text) —
  // používateľ nemusí ručne prepisovať identifikátor entity, ktorá už v
  // databáze existuje.
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [vehicleOptions, setVehicleOptions] = useState<
    { id: string; spz: string | null; vin: string | null }[]
  >([]);
  // PZP auto-matching (bod 2 zadania — VIN → ŠPZ, bez tichého hádania):
  // true, keď identifikátor z PZP zodpovedá VIACERÝM vozidlám firmy naraz.
  // V tom prípade sa NIKDY nepredvyberie žiadne vozidlo — používateľ musí
  // vybrať ručne (rovnaký princíp ako findDuplicateVehicle pri technickom
  // preukaze, len s explicitným rozlíšením "no match" vs. "ambiguous").
  const [insuranceMatchAmbiguous, setInsuranceMatchAmbiguous] =
    useState(false);
  const [machineOptions, setMachineOptions] = useState<
    { id: string; name: string | null }[]
  >([]);
  const [isSavingOtherDocument, setIsSavingOtherDocument] = useState(false);
  const [otherDocuments, setOtherDocuments] = useState<OtherDocumentRow[]>([]);
  const [selectedOtherDocument, setSelectedOtherDocument] =
    useState<OtherDocumentRow | null>(null);
  // Poznámka pri bločku/faktúre — voliteľné pole vyplnené pred uložením
  // (bod 2 zadania). Vážneho lístka/dodacieho listu sa netýka.
  const [documentNote, setDocumentNote] = useState("");
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null
  );
  // Zložky "Bločky"/"Faktúry" pre nepriradené dokumenty (bod 4 zadania).
  const [openFolder, setOpenFolder] = useState<AiInboxFolderKind | null>(null);
  const [folderExportLoading, setFolderExportLoading] = useState(false);
  const [folderExportFeedback, setFolderExportFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  // Prílohy PZP dokumentu (bod 3 zadania) — načítané pre aktuálne otvorený
  // detail dokumentu typu insurance.
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [newAttachmentType, setNewAttachmentType] = useState("white_card");
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);
  // Technický preukaz vozidla — samostatný flow (bod 2 zadania): predná +
  // voliteľná zadná strana sa spracujú AI ako JEDEN dokument cez
  // /api/scan-vehicle-registration (nie generický /api/scan-document).
  // Vozidlo v module Vozidlá sa vytvorí/aktualizuje AŽ po výslovnom
  // potvrdení používateľom — rovnaká AI Evidence zásada ako inde v tomto
  // súbore (žiadne automatické uloženie AI výsledku).
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
  // duplicity (bod 2 zadania).
  const [registrationDuplicateVehicle, setRegistrationDuplicateVehicle] =
    useState<any | null>(null);
  const saveOtherDocumentInProgressRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const saveRegistrationInProgressRef = useRef(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const {
    usage: planUsage,
    limit: planLimit,
    isLimited: isPlanLimited,
    loading: planUsageLoading,
    refresh: refreshPlanUsage,
  } = usePlanUsage("ai_evidence");
  // Vytvorenie NOVÉHO vozidla z technického preukazu podlieha rovnakému
  // plan-limitu ako ručné pridanie vozidla v module Vozidlá — aktualizácia
  // existujúceho (nájdeného) vozidla limit nekontroluje.
  const {
    isLimited: isVehiclePlanLimited,
    loading: vehiclePlanUsageLoading,
    refresh: refreshVehiclePlanUsage,
  } = usePlanUsage("vehicles");
  const { legalHold } = useCompanyDpaLegalHold();
  // Legal-hold blokuje vytváranie NOVÝCH ai_evidence/documents/
  // document_attachments záznamov — presne tabuľky, ktoré chráni
  // esblu_require_company_dpa_before_insert
  // (20260816090000_add_company_dpa_acceptance.sql). Rovnaký vzor ako
  // plan-limit blokovanie o riadok nižšie.
  const isCreationBlocked = (!planUsageLoading && isPlanLimited) || legalHold;

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

// Zložky "Bločky"/"Faktúry" (bod 4/6 zadania) — iba dokumenty BEZ priradenia
// k vozidlu/stroju. Priradené bločky/faktúry ostávajú v "Ostatné dokumenty"
// nižšie (so svojou väzbou viditeľnou), aby sa nikde nezobrazovali duplicitne.
const unassignedReceipts = otherDocuments.filter(
  (doc) => doc.document_type === "receipt" && !isDocumentAssigned(doc)
);
const unassignedInvoices = otherDocuments.filter(
  (doc) => doc.document_type === "invoice" && !isDocumentAssigned(doc)
);
// PZP a technický preukaz, ktoré už boli potvrdené a priradené k vozidlu/
// stroju, sa v Inboxe NEMAJÚ zobrazovať ako samostatná archivovaná položka
// (zadanie, bod 2/3) — dokument aj jeho súbor v Storage naďalej existujú
// bezo zmeny (nič sa nemaže), iba sa v tomto zozname skryjú, pretože ich
// "domovom" je od tejto chvíle detail príslušného vozidla/stroja (rovnaký
// dopyt cez document_links, iba na inej stránke — pozri app/vozidla/[id]).
// Ostatné typy dokumentov (faktúra, bloček, servisný doklad, iné) sa touto
// zmenou nedotýkajú — ich flow ostáva presne taký, ako bol.
const otherDocumentsFlatList = otherDocuments.filter((doc) => {
  if (
    (doc.document_type === "receipt" || doc.document_type === "invoice") &&
    !isDocumentAssigned(doc)
  ) {
    return false;
  }

  if (
    (doc.document_type === "insurance" ||
      doc.document_type === "vehicle_registration") &&
    isDocumentAssigned(doc)
  ) {
    return false;
  }

  return true;
});
const openFolderDocuments =
  openFolder === "receipt"
    ? unassignedReceipts
    : openFolder === "invoice"
      ? unassignedInvoices
      : [];

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
  async function handleExportFolder(kind: AiInboxFolderKind) {
    if (folderExportLoading) return;

    const folderRecords = kind === "receipt" ? unassignedReceipts : unassignedInvoices;

    if (folderRecords.length === 0) {
      setFolderExportFeedback({
        type: "error",
        text: "Nie sú dostupné žiadne dokumenty na export.",
      });
      return;
    }

    setFolderExportLoading(true);
    setFolderExportFeedback(null);

    try {
      const { exportedCount, fileName } = await exportAiInboxFolderToExcel(
        kind,
        folderRecords
      );

      setFolderExportFeedback({
        type: "success",
        text: `Exportovaných ${exportedCount} záznamov do súboru ${fileName}.`,
      });
    } catch (exportError: unknown) {
      console.error("Chyba pri exporte zložky:", exportError);
      setFolderExportFeedback({
        type: "error",
        text:
          exportError instanceof Error
            ? exportError.message
            : "Export sa nepodaril. Skús to znova.",
      });
    } finally {
      setFolderExportLoading(false);
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
          : legalHold
            ? LEGAL_HOLD_MESSAGE
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
          : legalHold
            ? LEGAL_HOLD_MESSAGE
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
      formData.append("image", compressedFile);

      const response = await fetch("/api/scan-document", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(describeScanError(response.status, data));
      }

      const scanned = data.data;
      const documentType = scanned.documentType as ScanDocumentType;

      setSelectedFile(compressedFile);
      setScanDocumentType(documentType);

      if (documentType === "weigh_ticket" || documentType === "delivery_note") {
        const fields =
          (documentType === "weigh_ticket"
            ? scanned.weighTicketFields
            : scanned.deliveryNoteFields) ?? {};

        const flatResult = buildFlatWeighTicketResult(documentType, fields, {
          rawText: scanned.rawText,
          confidenceScore: scanned.confidenceScore,
          reviewStatus: scanned.reviewStatus,
          documentLanguage: scanned.documentLanguage,
        });
        const resolvedMovementType = resolveMovementType(flatResult);
        const normalizedSpz = normalizeSpz(flatResult.spz);

        setOtherResult(null);
        setResult({
          ...flatResult,
          spz: normalizedSpz,
          movementType: resolvedMovementType || "",
        });

        setAssignmentTarget(null);
        setSelectedVehicleId("");
        setSelectedMachineId("");
      } else {
        const fieldsKey =
          documentType === "invoice"
            ? "invoiceFields"
            : documentType === "receipt"
            ? "receiptFields"
            : documentType === "insurance"
            ? "insuranceFields"
            : documentType === "service_document"
            ? "serviceDocumentFields"
            : "otherFields";
        const fields = scanned[fieldsKey] ?? {};

        setResult(null);
        setOtherResult({
          fields,
          reviewStatus: scanned.reviewStatus,
          confidenceScore: scanned.confidenceScore,
          rawText: scanned.rawText,
          documentLanguage: scanned.documentLanguage,
          fieldConfidence: Array.isArray(scanned.fieldConfidence)
            ? scanned.fieldConfidence
            : [],
        });

        setInsuranceMatchAmbiguous(false);

        if (documentType === "insurance") {
          // PZP — deterministické párovanie VIN → ŠPZ (bod 2 zadania),
          // NIKDY tiché hádanie. Presne jedna zhoda sa predvyberie; viac
          // zhôd naraz (ambiguous) alebo žiadna zhoda ostávajú bez
          // predvýberu a používateľ musí vozidlo/stroj vybrať ručne.
          const match = matchInsuranceVehicle(
            fields.vin,
            fields.vehicleIdentifier,
            vehicleOptions
          );

          if (match.vehicleId) {
            setAssignmentTarget("vehicle");
            setSelectedVehicleId(match.vehicleId);
            setSelectedMachineId("");
          } else if (match.ambiguous) {
            setInsuranceMatchAmbiguous(true);
            setAssignmentTarget(null);
            setSelectedVehicleId("");
            setSelectedMachineId("");
          } else {
            // Žiadna zhoda na vozidlo — skús ešte strojový fallback podľa
            // pôvodného vehicleIdentifier (napr. PZP prívesu/stroja), presne
            // ako doteraz. Nič sa nevytvára automaticky, iba sa predvyberie
            // existujúci stroj, ak jednoznačne zodpovedá.
            const normalizedIdentifierLabel =
              typeof fields.vehicleIdentifier === "string" && fields.vehicleIdentifier
                ? normalizeMachineLabel(fields.vehicleIdentifier)
                : "";
            const matchedMachine = normalizedIdentifierLabel
              ? machineOptions.find(
                  (machine) =>
                    normalizeMachineLabel(machine.name) === normalizedIdentifierLabel
                )
              : undefined;

            if (matchedMachine) {
              setAssignmentTarget("machine");
              setSelectedMachineId(matchedMachine.id);
              setSelectedVehicleId("");
            } else {
              setAssignmentTarget(null);
              setSelectedVehicleId("");
              setSelectedMachineId("");
            }
          }
        } else {
          // Ostatné typy (dnes iba service_document) — nezmenené: skús
          // identifikátor spárovať s vozidlom (ŠPZ) alebo strojom podľa už
          // načítaných zoznamov. Pri nejednoznačnosti/chýbajúcom
          // identifikátore ostáva priradenie nezvolené.
          const identifier =
            (documentType === "service_document" &&
              typeof fields.vehicleOrMachineIdentifier === "string" &&
              fields.vehicleOrMachineIdentifier) ||
            "";

          const normalizedIdentifierSpz = identifier ? normalizeSpz(identifier) : null;
          const matchedVehicle = normalizedIdentifierSpz
            ? vehicleOptions.find(
                (vehicle) => normalizeSpz(vehicle.spz) === normalizedIdentifierSpz
              )
            : undefined;

          const normalizedIdentifierLabel = identifier
            ? normalizeMachineLabel(identifier)
            : "";
          const matchedMachine =
            !matchedVehicle && normalizedIdentifierLabel
              ? machineOptions.find(
                  (machine) =>
                    normalizeMachineLabel(machine.name) === normalizedIdentifierLabel
                )
              : undefined;

          if (matchedVehicle) {
            setAssignmentTarget("vehicle");
            setSelectedVehicleId(matchedVehicle.id);
            setSelectedMachineId("");
          } else if (matchedMachine) {
            setAssignmentTarget("machine");
            setSelectedMachineId(matchedMachine.id);
            setSelectedVehicleId("");
          } else {
            setAssignmentTarget(null);
            setSelectedVehicleId("");
            setSelectedMachineId("");
          }
        }
      }

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
    resetScanReview();
    setError("");
  }

  function resetScanReview() {
    setResult(null);
    setOtherResult(null);
    setScanDocumentType(null);
    setAssignmentTarget(null);
    setSelectedVehicleId("");
    setSelectedMachineId("");
    setDocumentNote("");
    setInsuranceMatchAmbiguous(false);
  }

  function updateResult(field: string, value: string) {
    setResult((prev: any) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateOtherResult(field: string, value: string) {
    setOtherResult((prev) =>
      prev ? { ...prev, fields: { ...prev.fields, [field]: value } } : prev
    );
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

    if (legalHold) {
      setError(LEGAL_HOLD_MESSAGE);
      return;
    }

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
      // Vážny lístok / dodací list: priradenie k vozidlu je VÝHRADNE
      // automatické podľa ŠPZ, ktorú rozpoznala AI (žiadne ručné
      // "Chcete dokument priradiť?" pre tento typ). Ak vozidlo s danou
      // ŠPZ v module Vozidlá neexistuje, uloženie NESMIE zlyhať — dokument
      // sa uloží so ŠPZ ako textom a vehicle_id zostane null.
      // resolveVehicleIdBySpz nikdy nevyhadzuje chybu.
      const activeMembership = await getMyActiveMembership();

      if (!activeMembership) {
        throw new Error("Nie si prihlásený.");
      }

      const { vehicleId, canonicalSpz } = await resolveVehicleIdBySpz(
        activeMembership.company_id,
        result.spz
      );
      // Vážny lístok/dodací list nemá ručné priradenie k stroju.
      const machineId: string | null = null;
      const machineLabel: string | null = null;

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
        machine_id: machineId,
        machine_label: machineLabel,
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
      resetScanReview();
      setSelectedFile(null);
      setFileName("");
      await Promise.all([loadRecords(), refreshPlanUsage()]);
      alert("Dokument bol uložený do Inboxu.");
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
  // Uloženie ostatných typov dokumentov (faktúra, bloček, PZP/poistná
  // zmluva, servisný doklad, iné) — nový, samostatný save flow cez
  // public.documents + public.document_links. Vážneho lístka/dodacieho
  // listu (ai_evidence, saveEvidence vyššie) sa vôbec netýka.
  async function saveOtherDocument() {
    if (
      !otherResult ||
      !scanDocumentType ||
      scanDocumentType === "weigh_ticket" ||
      scanDocumentType === "delivery_note" ||
      saveOtherDocumentInProgressRef.current
    ) {
      return;
    }

    // PZP musí vždy skončiť priradené k existujúcemu vozidlu/stroju (bod 2
    // zadania) — nikdy sa neukladá "bez priradenia". UI nižšie preto pre
    // insurance vôbec neponúka možnosť "none"; táto kontrola je obranná
    // duplicita pre prípad priameho volania mimo bežného UI stavu.
    if (scanDocumentType === "insurance" && assignmentTarget === "none") {
      setError(
        "PZP musí byť priradené k existujúcemu vozidlu alebo stroju. Vyber vozidlo nižšie, alebo ak ešte v evidencii nie je, najprv ho pridaj (napr. cez technický preukaz)."
      );
      return;
    }

    if (!assignmentTarget) {
      setError(
        scanDocumentType === "insurance"
          ? "Vyber vozidlo alebo stroj, ku ktorému PZP patrí."
          : "Najprv zvoľ, či dokument priradiť k vozidlu, stroju, alebo bez priradenia."
      );
      return;
    }

    if (assignmentTarget === "vehicle" && !selectedVehicleId) {
      setError("Vyber vozidlo, ku ktorému chceš dokument priradiť.");
      return;
    }

    if (assignmentTarget === "machine" && !selectedMachineId) {
      setError("Vyber stroj, ku ktorému chceš dokument priradiť.");
      return;
    }

    if (legalHold) {
      setError(LEGAL_HOLD_MESSAGE);
      return;
    }

    saveOtherDocumentInProgressRef.current = true;
    setIsSavingOtherDocument(true);
    setError("");

    let uploadedPath: string | null = null;
    let documentInserted = false;
    let documentId: string | null = null;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Nie si prihlásený.");
      }

      // Vozidlo/stroj sa vyberá výhradne z už načítaného zoznamu vlastných
      // entít používateľa (dropdown) — čerstvá kontrola členstva tesne
      // pred uložením iba pre prípad, že bola medzičasom zmazaná.
      if (
        assignmentTarget === "vehicle" &&
        !vehicleOptions.some((vehicle) => vehicle.id === selectedVehicleId)
      ) {
        throw new Error(
          "Vybrané vozidlo už nie je dostupné. Obnov stránku a skús výber zopakovať."
        );
      }

      if (
        assignmentTarget === "machine" &&
        !machineOptions.some((machine) => machine.id === selectedMachineId)
      ) {
        throw new Error(
          "Vybraný stroj už nie je dostupný. Obnov stránku a skús výber zopakovať."
        );
      }

      documentId = crypto.randomUUID();
      let storagePath: string | null = null;

      if (selectedFile) {
        const uniqueName = `${Date.now()}-${crypto.randomUUID()}.webp`;
        storagePath = `${session.user.id}/${documentId}/${uniqueName}`;

        const { error: uploadError } = await supabase.storage
          .from("ai-inbox-documents")
          .upload(storagePath, selectedFile, {
            contentType: selectedFile.type || "image/webp",
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Fotku sa nepodarilo uložiť: ${uploadError.message}`);
        }

        uploadedPath = storagePath;
      }

      const status =
        otherResult.reviewStatus === "needs_review" ? "needs_review" : "confirmed";

      const { error: insertError } = await supabase.from("documents").insert({
        id: documentId,
        user_id: session.user.id,
        storage_bucket: "ai-inbox-documents",
        storage_path: storagePath,
        original_filename: fileName || null,
        mime_type: selectedFile?.type || null,
        file_size: selectedFile?.size ?? null,
        document_type: scanDocumentType,
        status,
        ai_raw_output: {
          documentType: scanDocumentType,
          confidenceScore: otherResult.confidenceScore,
          reviewStatus: otherResult.reviewStatus,
          documentLanguage: otherResult.documentLanguage,
          fieldConfidence: otherResult.fieldConfidence,
          fields: otherResult.fields,
        },
        extracted_fields: otherResult.fields,
        field_confidence: otherResult.fieldConfidence,
        note:
          scanDocumentType === "invoice" || scanDocumentType === "receipt"
            ? documentNote.trim() || null
            : null,
      });

      if (insertError) throw insertError;

      documentInserted = true;

      // Priradenie k vozidlu/stroju — samostatný insert do document_links,
      // aby zlyhanie priradenia (napr. medzičasom zmazaná entita) bolo
      // odlíšiteľné od zlyhania uloženia samotného dokumentu.
      if (assignmentTarget === "vehicle" || assignmentTarget === "machine") {
        const { error: linkError } = await supabase
          .from("document_links")
          .insert({
            user_id: session.user.id,
            document_id: documentId,
            vehicle_id: assignmentTarget === "vehicle" ? selectedVehicleId : null,
            machine_id: assignmentTarget === "machine" ? selectedMachineId : null,
            link_type: "primary",
            confirmed_by_user: true,
          });

        if (linkError) {
          console.error("Priradenie dokumentu sa nepodarilo uložiť:", linkError);
          resetScanReview();
          setSelectedFile(null);
          setFileName("");
          await loadOtherDocuments();
          setError(
            "Dokument bol uložený, ale priradenie k vozidlu/stroju sa nepodarilo uložiť. Otvor dokument v zozname a priraď ho znova."
          );
          return;
        }
      }

      // Audit záznam — best effort, nikdy neblokuje ani neoznamuje chybu
      // ako zlyhanie hlavného uloženia.
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

      resetScanReview();
      setSelectedFile(null);
      setFileName("");
      await loadOtherDocuments();
      alert("Dokument bol uložený do Inboxu.");
    } catch (saveError: unknown) {
      if (uploadedPath && !documentInserted) {
        const { error: cleanupError } = await supabase.storage
          .from("ai-inbox-documents")
          .remove([uploadedPath]);

        if (cleanupError) {
          console.error(
            "Insert zlyhal a osirotenú fotografiu sa nepodarilo odstrániť:",
            cleanupError
          );
        }
      }

      setError(
        saveError instanceof Error ? saveError.message : "Uloženie zlyhalo."
      );
    } finally {
      saveOtherDocumentInProgressRef.current = false;
      setIsSavingOtherDocument(false);
    }
  }

  // Vymazanie dokumentu z public.documents (faktúra, bloček, PZP, servisný
  // doklad, iné) — bod 1 zadania. Poradie je zámerne: najprv Storage
  // (hlavný súbor aj všetky prílohy), až potom DB riadok, aby nikdy
  // nevznikol osirotený súbor v Storage bez zodpovedajúceho DB záznamu (ak
  // by DB delete zlyhal po vymazaní Storage, dokument v zozname ostane a
  // vymazanie sa dá bezpečne zopakovať — remove() na už neexistujúcej ceste
  // nie je chyba). document_links aj document_attachments majú FK ON DELETE
  // CASCADE, takže sa v DB odstránia automaticky spolu s dokumentom.
  async function deleteOtherDocument(doc: OtherDocumentRow) {
    if (deletingDocumentId) return;

    if (
      !confirm(
        "Naozaj chceš natrvalo vymazať tento dokument? Vrátane originálneho súboru a prípadných príloh."
      )
    ) {
      return;
    }

    setDeletingDocumentId(doc.id);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Nie si prihlásený.");
      }

      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error("Nie si prihlásený.");
      }

      const { data: docAttachments, error: attachmentsError } = await supabase
        .from("document_attachments")
        .select("storage_bucket, storage_path")
        .eq("document_id", doc.id)
        .eq("company_id", membership.company_id);

      if (attachmentsError) {
        throw new Error(
          `Prílohy dokumentu sa nepodarilo načítať: ${attachmentsError.message}`
        );
      }

      const pathsByBucket = new Map<string, string[]>();
      const addPath = (bucket: string | null, path: string | null) => {
        if (!bucket || !path) return;
        const existing = pathsByBucket.get(bucket) ?? [];
        existing.push(path);
        pathsByBucket.set(bucket, existing);
      };

      addPath(doc.storage_bucket, doc.storage_path);
      (docAttachments || []).forEach((attachment) =>
        addPath(attachment.storage_bucket, attachment.storage_path)
      );

      for (const [bucket, paths] of pathsByBucket.entries()) {
        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove(paths);

        if (removeError) {
          throw new Error(
            `Súbory dokumentu sa nepodarilo odstrániť zo Storage: ${removeError.message}`
          );
        }
      }

      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id)
        .eq("company_id", membership.company_id);

      if (deleteError) throw deleteError;

      setOtherDocuments((prev) => prev.filter((item) => item.id !== doc.id));
      setSelectedOtherDocument((current) =>
        current?.id === doc.id ? null : current
      );
    } catch (deleteError: unknown) {
      alert(
        deleteError instanceof Error
          ? deleteError.message
          : "Vymazanie dokumentu zlyhalo."
      );
    } finally {
      setDeletingDocumentId(null);
    }
  }

  // ---------------------------------------------------------------------
  // Technický preukaz vozidla (bod 2 zadania) — samostatný flow: predná +
  // voliteľná zadná strana sa spracujú AI ako JEDEN dokument, používateľ
  // skontroluje/opraví údaje a AŽ PO výslovnom potvrdení sa buď aktualizuje
  // nájdené existujúce vozidlo (podľa VIN/ŠPZ), alebo sa vytvorí nové.
  // AI nikdy nevytvára ani neprepisuje vozidlo bez tohto potvrdenia.
  // ---------------------------------------------------------------------

  function clearRegistrationResult() {
    setRegistrationError("");
    setRegistrationFields(null);
    setRegistrationDuplicateVehicle(null);
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
      const compressedFile = await compressImage(file, 0);
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
          : "Fotografiu sa nepodarilo spracovať."
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

  async function handleProcessRegistration() {
    if (!regFrontFile) {
      setRegistrationError(
        "Najprv pridaj prednú stranu technického preukazu."
      );
      return;
    }

    if (legalHold) {
      setRegistrationError(LEGAL_HOLD_MESSAGE);
      return;
    }

    setIsProcessingRegistration(true);
    setRegistrationError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Na AI načítanie musíš byť prihlásený.");
      }

      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error("Nie si prihlásený.");
      }

      const formData = new FormData();
      formData.append("front", regFrontFile);

      if (regBackFile) {
        formData.append("back", regBackFile);
      }

      const response = await fetch("/api/scan-vehicle-registration", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "AI spracovanie technického preukazu zlyhalo."
        );
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
        membership.company_id,
        extracted.vin,
        normalizedSpz
      );
      setRegistrationDuplicateVehicle(duplicate);
    } catch (processingError: unknown) {
      setRegistrationError(
        processingError instanceof Error
          ? processingError.message
          : "AI načítanie technického preukazu zlyhalo."
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
      setRegistrationError(LEGAL_HOLD_MESSAGE);
      return;
    }

    const isNewVehicle = !registrationDuplicateVehicle;

    if (isNewVehicle) {
      const latestVehicleUsage = await refreshVehiclePlanUsage();

      if (latestVehicleUsage?.isLimited) {
        setRegistrationError(PLAN_LIMIT_MESSAGE);
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
        throw new Error("Nie si prihlásený.");
      }

      const membership = await getMyActiveMembership();

      if (!membership) {
        throw new Error("Nie si prihlásený.");
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
          `Prednú stranu sa nepodarilo uložiť: ${frontUploadError.message}`
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
            `Zadnú stranu sa nepodarilo uložiť: ${backUploadError.message}`
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

      const { error: linkError } = await supabase
        .from("document_links")
        .insert({
          user_id: session.user.id,
          document_id: documentId,
          vehicle_id: vehicleId,
          machine_id: null,
          link_type: "primary",
          confirmed_by_user: true,
        });

      if (linkError) {
        console.error(
          "Priradenie technického preukazu k vozidlu sa nepodarilo uložiť:",
          linkError
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

      const wasUpdate = Boolean(registrationDuplicateVehicle);

      clearRegistrationImages();
      await Promise.all([
        loadOtherDocuments(),
        loadVehicleAndMachineOptions(),
        refreshVehiclePlanUsage(),
      ]);

      alert(
        wasUpdate
          ? "Existujúce vozidlo bolo aktualizované podľa technického preukazu."
          : "Nové vozidlo bolo vytvorené a priradené k technickému preukazu."
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
        saveError instanceof Error ? saveError.message : "Uloženie zlyhalo.";

      if (isPlanLimitReachedError(saveError, "vehicles")) {
        setRegistrationError(PLAN_LIMIT_MESSAGE);
        await refreshVehiclePlanUsage();
      } else if (vehicleWritten && !documentInserted) {
        // Vozidlo sa už uložilo, ale fotografie technického preukazu sa
        // nepodarilo priradiť — nehlásiť tichý úspech, jasne to označiť a
        // nechať používateľa dokument nahrať znova (vozidlo v module
        // Vozidlá pritom zostáva bezpečne použiteľné).
        setRegistrationError(
          `Vozidlo bolo uložené, ale fotografie technického preukazu sa nepodarilo priradiť: ${message}. Skús dokument nahrať znova.`
        );
        await Promise.all([
          loadVehicleAndMachineOptions(),
          refreshVehiclePlanUsage(),
        ]);
      } else {
        setRegistrationError(message);
      }
    } finally {
      saveRegistrationInProgressRef.current = false;
      setIsSavingRegistration(false);
    }
  }

  // Prílohy PZP dokumentu (bod 3 zadania) — jednoduchý model: každá príloha
  // patrí presne jednému dokumentu (public.document_attachments). Volaná aj
  // po nahraní/vymazaní prílohy, aby zoznam ostal v sync bez refreshu.
  async function reloadAttachments(documentId: string) {
    setAttachmentsLoading(true);

    const { data, error } = await supabase
      .from("document_attachments")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setAttachments(data);
    } else if (error) {
      console.error("Chyba pri načítaní príloh dokumentu:", error);
    }

    setAttachmentsLoading(false);
  }

  async function handleAttachmentUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !selectedOtherDocument) return;

    if (legalHold) {
      setError(LEGAL_HOLD_MESSAGE);
      return;
    }

    setIsUploadingAttachment(true);
    setError("");

    let uploadedPath: string | null = null;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Nie si prihlásený.");
      }

      const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${file.name}`;
      const storagePath = `${session.user.id}/${selectedOtherDocument.id}/attachments/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from("ai-inbox-documents")
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Prílohu sa nepodarilo nahrať: ${uploadError.message}`);
      }

      uploadedPath = storagePath;

      const { data: inserted, error: insertError } = await supabase
        .from("document_attachments")
        .insert({
          user_id: session.user.id,
          document_id: selectedOtherDocument.id,
          storage_bucket: "ai-inbox-documents",
          storage_path: storagePath,
          original_filename: file.name || null,
          mime_type: file.type || null,
          file_size: file.size ?? null,
          attachment_type: newAttachmentType,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setAttachments((prev) => [...prev, inserted as AttachmentRow]);
    } catch (uploadError: unknown) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("ai-inbox-documents")
          .remove([uploadedPath]);

        if (cleanupError) {
          console.error(
            "Insert prílohy zlyhal a osirotený súbor sa nepodarilo odstrániť:",
            cleanupError
          );
        }
      }

      alert(
        uploadError instanceof Error
          ? uploadError.message
          : "Prílohu sa nepodarilo uložiť."
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  async function deleteAttachment(attachment: AttachmentRow) {
    if (deletingAttachmentId) return;
    if (!confirm("Naozaj chceš vymazať túto prílohu?")) return;

    setDeletingAttachmentId(attachment.id);

    try {
      const { error: removeError } = await supabase.storage
        .from(attachment.storage_bucket)
        .remove([attachment.storage_path]);

      if (removeError) {
        throw new Error(
          `Súbor prílohy sa nepodarilo odstrániť zo Storage: ${removeError.message}`
        );
      }

      const { error: deleteError } = await supabase
        .from("document_attachments")
        .delete()
        .eq("id", attachment.id);

      if (deleteError) throw deleteError;

      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
    } catch (deleteError: unknown) {
      alert(
        deleteError instanceof Error
          ? deleteError.message
          : "Vymazanie prílohy zlyhalo."
      );
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function openAttachment(attachment: AttachmentRow) {
    const { data, error } = await supabase.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, 300);

    if (error || !data) {
      alert("Prílohu sa nepodarilo otvoriť.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // Stiahnutie originálneho súboru dokumentu do zariadenia (bod 4/5
  // zadania) — skutočný download (nie iba otvorenie v novej záložke), aby
  // šlo dokument následne vytlačiť štandardným spôsobom zariadenia.
  async function downloadOriginal(doc: OtherDocumentRow) {
    if (!doc.storage_bucket || !doc.storage_path) return;

    try {
      const { data, error } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60);

      if (error || !data) {
        throw new Error("Originál sa nepodarilo pripraviť na stiahnutie.");
      }

      const response = await fetch(data.signedUrl);
      if (!response.ok) {
        throw new Error("Originál sa nepodarilo stiahnuť.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = doc.original_filename || `dokument-${doc.id}`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError: unknown) {
      alert(
        downloadError instanceof Error
          ? downloadError.message
          : "Originál sa nepodarilo stiahnuť."
      );
    }
  }

  // Tlač — otvorí originál v novej záložke, používateľ ho vytlačí bežným
  // spôsobom prehliadača/zariadenia (Ctrl+P / zdieľať > tlačiť na mobile).
  // Zámerne bez vlastnej print-CSS logiky — jednoduchšie a spoľahlivejšie.
  async function printOriginal(doc: OtherDocumentRow) {
    if (!doc.storage_bucket || !doc.storage_path) return;

    const { data, error } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 300);

    if (error || !data) {
      alert("Originál sa nepodarilo pripraviť na tlač.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // Bezpečný delete flow (opravené po security audite): najprv overíme
  // vlastníctvo a existenciu záznamu, potom vymažeme Storage objekt, a AŽ PO
  // jeho úspešnom (alebo bezpečne no-op, ak súbor už neexistuje) odstránení
  // vymažeme DB riadok. Predtým sa mazal DB riadok skôr než Storage súbor —
  // pri zlyhaní Storage delete tak mohol vzniknúť osirotený súbor bez
  // akejkoľvek DB stopy, ktorý sa už nedal dohľadať. Storage-first poradie je
  // bezpečnejšie: ak zlyhá Storage delete, DB riadok ostáva a operáciu možno
  // bezpečne zopakovať; `remove()` na už neexistujúcej ceste nie je chyba
  // (Supabase Storage to považuje za úspešný no-op), takže opakovaný pokus
  // po čiastočnom zlyhaní je vždy bezpečný.
  async function deleteRecord(id: string) {
    if (!confirm("Naozaj chceš vymazať tento záznam?")) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      alert("Nie si prihlásený.");
      return;
    }

    const membership = await getMyActiveMembership();

    if (!membership) {
      alert("Nie si prihlásený.");
      return;
    }

    // Vlastníctvo overujeme explicitne (nielen cez RLS) — select je
    // obmedzený na id AJ company_id aktívnej firmy, takže cudzí
    // záznam sa sem nikdy nenačíta.
    const { data: record, error: recordError } = await supabase
      .from("ai_evidence")
      .select("photo_url")
      .eq("id", id)
      .eq("company_id", membership.company_id)
      .single();

    if (recordError) {
      console.error("Chyba pri načítaní záznamu:", recordError);
      alert("Záznam sa nepodarilo načítať alebo ti nepatrí.");
      return;
    }

    // Ak existuje fotografia, vymažeme ju zo Storage skôr než DB riadok.
    if (record?.photo_url) {
      const { error: photoDeleteError } = await supabase.storage
        .from("ai-evidence-documents")
        .remove([record.photo_url]);

      if (photoDeleteError) {
        console.error(
          "Fotografiu sa nepodarilo odstrániť zo Storage, záznam nebol vymazaný:",
          photoDeleteError
        );
        alert(
          "Fotografiu sa nepodarilo odstrániť z úložiska. Záznam nebol vymazaný, skús to prosím znova."
        );
        return;
      }
    }

    // Vymažeme databázový záznam — opäť obmedzené na id AJ company_id (defense
    // in depth, nespoliehame sa iba na RLS).
    const { error: deleteError } = await supabase
      .from("ai_evidence")
      .delete()
      .eq("id", id)
      .eq("company_id", membership.company_id);

    if (deleteError) {
      console.error("Chyba pri mazaní záznamu:", deleteError);
      alert(
        "Fotografia bola odstránená z úložiska, ale záznam sa nepodarilo vymazať z databázy. Skús to prosím znova."
      );
      return;
    }

    setSelectedRecord(null);
    setDocumentPhotoUrl(null);
    await Promise.all([loadRecords(), refreshPlanUsage()]);
  }

  async function loadMembership(): Promise<string | null> {
  const membership = await getMyActiveMembership();

  if (!membership) {
    setCompanyId("");
    setRole(null);
    return null;
  }

  setCompanyId(membership.company_id);
  setRole(membership.role);
  return membership.company_id;
}

async function loadRecords(currentCompanyId: string = companyId) {
  if (!currentCompanyId) {
    setRecords([]);
    return;
  }

  const { data, error } = await supabase
    .from("ai_evidence")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("created_at", { ascending: false });

  if (!error && data) {
    setRecords(data);
  }
}

// Vlastné vozidlá a stroje firmy — zdroj pre výberové polia priradenia
// (dropdown), aby nikto nemusel ručne prepisovať identifikátor entity,
// ktorá už v databáze existuje.
async function loadVehicleAndMachineOptions(
  currentCompanyId: string = companyId
) {
  if (!currentCompanyId) {
    setVehicleOptions([]);
    setMachineOptions([]);
    return;
  }

  const [vehiclesResult, machinesResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, spz, vin")
      .eq("company_id", currentCompanyId)
      .order("spz", { ascending: true }),
    supabase
      .from("machines")
      .select("id, name")
      .eq("company_id", currentCompanyId)
      .order("name", { ascending: true }),
  ]);

  if (!vehiclesResult.error && vehiclesResult.data) {
    setVehicleOptions(vehiclesResult.data);
  }

  if (!machinesResult.error && machinesResult.data) {
    setMachineOptions(machinesResult.data);
  }
}

// Ostatné typy dokumentov (faktúra, bloček, PZP/poistná zmluva, servisný
// doklad, iné) — uložené v public.documents, priradenie v
// public.document_links (real FK na documents.id, PostgREST ho preto vie
// vnoriť priamo do selectu).
async function loadOtherDocuments(currentCompanyId: string = companyId) {
  if (!currentCompanyId) {
    setOtherDocuments([]);
    return;
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*, document_links(*)")
    .eq("company_id", currentCompanyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (!error && data) {
    setOtherDocuments(data);
  } else if (error) {
    console.error("Chyba pri načítaní ostatných dokumentov:", error);
  }
}

useEffect(() => {
  async function loadDocumentPhoto() {
    setDocumentPhotoUrl(null);

    if (!selectedRecord?.photo_url) {
      return;
    }

    const { data, error } = await supabase.storage
      .from("ai-evidence-documents")
      .createSignedUrl(selectedRecord.photo_url, 3600);

    if (error) {
      console.error("Chyba pri načítaní fotografie:", error);
      return;
    }

    setDocumentPhotoUrl(data.signedUrl);
  }

  loadDocumentPhoto();
}, [selectedRecord]);

useEffect(() => {
  async function loadOtherDocumentPhoto() {
    setOtherDocumentPhotoUrl(null);

    if (!selectedOtherDocument?.storage_bucket || !selectedOtherDocument?.storage_path) {
      return;
    }

    const { data, error } = await supabase.storage
      .from(selectedOtherDocument.storage_bucket)
      .createSignedUrl(selectedOtherDocument.storage_path, 3600);

    if (error) {
      console.error("Chyba pri načítaní fotografie dokumentu:", error);
      return;
    }

    setOtherDocumentPhotoUrl(data.signedUrl);
  }

  loadOtherDocumentPhoto();
}, [selectedOtherDocument]);

useEffect(() => {
  async function syncAttachmentsForSelectedDocument() {
    if (selectedOtherDocument?.document_type !== "insurance") {
      setAttachments([]);
      return;
    }

    await reloadAttachments(selectedOtherDocument.id);
  }

  syncAttachmentsForSelectedDocument();
}, [selectedOtherDocument?.id, selectedOtherDocument?.document_type]);

useEffect(() => {
  async function initialize() {
    const activeCompanyId = await loadMembership();

    await Promise.all([
      loadRecords(activeCompanyId || ""),
      loadVehicleAndMachineOptions(activeCompanyId || ""),
      loadOtherDocuments(activeCompanyId || ""),
    ]);
  }

  initialize();
}, []);

useEffect(() => {
  return () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  };
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

const currentWeightValidation = result
  ? normalizeAndValidateWeights({
      quantity: result.quantity,
      brutto: result.brutto,
      tara: result.tara,
      netto: result.netto,
      unit: result.unit,
    })
  : null;

// Priradenie uloženého dokumentu (documents + document_links) na
// zobraziteľný text — "Vozidlo — [ŠPZ]", "Stroj — [názov]" alebo
// "Bez priradenia". Vychádza z už načítaných vehicleOptions/machineOptions,
// takže nevyžaduje ďalší dotaz do DB.
function describeDocumentAssignment(doc: OtherDocumentRow): string {
  const link = Array.isArray(doc?.document_links) ? doc.document_links[0] : null;
  if (!link) return "Bez priradenia";

  if (link.vehicle_id) {
    const vehicle = vehicleOptions.find((v) => v.id === link.vehicle_id);
    return `Vozidlo — ${vehicle ? vehicle.spz : "neznáme vozidlo"}`;
  }

  if (link.machine_id) {
    const machine = machineOptions.find((m) => m.id === link.machine_id);
    return `Stroj — ${machine ? machine.name : "neznámy stroj"}`;
  }

  return "Bez priradenia";
}

// Krátke zhrnutie dokumentu pre kartu v zozname "Ostatné dokumenty" —
// zloží najvýstižnejšie z už uložených extracted_fields podľa typu
// dokumentu, nič nevymýšľa nad rámec toho, čo AI endpoint vrátil.
function summarizeDocument(doc: OtherDocumentRow): string {
  const fields = doc?.extracted_fields || {};
  const type = doc?.document_type as OtherDocumentType | undefined;

  const primary =
    (fields.supplier as string) ||
    (fields.merchant as string) ||
    (fields.provider as string) ||
    (fields.customer as string) ||
    "";

  const amount =
    (fields.totalAmount as string | number) ||
    (fields.premiumAmount as string | number) ||
    (fields.cost as string | number) ||
    "";
  const currency = (fields.currency as string) || "";

  const parts = [primary, amount ? `${amount} ${currency}`.trim() : ""].filter(
    Boolean
  );

  if (parts.length > 0) return parts.join(" • ");

  return type ? DOCUMENT_TYPE_LABELS[type] : "Dokument";
}

function formatAmount(value: unknown, currency: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Bez sumy";
  }
  const currencyLabel = typeof currency === "string" && currency ? ` ${currency}` : "";
  return `${value}${currencyLabel}`;
}

function formatDocDate(value: unknown): string {
  return typeof value === "string" && value ? value : "Bez dátumu";
}

  return (
    <main className="app-shell-bg min-h-screen p-4 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-3xl">
        <BackLink href="/" label="Hlavné menu" className="mb-4" />

        <div className="flex items-center gap-4">
  <img
    src="/images/ai-evidencia.png"
    alt="Inbox"
    className="h-16 w-16 object-contain"
  />
  <h1 className="text-4xl font-bold text-primary">
    INBOX
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

        {legalHold && (
          <p className="mt-6 rounded-2xl border border-amber-200/30 bg-warning-soft p-4 text-sm font-semibold text-amber-400">
            {LEGAL_HOLD_MESSAGE}
          </p>
        )}

        {role !== "employee" && (
          <div className="mt-10 rounded-3xl border border-subtle bg-surface-1 p-6 shadow-lg backdrop-blur-xl">
            <h2 className="text-2xl font-bold text-primary">
              🚘 Technický preukaz vozidla
            </h2>
            <p className="mt-2 text-sm text-secondary">
              Odfotografuj prednú a zadnú stranu technického preukazu. AI
              údaje spracuje ako jeden dokument, po tvojej kontrole a
              potvrdení sa vozidlo vytvorí alebo aktualizuje v module
              Vozidlá. Fotografie sa uložia spolu s dokumentom v Inboxe.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-2xl bg-surface-2 p-5 shadow-sm">
                <h3 className="text-lg font-bold">Predná strana</h3>
                <p className="mt-1 text-sm text-secondary">
                  Povinná fotografia
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
                    {isPreparingRegFront ? "Pripravujem..." : "📷 Odfotiť"}
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
                    🖼️ Vybrať z galérie
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
                      alt="Predná strana technického preukazu"
                      className="h-64 w-full rounded-xl border border-subtle bg-surface-1 object-contain"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-esblu">
                        Novým výberom fotografiu vymeníš.
                      </p>
                      <button
                        type="button"
                        onClick={() => removeRegistrationImage("front")}
                        disabled={isProcessingRegistration}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:bg-gray-400"
                      >
                        Odstrániť
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-subtle p-8 text-center text-sm text-muted-esblu">
                    Predná strana zatiaľ nie je vybraná.
                  </div>
                )}
              </section>

              <section className="rounded-2xl bg-surface-2 p-5 shadow-sm">
                <h3 className="text-lg font-bold">Zadná strana</h3>
                <p className="mt-1 text-sm text-secondary">
                  Voliteľná fotografia
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
                    {isPreparingRegBack ? "Pripravujem..." : "📷 Odfotiť"}
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
                    🖼️ Vybrať z galérie
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
                      alt="Zadná strana technického preukazu"
                      className="h-64 w-full rounded-xl border border-subtle bg-surface-1 object-contain"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-esblu">
                        Novým výberom fotografiu vymeníš.
                      </p>
                      <button
                        type="button"
                        onClick={() => removeRegistrationImage("back")}
                        disabled={isProcessingRegistration}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:bg-gray-400"
                      >
                        Odstrániť
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-subtle p-8 text-center text-sm text-muted-esblu">
                    Zadná strana zatiaľ nie je vybraná.
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
                ? "Načítavam údaje..."
                : "🤖 Načítať údaje pomocou AI"}
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
                    ⚠️ Nájdené existujúce vozidlo (
                    {registrationDuplicateVehicle.spz || "bez ŠPZ"}). Uložením
                    sa AKTUALIZUJÚ jeho údaje — nevytvorí sa duplicita.
                  </p>
                ) : (
                  <p className="badge-success rounded-xl p-3 text-sm font-medium">
                    Vozidlo s touto ŠPZ/VIN sa nenašlo — uložením sa vytvorí
                    nové vozidlo.
                  </p>
                )}

                <h3 className="text-lg font-bold text-primary">
                  Skontroluj údaje z technického preukazu
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[
                    ["spz", "ŠPZ"],
                    ["vin", "VIN"],
                    ["znacka", "Značka"],
                    ["model", "Model"],
                    ["rokVyroby", "Rok výroby"],
                    ["datumPrvejEvidencie", "Dátum prvej evidencie"],
                    ["palivo", "Palivo"],
                    ["objemMotora", "Objem motora"],
                    ["vykon", "Výkon"],
                    ["farba", "Farba"],
                    ["prevadzkovaHmotnost", "Prevádzková hmotnosť"],
                    ["pocetMiest", "Počet miest"],
                    ["kategoriaVozidla", "Kategória vozidla"],
                    ["druhVozidla", "Druh vozidla"],
                    [
                      "najvacsiaPripustnaCelkovaHmotnost",
                      "Najväčšia prípustná celková hmotnosť",
                    ],
                    ["cisloTechnickehoPreukazu", "Číslo technického preukazu"],
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

                <button
                  type="button"
                  onClick={saveRegistrationDocument}
                  disabled={
                    isSavingRegistration ||
                    legalHold ||
                    (!registrationDuplicateVehicle &&
                      (vehiclePlanUsageLoading || isVehiclePlanLimited))
                  }
                  className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white disabled:opacity-60"
                >
                  {isSavingRegistration
                    ? "Ukladám..."
                    : registrationDuplicateVehicle
                      ? "💾 Aktualizovať vozidlo"
                      : "💾 Vytvoriť vozidlo"}
                </button>

                {!registrationDuplicateVehicle &&
                  !vehiclePlanUsageLoading &&
                  isVehiclePlanLimited && (
                    <p className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-red-700">
                      {PLAN_LIMIT_MESSAGE}
                    </p>
                  )}
              </div>
            )}
          </div>
        )}

        <div className="mt-10 rounded-3xl border-2 border-dashed border-blue-300 bg-info-soft p-6 text-center">
  <span className="text-5xl">📄</span>

  <h2 className="mt-4 text-2xl font-bold text-primary">
    PRIDAŤ DOKUMENT
  </h2>

  <p className="mt-2 text-secondary">
    Odfotiť dokument alebo vybrať obrázok zo zariadenia
  </p>

  <div className="mt-6 grid grid-cols-2 gap-3">
    <label
      className={`rounded-2xl bg-blue-600 px-4 py-4 font-bold text-white ${
        planUsageLoading || isCreationBlocked || isProcessing || isSaving
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
        disabled={planUsageLoading || isCreationBlocked || isProcessing || isSaving}
        onChange={handleFile}
      />
    </label>

    <label
      className={`rounded-2xl bg-surface-1 px-4 py-4 font-bold text-blue-700 shadow ${
        planUsageLoading || isCreationBlocked || isProcessing || isSaving
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer"
      }`}
    >
      🖼️ Galéria
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={planUsageLoading || isCreationBlocked || isProcessing || isSaving}
        onChange={handleFile}
      />
    </label>
  </div>
</div>

        {previewUrl && pendingImageFile && (
          <section className="mt-8 rounded-3xl bg-surface-2 p-5 sm:p-6">
            <div className="text-center">
              <h2 className="text-xl font-black text-primary">
                Skontrolujte orientáciu dokumentu
              </h2>
              <p className="mt-2 text-sm text-secondary">
                Pred AI spracovaním otočte dokument tak, aby bol text čitateľný.
              </p>
              <p className="mt-2 text-sm font-bold text-blue-700">
                Rotácia: {rotation}°
              </p>
            </div>

            <div className="mx-auto mt-5 flex aspect-square w-full max-w-xl items-center justify-center overflow-hidden rounded-2xl bg-surface-2 p-3">
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
                className="rounded-2xl bg-surface-1 px-4 py-3 font-bold text-primary shadow disabled:cursor-not-allowed disabled:opacity-60"
              >
                ↺ Otočiť doľava
              </button>
              <button
                type="button"
                onClick={() =>
                  setRotation((current) => normalizeRotation(current + 90))
                }
                disabled={isProcessing}
                className="rounded-2xl bg-surface-1 px-4 py-3 font-bold text-primary shadow disabled:cursor-not-allowed disabled:opacity-60"
              >
                ↻ Otočiť doprava
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={processPendingDocument}
                disabled={isProcessing || planUsageLoading || isCreationBlocked}
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
                className="rounded-2xl bg-surface-2 px-5 py-4 font-bold text-primary disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-32"
              >
                Zrušiť
              </button>
            </div>
          </section>
        )}

        {fileName && (
          <div className="mt-8 rounded-2xl bg-surface-2 p-5">
            <p className="font-bold text-primary">Vybraný dokument:</p>
            <p className="mt-1 text-secondary">{fileName}</p>

            {isProcessing && (
              <p className="mt-4 font-semibold text-blue-600">
                🤖 AI spracováva dokument...
              </p>
            )}

            {error && (
              <p className="mt-4 font-semibold text-red-400">Chyba: {error}</p>
            )}
          </div>
        )}

        {result && (
          <div className="mt-8 space-y-4 rounded-3xl bg-surface-2 p-6">
            <h2 className="text-2xl font-black text-primary">
              Načítané údaje — {DOCUMENT_TYPE_LABELS[scanDocumentType ?? "weigh_ticket"]}
            </h2>

            {result.reviewStatus === "needs_review" && (
              <p className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
                ⚠️ AI si nie je istá niektorými údajmi. Pred uložením ich
                skontroluj.
              </p>
            )}

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
                <label className="text-sm font-bold text-secondary">
                  {label}
                </label>
                <input
                  value={result[field] ?? ""}
                  onChange={(e) => updateResult(field, e.target.value)}
                  className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-4 py-3 outline-none"
                />
              </div>
            ))}

            {currentWeightValidation?.invalidFields.length ? (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-red-700">
                Skontrolujte číselný formát polí: {" "}
                {currentWeightValidation.invalidFields.join(", ")}.
              </p>
            ) : currentWeightValidation?.hasMathMismatch ? (
              <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-amber-400">
                Brutto, tara a netto si matematicky nezodpovedajú. Hodnoty sa
                automaticky neopravili a záznam bude označený na kontrolu.
              </p>
            ) : currentWeightValidation?.isUnitMissing ? (
              <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-amber-400">
                Pri hmotnosti chýba rozpoznaná jednotka. Záznam bude označený
                na kontrolu.
              </p>
            ) : null}

            {/* Vážny lístok/dodací list nemá ručné priradenie — vozidlo sa
                dohľadáva automaticky podľa ŠPZ priamo v saveEvidence(). */}
            <button
              onClick={saveEvidence}
              disabled={
                isSaving ||
                planUsageLoading ||
                isCreationBlocked ||
                Boolean(currentWeightValidation?.invalidFields.length)
              }
              className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white disabled:opacity-60"
            >
              {isSaving ? "Ukladám..." : "💾 Uložiť do evidencie"}
            </button>
          </div>
          )}

        {otherResult &&
          scanDocumentType &&
          scanDocumentType !== "weigh_ticket" &&
          scanDocumentType !== "delivery_note" && (
          <div className="mt-8 space-y-4 rounded-3xl bg-surface-2 p-6">
            <h2 className="text-2xl font-black text-primary">
              Načítané údaje — {DOCUMENT_TYPE_LABELS[scanDocumentType]}
            </h2>

            {otherResult.reviewStatus === "needs_review" && (
              <p className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
                ⚠️ Tento dokument potrebuje kontrolu — AI si nie je istá
                niektorými údajmi.
              </p>
            )}

            {REVIEW_ONLY_FIELD_LABELS[scanDocumentType].map(
              ([field, label]) => (
                <div key={field}>
                  <label className="text-sm font-bold text-secondary">
                    {label}
                  </label>
                  <input
                    value={otherResult.fields[field] ?? ""}
                    onChange={(e) => updateOtherResult(field, e.target.value)}
                    className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-4 py-3 outline-none"
                  />
                </div>
              )
            )}

            {/* Poznámka — nepovinná, iba pri bločku/faktúre (bod 2 zadania). */}
            {(scanDocumentType === "invoice" ||
              scanDocumentType === "receipt") && (
              <div>
                <label className="text-sm font-bold text-secondary">
                  Poznámka (nepovinné)
                </label>
                <textarea
                  value={documentNote}
                  onChange={(e) => setDocumentNote(e.target.value)}
                  rows={3}
                  placeholder="Napr. na čo bol nákup, kto ho schválil..."
                  className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-4 py-3 outline-none"
                />
              </div>
            )}

            {/* Priradenie MUSÍ byť pred tlačidlom Uložiť — rovnaká zásada
                ako pri vážnom lístku, aby sa nedalo uložiť skôr, než sa
                používateľ k priradeniu vôbec dostane. */}
            <div className="space-y-4 rounded-2xl border border-subtle bg-surface-1 p-5">
              <h3 className="text-lg font-black text-primary">
                {scanDocumentType === "insurance"
                  ? "Ku ktorému vozidlu/stroju PZP patrí?"
                  : "Chcete dokument priradiť?"}
              </h3>

              {scanDocumentType === "insurance" && insuranceMatchAmbiguous && (
                <p className="rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-400">
                  ⚠️ Identifikátor z dokumentu (VIN/ŠPZ) zodpovedá viacerým
                  vozidlám naraz — automaticky sme nič nevybrali. Vyber
                  správne vozidlo ručne nižšie.
                </p>
              )}

              {scanDocumentType === "insurance" &&
                !insuranceMatchAmbiguous &&
                assignmentTarget === null && (
                  <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted-esblu">
                    Vozidlo podľa VIN/ŠPZ z dokumentu sa nenašlo. Vyber ho
                    ručne, alebo ak v evidencii ešte nie je, najprv ho pridaj.
                  </p>
                )}

              <div
                className={`grid gap-2 ${
                  scanDocumentType === "insurance"
                    ? "grid-cols-2"
                    : "grid-cols-3"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setAssignmentTarget("vehicle")}
                  className={`rounded-2xl px-3 py-4 text-sm font-bold ${
                    assignmentTarget === "vehicle"
                      ? "bg-blue-600 text-white"
                      : "bg-surface-2 text-secondary"
                  }`}
                >
                  🚛 Vozidlo
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentTarget("machine")}
                  className={`rounded-2xl px-3 py-4 text-sm font-bold ${
                    assignmentTarget === "machine"
                      ? "bg-blue-600 text-white"
                      : "bg-surface-2 text-secondary"
                  }`}
                >
                  🚜 Stroj
                </button>
                {scanDocumentType !== "insurance" && (
                  <button
                    type="button"
                    onClick={() => setAssignmentTarget("none")}
                    className={`rounded-2xl px-3 py-4 text-sm font-bold ${
                      assignmentTarget === "none"
                        ? "bg-blue-600 text-white"
                        : "bg-surface-2 text-secondary"
                    }`}
                  >
                    Bez priradenia
                  </button>
                )}
              </div>

              {assignmentTarget === "vehicle" && (
                <div>
                  <label className="text-sm font-bold text-secondary">
                    Vozidlo
                  </label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-4 py-3 outline-none"
                  >
                    <option value="">— vyber vozidlo —</option>
                    {vehicleOptions.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.spz || "Bez ŠPZ"}
                      </option>
                    ))}
                  </select>
                  {vehicleOptions.length === 0 && (
                    <p className="mt-1 text-xs text-muted-esblu">
                      Zatiaľ nemáš pridané žiadne vozidlo v module Vozidlá.
                    </p>
                  )}
                </div>
              )}

              {assignmentTarget === "machine" && (
                <div>
                  <label className="text-sm font-bold text-secondary">
                    Stroj
                  </label>
                  <select
                    value={selectedMachineId}
                    onChange={(e) => setSelectedMachineId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-subtle bg-surface-1 px-4 py-3 outline-none"
                  >
                    <option value="">— vyber stroj —</option>
                    {machineOptions.map((machine) => (
                      <option key={machine.id} value={machine.id}>
                        {machine.name || "Bez názvu"}
                      </option>
                    ))}
                  </select>
                  {machineOptions.length === 0 && (
                    <p className="mt-1 text-xs text-muted-esblu">
                      Zatiaľ nemáš pridaný žiadny stroj v module Stroje.
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={saveOtherDocument}
              disabled={
                isSavingOtherDocument ||
                planUsageLoading ||
                legalHold ||
                !assignmentTarget ||
                (assignmentTarget === "vehicle" && !selectedVehicleId) ||
                (assignmentTarget === "machine" && !selectedMachineId)
              }
              className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white disabled:opacity-60"
            >
              {isSavingOtherDocument
                ? "Ukladám..."
                : assignmentTarget === "vehicle"
                  ? `💾 Uložiť k vozidlu${
                      selectedVehicleId
                        ? ` (${
                            vehicleOptions.find((v) => v.id === selectedVehicleId)
                              ?.spz || ""
                          })`
                        : ""
                    }`
                  : assignmentTarget === "machine"
                    ? `💾 Uložiť k stroju${
                        selectedMachineId
                          ? ` (${
                              machineOptions.find((m) => m.id === selectedMachineId)
                                ?.name || ""
                            })`
                          : ""
                      }`
                    : assignmentTarget === "none"
                      ? "💾 Uložiť bez priradenia"
                      : "💾 Najprv zvoľ priradenie"}
            </button>

            <button
              type="button"
              onClick={cancelPendingDocument}
              disabled={isSavingOtherDocument}
              className="mt-2 w-full rounded-2xl bg-surface-2 px-5 py-4 font-bold text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Nahrať iný dokument
            </button>
          </div>
        )}

         {records.length > 0 && (
  <div className="mt-10">
    <h2 className="mb-4 text-2xl font-bold text-primary">
      Prehľad materiálu
    </h2>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-3xl border border-green-200 bg-surface-1 p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-green-400">
          Dovoz
        </p>

        <p className="mt-2 text-4xl font-black text-primary">
          {summary.totalImport.toFixed(2)} t
        </p>

        <p className="mt-1 text-sm text-secondary">
          {summary.importCount} dokladov
        </p>

        <div className="mt-5 space-y-2">
          {Object.entries(summary.importByMaterial).map(
            ([material, weight]: any) => (
              <div
                key={material}
                className="flex items-center justify-between rounded-xl bg-success-soft px-4 py-3"
              >
                <span className="font-semibold text-primary">
                  {material}
                </span>

                <span className="font-black text-green-400">
                  {Number(weight).toFixed(2)} t
                </span>
              </div>
            )
          )}

          {Object.keys(summary.importByMaterial).length === 0 && (
            <p className="text-sm text-muted-esblu">
              Zatiaľ nie je evidovaný žiadny dovoz.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-orange-200 bg-surface-1 p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-orange-400">
          Vývoz
        </p>

        <p className="mt-2 text-4xl font-black text-primary">
          {summary.totalExport.toFixed(2)} t
        </p>

        <p className="mt-1 text-sm text-secondary">
          {summary.exportCount} dokladov
        </p>

        <div className="mt-5 space-y-2">
          {Object.entries(summary.exportByMaterial).map(
            ([material, weight]: any) => (
              <div
                key={material}
                className="flex items-center justify-between rounded-xl bg-warning-soft px-4 py-3"
              >
                <span className="font-semibold text-primary">
                  {material}
                </span>

                <span className="font-black text-orange-400">
                  {Number(weight).toFixed(2)} t
                </span>
              </div>
            )
          )}

          {Object.keys(summary.exportByMaterial).length === 0 && (
            <p className="text-sm text-muted-esblu">
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
    <h2 className="mb-4 text-2xl font-bold text-primary">
      Prehľad podľa ŠPZ
    </h2>

    <div className="space-y-5">
      {Object.entries(summaryBySpz).map(
        ([spz, vehicleSummary]: any) => (
          <div
            key={spz}
            className="rounded-3xl border border-subtle bg-surface-1 p-6 shadow-sm"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                  Vozidlo
                </p>

                <h3 className="text-2xl font-black text-primary">
                  {spz}
                </h3>
              </div>

              <p className="text-sm text-muted-esblu">
                {vehicleSummary.importCount +
                  vehicleSummary.exportCount}{" "}
                dokladov
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-success-soft p-5">
                <p className="text-sm font-bold uppercase text-green-400">
                  Dovoz
                </p>

                <p className="mt-2 text-3xl font-black text-primary">
                  {vehicleSummary.totalImport.toFixed(2)} t
                </p>

                <div className="mt-4 space-y-2">
                  {Object.entries(
                    vehicleSummary.importByMaterial
                  ).map(([material, weight]: any) => (
                    <div
                      key={material}
                      className="flex justify-between rounded-xl bg-surface-1 px-3 py-2"
                    >
                      <span className="font-semibold text-secondary">
                        {material}
                      </span>

                      <span className="font-black text-green-400">
                        {Number(weight).toFixed(2)} t
                      </span>
                    </div>
                  ))}

                  {Object.keys(
                    vehicleSummary.importByMaterial
                  ).length === 0 && (
                    <p className="text-sm text-muted-esblu">
                      Žiadny dovoz.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-warning-soft p-5">
                <p className="text-sm font-bold uppercase text-orange-400">
                  Vývoz
                </p>

                <p className="mt-2 text-3xl font-black text-primary">
                  {vehicleSummary.totalExport.toFixed(2)} t
                </p>

                <div className="mt-4 space-y-2">
                  {Object.entries(
                    vehicleSummary.exportByMaterial
                  ).map(([material, weight]: any) => (
                    <div
                      key={material}
                      className="flex justify-between rounded-xl bg-surface-1 px-3 py-2"
                    >
                      <span className="font-semibold text-secondary">
                        {material}
                      </span>

                      <span className="font-black text-orange-400">
                        {Number(weight).toFixed(2)} t
                      </span>
                    </div>
                  ))}

                  {Object.keys(
                    vehicleSummary.exportByMaterial
                  ).length === 0 && (
                    <p className="text-sm text-muted-esblu">
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
    <h2 className="mb-4 text-2xl font-bold text-primary">
      Uložené doklady
    </h2>

    <div className="mt-5 space-y-3">
      {!selectedSpz &&
  Object.entries(groupedRecords).map(([spz, items]: any) => (
    <div
      key={spz}
      className="rounded-3xl border border-subtle bg-surface-1 p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-600">
            🚛 Vozidlo
          </p>

          <h3 className="mt-2 text-2xl font-black text-primary">
            {spz}
          </h3>

          <p className="mt-1 text-sm text-secondary">
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
      className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 font-bold text-secondary"
    >
      ← Späť na všetky ŠPZ
    </button>

    <h3 className="mb-4 text-2xl font-bold text-primary">
      🚛 {selectedSpz}
    </h3>

    <div className="space-y-3">
      {groupedRecords[selectedSpz]?.map((record: any) => (
        <div
          key={record.id}
          className="rounded-3xl border border-subtle bg-surface-1 p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-600">
                📄 {record.document_type || "Doklad"}
              </p>

              <h3 className="mt-2 text-xl font-black text-primary">
                {record.spz || "Bez ŠPZ"}
              </h3>
            </div>

            <span className="rounded-full bg-info-soft px-3 py-1 text-xs font-bold text-blue-700">
              {record.movement_type || "nezaradené"}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-secondary">
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
    {isOwnerOrAdmin(role) && (
    <div className="mt-10 rounded-3xl border border-subtle bg-surface-1 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-primary">
            Export dokumentov
          </h2>
          <p className="mt-1 text-sm text-secondary">
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
        <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-amber-400">
          Nie sú dostupné žiadne dokumenty na export.
        </p>
      )}

      {exportFeedback && (
        <p
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            exportFeedback.type === "success"
              ? "badge-success"
              : "badge-danger"
          }`}
        >
          {exportFeedback.text}
        </p>
      )}
    </div>
    )}

    {/* Zložky "Bločky"/"Faktúry" — nepriradené dokumenty (bod 4 zadania). */}
    {!openFolder && (
      <div className="mt-10">
        <h2 className="text-2xl font-black text-primary">
          Zložky
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setOpenFolder("receipt")}
            className="rounded-3xl border border-subtle bg-surface-1 p-5 text-left shadow-sm transition hover:border-blue-300"
          >
            <p className="text-3xl">🧾</p>
            <h3 className="mt-2 text-xl font-black text-primary">Bločky</h3>
            <p className="mt-1 text-sm text-secondary">
              {unassignedReceipts.length}{" "}
              {unassignedReceipts.length === 1 ? "nepriradený bloček" : "nepriradených bločkov"}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setOpenFolder("invoice")}
            className="rounded-3xl border border-subtle bg-surface-1 p-5 text-left shadow-sm transition hover:border-blue-300"
          >
            <p className="text-3xl">📃</p>
            <h3 className="mt-2 text-xl font-black text-primary">Faktúry</h3>
            <p className="mt-1 text-sm text-secondary">
              {unassignedInvoices.length}{" "}
              {unassignedInvoices.length === 1 ? "nepriradená faktúra" : "nepriradených faktúr"}
            </p>
          </button>
        </div>
      </div>
    )}

    {openFolder && (
      <div className="mt-10">
        <button
          onClick={() => {
            setOpenFolder(null);
            setFolderExportFeedback(null);
          }}
          className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 font-bold text-secondary"
        >
          ← Späť na zložky
        </button>

        <div className="flex flex-col gap-4 rounded-3xl border border-subtle bg-surface-1 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-2xl font-black text-primary">
              {openFolder === "receipt" ? "🧾 Bločky" : "📃 Faktúry"}
            </h2>
            <p className="mt-1 text-sm text-secondary">
              {openFolderDocuments.length}{" "}
              {openFolderDocuments.length === 1 ? "nepriradený dokument" : "nepriradených dokumentov"}
            </p>
          </div>

          {isOwnerOrAdmin(role) && (
          <button
            type="button"
            onClick={() => handleExportFolder(openFolder)}
            disabled={folderExportLoading || openFolderDocuments.length === 0}
            aria-busy={folderExportLoading}
            className="rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {folderExportLoading ? "Generujem Excel..." : "Exportovať zložku"}
          </button>
          )}
        </div>

        {folderExportFeedback && (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
              folderExportFeedback.type === "success"
                ? "badge-success"
                : "badge-danger"
            }`}
          >
            {folderExportFeedback.text}
          </p>
        )}

        {openFolderDocuments.length === 0 ? (
          <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-secondary">
            Zatiaľ tu nie sú žiadne nepriradené dokumenty.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {openFolderDocuments.map((doc) => {
              const fields = doc.extracted_fields || {};
              return (
                <div
                  key={doc.id}
                  className="rounded-3xl border border-subtle bg-surface-1 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      {openFolder === "receipt" ? (
                        <h3 className="text-lg font-black text-primary">
                          {(fields.merchant as string) || "Bez obchodníka"}
                        </h3>
                      ) : (
                        <h3 className="text-lg font-black text-primary">
                          {(fields.supplier as string) || "Bez dodávateľa"}
                        </h3>
                      )}
                      <p className="mt-1 text-sm text-secondary">
                        📅{" "}
                        {formatDocDate(
                          openFolder === "receipt"
                            ? fields.purchaseDate
                            : fields.issueDate
                        )}
                      </p>
                    </div>

                    {doc.status === "needs_review" && (
                      <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-amber-400">
                        na kontrolu
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-1 text-sm text-secondary">
                    <p>💶 {formatAmount(fields.totalAmount, fields.currency)}</p>
                    {openFolder === "invoice" && (
                      <p>
                        🔢{" "}
                        {(fields.invoiceNumber as string) || "Bez čísla faktúry"}
                      </p>
                    )}
                    {doc.note && <p>📝 {doc.note}</p>}
                  </div>

                  <button
                    onClick={() => setSelectedOtherDocument(doc)}
                    className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
                  >
                    📄 Otvoriť detail
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}

    <div className="mt-10">
      <h2 className="text-2xl font-black text-primary">
        Ostatné dokumenty
      </h2>
      <p className="mt-1 text-sm text-secondary">
        PZP, servisné doklady, ostatné dokumenty a priradené faktúry/bločky uložené cez Inbox.
      </p>

      {otherDocumentsFlatList.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-secondary">
          Zatiaľ tu nie sú žiadne uložené dokumenty.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {otherDocumentsFlatList.map((doc) => (
            <div
              key={doc.id}
              className="rounded-3xl border border-subtle bg-surface-1 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-blue-600">
                    📄{" "}
                    {DOCUMENT_TYPE_LABELS[doc.document_type as ScanDocumentType] ||
                      doc.document_type ||
                      "Doklad"}
                  </p>

                  <h3 className="mt-2 text-lg font-black text-primary">
                    {summarizeDocument(doc)}
                  </h3>
                </div>

                {doc.status === "needs_review" && (
                  <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-amber-400">
                    na kontrolu
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2 text-sm text-secondary">
                <p>🔗 {describeDocumentAssignment(doc)}</p>
                <p>
                  📅{" "}
                  {doc.created_at
                    ? new Date(doc.created_at).toLocaleDateString("sk-SK")
                    : "Bez dátumu"}
                </p>
              </div>

              <button
                onClick={() => setSelectedOtherDocument(doc)}
                className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
              >
                📄 Otvoriť detail
              </button>
            </div>
          ))}
        </div>
      )}
    </div>

{selectedRecord && (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-surface-1 p-5 shadow-2xl sm:p-8">

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black">
          📄 Detail dokumentu
        </h2>

        <button
          onClick={() => setSelectedRecord(null)}
          className="rounded-xl bg-surface-2 px-4 py-2"
        >
          ✕
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">

        <Info title="Typ" value={selectedRecord.document_type} />
        <Info title="Pohyb" value={selectedRecord.movement_type} />
        <Info
          title="Priradenie"
          value={
            selectedRecord.vehicle_id
              ? `Vozidlo${selectedRecord.spz ? ` — ${selectedRecord.spz}` : ""}`
              : selectedRecord.machine_id
                ? `Stroj${selectedRecord.machine_label ? ` — ${selectedRecord.machine_label}` : ""}`
                : "Bez priradenia"
          }
        />
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
    <p className="mb-2 text-sm font-bold text-secondary">
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
          className="max-h-[500px] w-full rounded-2xl border border-subtle object-contain"
        />
      </a>
    ) : (
      <p className="text-sm text-muted-esblu">
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
{isOwnerOrAdmin(role) && (
<button
  onClick={() => deleteRecord(selectedRecord.id)}
  className="mt-3 w-full rounded-2xl bg-red-600 py-4 font-bold text-white"
>
  🗑 Vymazať záznam
</button>
)}
    </div>
  </div>
)}
{selectedOtherDocument && (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-surface-1 p-5 shadow-2xl sm:p-8">

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black">
          📄 Detail dokumentu
        </h2>

        <button
          onClick={() => setSelectedOtherDocument(null)}
          className="rounded-xl bg-surface-2 px-4 py-2"
        >
          ✕
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">

        <Info
          title="Typ"
          value={
            DOCUMENT_TYPE_LABELS[
              selectedOtherDocument.document_type as ScanDocumentType
            ] || selectedOtherDocument.document_type
          }
        />
        <Info
          title="Priradenie"
          value={describeDocumentAssignment(selectedOtherDocument)}
        />

        {(
          REVIEW_ONLY_FIELD_LABELS[
            selectedOtherDocument.document_type as OtherDocumentType
          ] || []
        ).map(([field, label]) => (
          <Info
            key={field}
            title={label}
            value={selectedOtherDocument.extracted_fields?.[field]}
          />
        ))}

        <Info
          title="Vytvorené"
          value={
            selectedOtherDocument.created_at
              ? new Date(selectedOtherDocument.created_at).toLocaleString("sk-SK")
              : null
          }
        />

      </div>

      {selectedOtherDocument.note && (
        <div className="mt-5 rounded-2xl bg-warning-soft p-4">
          <p className="text-sm font-bold text-amber-400">📝 Poznámka</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-400">
            {selectedOtherDocument.note}
          </p>
        </div>
      )}

      {selectedOtherDocument.storage_path && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-bold text-secondary">
            Originálny dokument
          </p>

          {otherDocumentPhotoUrl ? (
            <a
              href={otherDocumentPhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={otherDocumentPhotoUrl}
                alt="Originálny dokument"
                className="max-h-[500px] w-full rounded-2xl border border-subtle object-contain"
              />
            </a>
          ) : (
            <p className="text-sm text-muted-esblu">
              Načítavam fotografiu...
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => downloadOriginal(selectedOtherDocument)}
              className="rounded-2xl bg-surface-2 px-4 py-3 font-bold text-primary"
            >
              ⬇️ Stiahnuť
            </button>
            <button
              type="button"
              onClick={() => printOriginal(selectedOtherDocument)}
              className="rounded-2xl bg-surface-2 px-4 py-3 font-bold text-primary"
            >
              🖨️ Tlačiť
            </button>
          </div>
        </div>
      )}

      {selectedOtherDocument.document_type === "insurance" && (
        <div className="mt-6 rounded-2xl border border-subtle p-4">
          <p className="text-sm font-black text-primary">📎 Prílohy</p>
          <p className="mt-1 text-xs text-muted-esblu">
            Biela karta, zelená karta, záznam o poistnej udalosti alebo iný
            súvisiaci dokument k tomuto PZP.
          </p>

          {attachmentsLoading ? (
            <p className="mt-3 text-sm text-muted-esblu">Načítavam prílohy...</p>
          ) : attachments.length === 0 ? (
            <p className="mt-3 text-sm text-muted-esblu">
              Zatiaľ tu nie sú žiadne prílohy.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-primary">
                      {ATTACHMENT_TYPE_LABELS[attachment.attachment_type] ||
                        "Iný súvisiaci dokument"}
                    </p>
                    <p className="truncate text-xs text-muted-esblu">
                      {attachment.original_filename || "bez názvu"}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openAttachment(attachment)}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                    >
                      Otvoriť
                    </button>
                    {isOwnerOrAdmin(role) && (
                      <button
                        type="button"
                        onClick={() => deleteAttachment(attachment)}
                        disabled={deletingAttachmentId === attachment.id}
                        className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
                      >
                        {deletingAttachmentId === attachment.id
                          ? "Mažem..."
                          : "Vymazať"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select
              value={newAttachmentType}
              onChange={(e) => setNewAttachmentType(e.target.value)}
              className="rounded-xl border border-subtle bg-surface-1 px-3 py-3 text-sm outline-none sm:flex-1"
            >
              {Object.entries(ATTACHMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label
              className={`rounded-xl px-4 py-3 text-center text-sm font-bold ${
                isUploadingAttachment
                  ? "cursor-not-allowed bg-surface-2 text-muted-esblu"
                  : "cursor-pointer bg-blue-600 text-white"
              }`}
            >
              {isUploadingAttachment ? "Nahrávam..." : "+ Pridať prílohu"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                disabled={isUploadingAttachment || legalHold}
                onChange={handleAttachmentUpload}
              />
            </label>
          </div>
        </div>
      )}

      <button
        onClick={() => setSelectedOtherDocument(null)}
        className="mt-8 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white"
      >
        Zavrieť
      </button>

      {isOwnerOrAdmin(role) && (
      <button
        onClick={() => deleteOtherDocument(selectedOtherDocument)}
        disabled={deletingDocumentId === selectedOtherDocument.id}
        className="mt-3 w-full rounded-2xl bg-red-600 py-4 font-bold text-white disabled:opacity-60"
      >
        {deletingDocumentId === selectedOtherDocument.id
          ? "Mažem..."
          : "🗑 Vymazať dokument"}
      </button>
      )}
    </div>
  </div>
)}
      </div>
    </main>
  );
}
