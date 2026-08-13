import type { Workbook, Worksheet } from "exceljs";

// -----------------------------------------------------------------------------
// Dátový export pre zložky "Bločky" a "Faktúry" v AI Evidencii (public.documents
// s document_type 'receipt' / 'invoice'). Zámerne samostatný, jednoduchší
// súbor od lib/export-ai-evidence-excel.ts (ten exportuje ai_evidence — vážne
// lístky/dodacie listy so súhrnmi po ŠPZ, čo tu nedáva zmysel).
// -----------------------------------------------------------------------------

export type AiInboxFolderKind = "receipt" | "invoice";

export type AiInboxDocumentExcelRecord = {
  id: string;
  created_at: string | null;
  note: string | null;
  extracted_fields: Record<string, unknown> | null;
};

type ExportResult = {
  exportedCount: number;
  fileName: string;
};

const HEADER_FILL = "1D4ED8";
const HEADER_TEXT = "FFFFFF";
const BORDER_COLOR = "CBD5E1";

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

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string") return null;

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

function toAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function getLocalDateFilePart(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

const RECEIPT_HEADERS = [
  "Dátum",
  "Obchodník",
  "Suma",
  "Mena",
  "Spôsob platby",
  "Kategória",
  "Poznámka",
  "Dátum vytvorenia záznamu",
] as const;

const INVOICE_HEADERS = [
  "Dátum vystavenia",
  "Dodávateľ",
  "Číslo faktúry",
  "Suma",
  "Mena",
  "DPH",
  "Dátum splatnosti",
  "Zákazník",
  "Variabilný symbol",
  "Popis",
  "Poznámka",
  "Dátum vytvorenia záznamu",
] as const;

function addReceiptRows(
  worksheet: Worksheet,
  records: readonly AiInboxDocumentExcelRecord[]
) {
  records.forEach((record) => {
    const fields = record.extracted_fields || {};
    const row = worksheet.addRow([
      parseDateOnly(fields.purchaseDate),
      textField(fields.merchant),
      toAmount(fields.totalAmount),
      textField(fields.currency),
      textField(fields.paymentMethod),
      textField(fields.category),
      textField(record.note),
      parseDateTime(record.created_at),
    ]);

    row.alignment = { vertical: "top" };
    row.getCell(1).numFmt = "dd.mm.yyyy";
    row.getCell(3).numFmt = "#,##0.00";
    row.getCell(7).alignment = { vertical: "top", wrapText: true };
    row.getCell(8).numFmt = "dd.mm.yyyy hh:mm";
  });
}

function addInvoiceRows(
  worksheet: Worksheet,
  records: readonly AiInboxDocumentExcelRecord[]
) {
  records.forEach((record) => {
    const fields = record.extracted_fields || {};
    const row = worksheet.addRow([
      parseDateOnly(fields.issueDate),
      textField(fields.supplier),
      textField(fields.invoiceNumber),
      toAmount(fields.totalAmount),
      textField(fields.currency),
      toAmount(fields.vatAmount),
      parseDateOnly(fields.dueDate),
      textField(fields.customer),
      textField(fields.variableSymbol),
      textField(fields.description),
      textField(record.note),
      parseDateTime(record.created_at),
    ]);

    row.alignment = { vertical: "top" };
    row.getCell(1).numFmt = "dd.mm.yyyy";
    row.getCell(4).numFmt = "#,##0.00";
    row.getCell(6).numFmt = "#,##0.00";
    row.getCell(7).numFmt = "dd.mm.yyyy";
    row.getCell(10).alignment = { vertical: "top", wrapText: true };
    row.getCell(11).alignment = { vertical: "top", wrapText: true };
    row.getCell(12).numFmt = "dd.mm.yyyy hh:mm";
  });
}

export async function exportAiInboxFolderToExcel(
  kind: AiInboxFolderKind,
  records: readonly AiInboxDocumentExcelRecord[]
): Promise<ExportResult> {
  if (records.length === 0) {
    throw new Error("Nie sú dostupné žiadne dokumenty na export.");
  }

  const excelJsModule = await import("exceljs");
  const ExcelJS = excelJsModule.default ?? excelJsModule;
  const workbook: Workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();

  workbook.creator = "Esblu";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const sheetName = kind === "receipt" ? "Bločky" : "Faktúry";
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = kind === "receipt" ? RECEIPT_HEADERS : INVOICE_HEADERS;
  worksheet.addRow([...headers]);
  styleHeaderRow(worksheet, 1);
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  if (kind === "receipt") {
    addReceiptRows(worksheet, records);
  } else {
    addInvoiceRows(worksheet, records);
  }

  setAutomaticColumnWidths(
    worksheet,
    kind === "receipt"
      ? [16, 30, 14, 10, 20, 22, 45, 22]
      : [16, 30, 20, 14, 10, 12, 16, 30, 20, 40, 45, 22]
  );

  worksheet.getRow(1).eachCell((cell) => {
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filePrefix = kind === "receipt" ? "blocky" : "faktury";
  const fileName = `${filePrefix}_${getLocalDateFilePart(generatedAt)}.xlsx`;
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
