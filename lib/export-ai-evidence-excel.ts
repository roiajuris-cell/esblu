import type { Workbook, Worksheet } from "exceljs";

export type AiEvidenceExcelRecord = {
  id: string;
  spz: string | null;
  document_type: string | null;
  movement_type: string | null;
  supplier: string | null;
  customer: string | null;
  document_number: string | null;
  material: string | null;
  material_original: string | null;
  material_category: string | null;
  document_date: string | null;
  brutto: number | string | null;
  tara: number | string | null;
  netto: number | string | null;
  unit: string | null;
  construction_site: string | null;
  source_location: string | null;
  destination_location: string | null;
  photo_url: string | null;
  raw_text: string | null;
  created_at: string | null;
  quantity?: number | string | null;
};

type ExportResult = {
  exportedCount: number;
  fileName: string;
};

type UnknownUnitSummary = {
  label: string;
  count: number;
  netto: number;
};

type VehicleNettoSummary = {
  totalImportTons: number;
  totalExportTons: number;
  totalTons: number;
  unknownUnits: Map<string, UnknownUnitSummary>;
};

const DETAIL_HEADERS = [
  "Typ dokumentu",
  "Dátum dokumentu",
  "Číslo dokumentu",
  "ŠPZ",
  "Dodávateľ",
  "Zákazník",
  "Materiál",
  "Pôvodný názov materiálu",
  "Kategória materiálu",
  "Brutto",
  "Tara",
  "Netto",
  "Jednotka",
  "Smer pohybu",
  "Stavba / miesto",
  "Zdrojové miesto",
  "Cieľové miesto",
  "Cesta dokumentu",
  "Rozpoznaný text",
  "Dátum vytvorenia záznamu",
] as const;

const HEADER_FILL = "1D4ED8";
const HEADER_TEXT = "FFFFFF";
const SECTION_FILL = "DBEAFE";
const BORDER_COLOR = "CBD5E1";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toFiniteNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();
    if (!normalizedValue) return null;

    const parsed = Number(
      normalizedValue.replace(/\s/g, "").replace(",", ".")
    );
    return Number.isFinite(parsed) ? parsed : null;
  }

  return Number.isFinite(value) ? value : null;
}

function getEffectiveNetto(record: AiEvidenceExcelRecord): number | null {
  return toFiniteNumber(record.netto) ?? toFiniteNumber(record.quantity);
}

function getMovementDirection(
  movementType: string | null
): "import" | "export" | null {
  const normalizedMovement = normalizeText(movementType);

  if (["dovoz", "import", "prijem", "inbound"].includes(normalizedMovement)) {
    return "import";
  }

  if (["vyvoz", "export", "odvoz", "outbound"].includes(normalizedMovement)) {
    return "export";
  }

  return null;
}

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDateTime(value: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLocalDateFilePart(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function getTons(
  netto: number | string | null,
  unit: string | null
): number | null {
  const numericNetto = toFiniteNumber(netto);
  if (numericNetto === null) return null;

  const normalizedUnit = normalizeText(unit).replace(/\./g, "");

  if (
    ["kg", "kilogram", "kilogramy", "kilogramov", "kilograms"].includes(
      normalizedUnit
    )
  ) {
    return numericNetto / 1000;
  }

  if (
    [
      "t",
      "tona",
      "tony",
      "ton",
      "tonach",
      "tons",
      "tonne",
      "tonnes",
    ].includes(normalizedUnit)
  ) {
    return numericNetto;
  }

  return null;
}

function addToGroup(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function styleHeaderRow(worksheet: Worksheet, rowNumber: number) {
  const row = worksheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: HEADER_TEXT } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 24;
}

function styleSectionTitle(worksheet: Worksheet, rowNumber: number) {
  const row = worksheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: "1E3A8A" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: SECTION_FILL },
  };
  row.height = 22;
}

function setAutomaticColumnWidths(
  worksheet: Worksheet,
  maximumWidths: readonly number[]
) {
  worksheet.columns.forEach((_column, index) => {
    const column = worksheet.getColumn(index + 1);
    let width = 10;

    column.eachCell({ includeEmpty: false }, (cell) => {
      const textLength = cell.text.length;
      width = Math.max(width, textLength + 2);
    });

    column.width = Math.min(width, maximumWidths[index] ?? 35);
  });
}

function addSummaryTable(
  worksheet: Worksheet,
  startRow: number,
  title: string,
  firstHeader: string,
  values: ReadonlyMap<string, number>
): number {
  worksheet.getCell(startRow, 1).value = title;
  worksheet.mergeCells(startRow, 1, startRow, 3);
  styleSectionTitle(worksheet, startRow);

  const headerRow = startRow + 1;
  worksheet.getRow(headerRow).values = [firstHeader, "Netto", "Jednotka"];
  styleHeaderRow(worksheet, headerRow);

  const sortedValues = [...values.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "sk")
  );

  sortedValues.forEach(([label, netto], index) => {
    const row = worksheet.getRow(headerRow + index + 1);
    row.values = [label, netto, "t"];
    row.getCell(2).numFmt = "#,##0.000";
  });

  if (sortedValues.length === 0) {
    worksheet.getCell(headerRow + 1, 1).value =
      "Žiadne platné netto v kg alebo t";
  }

  return headerRow + Math.max(sortedValues.length, 1) + 2;
}

function addUnknownUnitsTable(
  worksheet: Worksheet,
  startRow: number,
  values: ReadonlyMap<string, UnknownUnitSummary>
) {
  worksheet.getCell(startRow, 1).value =
    "Neznáme jednotky – nezahrnuté do súčtov v t";
  worksheet.mergeCells(startRow, 1, startRow, 3);
  styleSectionTitle(worksheet, startRow);

  const headerRow = startRow + 1;
  worksheet.getRow(headerRow).values = [
    "Pôvodná jednotka",
    "Počet záznamov",
    "Súčet netto v pôvodnej jednotke",
  ];
  styleHeaderRow(worksheet, headerRow);

  const sortedValues = [...values.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "sk")
  );

  sortedValues.forEach((summary, index) => {
    const row = worksheet.getRow(headerRow + index + 1);
    row.values = [summary.label, summary.count, summary.netto];
    row.getCell(2).numFmt = "#,##0";
    row.getCell(3).numFmt = "#,##0.000";
  });

  if (sortedValues.length === 0) {
    worksheet.getCell(headerRow + 1, 1).value = "Žiadne neznáme jednotky";
  }
}

function calculateVehicleNettoSummary(
  records: readonly AiEvidenceExcelRecord[]
): VehicleNettoSummary {
  const summary: VehicleNettoSummary = {
    totalImportTons: 0,
    totalExportTons: 0,
    totalTons: 0,
    unknownUnits: new Map<string, UnknownUnitSummary>(),
  };

  records.forEach((record) => {
    const effectiveNetto = getEffectiveNetto(record);
    if (effectiveNetto === null) return;

    const tons = getTons(effectiveNetto, record.unit);
    if (tons === null) {
      const unitLabel = record.unit?.trim() || "Bez jednotky";
      const unitKey = normalizeText(unitLabel) || "bez jednotky";
      const current = summary.unknownUnits.get(unitKey) ?? {
        label: unitLabel,
        count: 0,
        netto: 0,
      };

      current.count += 1;
      current.netto += effectiveNetto;
      summary.unknownUnits.set(unitKey, current);
      return;
    }

    summary.totalTons += tons;

    const direction = getMovementDirection(record.movement_type);
    if (direction === "import") {
      summary.totalImportTons += tons;
    } else if (direction === "export") {
      summary.totalExportTons += tons;
    }
  });

  return summary;
}

function addVehicleSummary(
  worksheet: Worksheet,
  startRow: number,
  records: readonly AiEvidenceExcelRecord[]
) {
  const summary = calculateVehicleNettoSummary(records);

  worksheet.getCell(startRow, 1).value = "Súhrn vozidla";
  worksheet.mergeCells(startRow, 1, startRow, 3);
  styleSectionTitle(worksheet, startRow);

  const summaryRows = [
    ["Celkový dovoz netto", summary.totalImportTons, "t"],
    ["Celkový vývoz netto", summary.totalExportTons, "t"],
    ["Celkové netto spolu", summary.totalTons, "t"],
  ] as const;

  summaryRows.forEach((values, index) => {
    const row = worksheet.getRow(startRow + index + 1);
    row.values = [...values];
    row.getCell(1).font = { bold: true };
    row.getCell(2).numFmt = "#,##0.000";
  });

  addUnknownUnitsTable(worksheet, startRow + 5, summary.unknownUnits);
}

function getSpzGroupName(record: AiEvidenceExcelRecord): string {
  return record.spz?.trim().toUpperCase() || "Bez ŠPZ";
}

function sanitizeWorksheetName(name: string): string {
  const sanitized = name
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (sanitized || "Bez ŠPZ").slice(0, 31);
}

function getUniqueWorksheetName(baseName: string, usedNames: Set<string>) {
  const sanitizedBase = sanitizeWorksheetName(baseName);
  let candidate = sanitizedBase;
  let suffixNumber = 2;

  while (usedNames.has(candidate.toLocaleLowerCase("sk"))) {
    const suffix = ` (${suffixNumber})`;
    candidate = `${sanitizedBase.slice(0, 31 - suffix.length)}${suffix}`;
    suffixNumber += 1;
  }

  usedNames.add(candidate.toLocaleLowerCase("sk"));
  return candidate;
}

function addDocumentSheet(
  workbook: Workbook,
  sheetName: string,
  records: readonly AiEvidenceExcelRecord[]
) {
  const detailSheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  detailSheet.addRow([...DETAIL_HEADERS]);
  styleHeaderRow(detailSheet, 1);
  detailSheet.autoFilter = "A1:T1";

  records.forEach((record) => {
    const row = detailSheet.addRow([
      record.document_type,
      parseDateOnly(record.document_date),
      record.document_number,
      record.spz,
      record.supplier,
      record.customer,
      record.material,
      record.material_original,
      record.material_category,
      toFiniteNumber(record.brutto),
      toFiniteNumber(record.tara),
      getEffectiveNetto(record),
      record.unit,
      record.movement_type,
      record.construction_site,
      record.source_location,
      record.destination_location,
      record.photo_url,
      record.raw_text,
      parseDateTime(record.created_at),
    ]);

    row.alignment = { vertical: "top" };
    row.getCell(2).numFmt = "dd.mm.yyyy";
    row.getCell(10).numFmt = "#,##0.000";
    row.getCell(11).numFmt = "#,##0.000";
    row.getCell(12).numFmt = "#,##0.000";
    row.getCell(19).alignment = { vertical: "top", wrapText: true };
    row.getCell(20).numFmt = "dd.mm.yyyy hh:mm";
  });

  detailSheet.getColumn(2).numFmt = "dd.mm.yyyy";
  detailSheet.getColumn(19).alignment = { vertical: "top", wrapText: true };
  detailSheet.getColumn(20).numFmt = "dd.mm.yyyy hh:mm";
  addVehicleSummary(detailSheet, detailSheet.rowCount + 2, records);
  setAutomaticColumnWidths(detailSheet, [
    30, 16, 20, 14, 30, 30, 30, 34, 24, 16, 16, 16, 14, 18, 30, 30, 30,
    45, 60, 24,
  ]);

  detailSheet.getRow(1).eachCell((cell) => {
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });
}

export async function exportAiEvidenceToExcel(
  records: readonly AiEvidenceExcelRecord[]
): Promise<ExportResult> {
  if (records.length === 0) {
    throw new Error("Nie sú dostupné žiadne dokumenty na export.");
  }

  const excelJsModule = await import("exceljs");
  const ExcelJS = excelJsModule.default ?? excelJsModule;
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();

  workbook.creator = "Esblu";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const nettoByMaterial = new Map<string, number>();
  const nettoBySpz = new Map<string, number>();
  const unknownUnits = new Map<string, UnknownUnitSummary>();
  let totalNettoTons = 0;

  records.forEach((record) => {
    const effectiveNetto = getEffectiveNetto(record);
    if (effectiveNetto === null) return;

    const tons = getTons(effectiveNetto, record.unit);
    if (tons !== null) {
      const material =
        record.material?.trim() ||
        record.material_original?.trim() ||
        "Bez materiálu";
      const spz = getSpzGroupName(record);

      totalNettoTons += tons;
      addToGroup(nettoByMaterial, material, tons);
      addToGroup(nettoBySpz, spz, tons);
      return;
    }

    const unitLabel = record.unit?.trim() || "Bez jednotky";
    const unitKey = normalizeText(unitLabel) || "bez jednotky";
    const current = unknownUnits.get(unitKey) ?? {
      label: unitLabel,
      count: 0,
      netto: 0,
    };

    current.count += 1;
    current.netto += effectiveNetto;
    unknownUnits.set(unitKey, current);
  });

  const summarySheet = workbook.addWorksheet("Súhrn", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  summarySheet.mergeCells("A1:C1");
  summarySheet.getCell("A1").value = "Súhrn AI evidencie";
  styleHeaderRow(summarySheet, 1);
  summarySheet.getCell("A3").value = "Počet exportovaných dokumentov";
  summarySheet.getCell("B3").value = records.length;
  summarySheet.getCell("B3").numFmt = "#,##0";
  summarySheet.getCell("A4").value = "Celkové netto";
  summarySheet.getCell("B4").value = totalNettoTons;
  summarySheet.getCell("B4").numFmt = "#,##0.000";
  summarySheet.getCell("C4").value = "t";
  summarySheet.getCell("A5").value =
    "Netto používa hodnotu netto, inak quantity; hodnoty v kg sú prepočítané na t a neznáme jednotky nie sú započítané.";
  summarySheet.mergeCells("A5:C5");
  summarySheet.getCell("A5").font = { italic: true, color: { argb: "475569" } };
  summarySheet.getCell("A5").alignment = { wrapText: true };

  let nextRow = addSummaryTable(
    summarySheet,
    7,
    "Netto podľa materiálu",
    "Materiál",
    nettoByMaterial
  );
  nextRow = addSummaryTable(
    summarySheet,
    nextRow,
    "Netto podľa ŠPZ",
    "ŠPZ",
    nettoBySpz
  );
  addUnknownUnitsTable(summarySheet, nextRow, unknownUnits);

  summarySheet.getColumn(1).alignment = { vertical: "top", wrapText: true };
  summarySheet.getColumn(2).alignment = {
    vertical: "top",
    horizontal: "right",
  };
  summarySheet.getColumn(3).alignment = { vertical: "top" };
  setAutomaticColumnWidths(summarySheet, [48, 24, 34]);

  const recordsBySpz = new Map<string, AiEvidenceExcelRecord[]>();
  records.forEach((record) => {
    const spz = getSpzGroupName(record);
    const group = recordsBySpz.get(spz) ?? [];
    group.push(record);
    recordsBySpz.set(spz, group);
  });

  const usedSheetNames = new Set(["súhrn"]);
  [...recordsBySpz.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "sk"))
    .forEach(([spz, group]) => {
      const sheetName = getUniqueWorksheetName(spz, usedSheetNames);
      addDocumentSheet(workbook, sheetName, group);
    });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fileName = `ai-evidencia_${getLocalDateFilePart(generatedAt)}.xlsx`;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  return { exportedCount: records.length, fileName };
}
