import type { ExportMappingItem, ImportMappingItem } from "@plm/contracts";
import * as XLSX from "xlsx";

export type ImportIssue = {
  code: string;
  severity: "WARNING" | "BLOCKING_ERROR";
  field?: string;
  message: string;
  suggestedResolution: string;
};

export class SpreadsheetValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const destinationAliases: Record<string, string[]> = {
  "product.publicName": ["product name", "name", "denumire", "nume produs", "titlu"],
  "product.internalName": ["internal name", "nume intern", "internal product name"],
  "product.description": ["description", "descriere", "long description"],
  "product.status": ["product status", "status produs", "status"],
  "product.defaultVatRate": ["vat", "vat rate", "tva", "cota tva"],
  "brand.name": ["brand", "marca"],
  "category.name": ["category", "categorie"],
  "variant.sku": ["sku", "cod produs", "cod intern", "seller sku"],
  "variant.internalNumericId": ["internal id", "product id", "id intern", "id produs"],
  "variant.gtin": ["ean", "gtin", "barcode", "cod ean"],
  "variant.basePrice": ["price", "pret", "sale price", "pret vanzare"],
  "variant.currency": ["currency", "moneda"],
  "variant.status": ["variant status", "status varianta"],
  "stock.onHand": ["stock", "stoc", "quantity", "cantitate"],
  "stock.warehouseCode": ["warehouse", "warehouse code", "depozit", "cod depozit"],
  "images.urls": ["images", "image urls", "imagini", "url imagini"],
};

export function detectFileFormat(fileName: string, mimeType: string, buffer: Buffer) {
  const extension = fileName.toLowerCase().split(".").at(-1);
  if (extension === "csv") return "CSV" as const;
  if (extension === "xlsx" && buffer[0] === 0x50 && buffer[1] === 0x4b) return "XLSX" as const;
  if (
    extension === "xls" &&
    buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  ) return "XLS" as const;
  throw new SpreadsheetValidationError(
    "IMPORT_FILE_TYPE_INVALID",
    `Unsupported or mismatched spreadsheet type (${mimeType || "unknown"})`,
  );
}

export function inspectSpreadsheet(
  buffer: Buffer,
  format: "XLS" | "XLSX" | "CSV",
  requestedSheet?: string,
  headerRow = 1,
) {
  if (buffer.byteLength > 25 * 1024 * 1024) {
    throw new SpreadsheetValidationError("IMPORT_FILE_TOO_LARGE", "Import files may not exceed 25 MB");
  }
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: true,
    cellFormula: true,
    cellDates: true,
    bookVBA: true,
    dense: false,
    codepage: format === "CSV" ? 65001 : undefined,
  });
  if (workbook.vbaraw) {
    throw new SpreadsheetValidationError("IMPORT_MACROS_UNSUPPORTED", "Macro-enabled workbooks are not accepted");
  }
  if (!workbook.SheetNames.length) {
    throw new SpreadsheetValidationError("IMPORT_WORKBOOK_EMPTY", "The workbook does not contain a sheet");
  }
  for (const sheetName of workbook.SheetNames) assertSafeSheet(workbook.Sheets[sheetName]);

  const sheetName = requestedSheet ?? workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new SpreadsheetValidationError("IMPORT_SHEET_NOT_FOUND", "The selected worksheet does not exist");
  }
  if (!Number.isSafeInteger(headerRow) || headerRow < 1 || headerRow > 1_000) {
    throw new SpreadsheetValidationError("IMPORT_HEADER_ROW_INVALID", "Header row must be between 1 and 1,000");
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  const rawHeaders = matrix[headerRow - 1] ?? [];
  const lastHeaderIndex = rawHeaders.reduce<number>(
    (last, value, index) => (value === null || value === undefined || String(value).trim() === "" ? last : index),
    -1,
  );
  if (lastHeaderIndex < 0) {
    throw new SpreadsheetValidationError("IMPORT_HEADERS_EMPTY", "The selected header row is empty");
  }
  const headers = rawHeaders.slice(0, lastHeaderIndex + 1).map((value) => String(value ?? "").trim());
  const emptyHeaders = headers.flatMap((header, index) => header ? [] : [index + 1]);
  if (emptyHeaders.length) {
    throw new SpreadsheetValidationError(
      "IMPORT_HEADER_NAME_EMPTY",
      "Every used column must have a header name",
      { columns: emptyHeaders },
    );
  }
  const normalizedHeaders = headers.map(normalizeHeader);
  const duplicates = normalizedHeaders.filter((header, index) => normalizedHeaders.indexOf(header) !== index);
  if (duplicates.length) {
    throw new SpreadsheetValidationError(
      "IMPORT_HEADERS_DUPLICATE",
      "Header names must be unique",
      { headers: [...new Set(duplicates)] },
    );
  }

  const rows = matrix.slice(headerRow).filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""));
  if (rows.length > 50_000) {
    throw new SpreadsheetValidationError("IMPORT_ROW_LIMIT_EXCEEDED", "A single import may contain at most 50,000 rows");
  }
  const records = rows.map((row, index) => ({
    rowNumber: headerRow + index + 1,
    values: Object.fromEntries(headers.map((header, columnIndex) => [header, safeCellValue(row[columnIndex])])),
  }));
  return {
    sheetNames: workbook.SheetNames,
    sheetName,
    headerRow,
    headers,
    rowCount: records.length,
    rows: records,
    previewRows: records.slice(0, 20),
    suggestedMappings: suggestMappings(headers),
  };
}

export function suggestMappings(headers: string[]): ImportMappingItem[] {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mappings: ImportMappingItem[] = [];
  for (const [destinationField, aliases] of Object.entries(destinationAliases)) {
    const sourceColumn = aliases.map((alias) => normalized.get(normalizeHeader(alias))).find(Boolean);
    if (!sourceColumn) continue;
    mappings.push({
      sourceColumn,
      destinationField,
      required: new Set(["product.publicName", "variant.sku"]).has(destinationField),
      transformation: "TRIM",
    } as ImportMappingItem);
  }
  return mappings;
}

export function applyImportMappings(
  source: Record<string, unknown>,
  mappings: ImportMappingItem[],
  defaults: Record<string, unknown>,
) {
  const normalized: Record<string, unknown> = { ...defaults };
  const issues: ImportIssue[] = [];
  for (const mapping of mappings) {
    const raw = source[mapping.sourceColumn];
    const selected = raw === null || raw === undefined || raw === "" ? mapping.defaultValue : raw;
    if ((selected === null || selected === undefined || selected === "") && mapping.required) {
      issues.push({
        code: "IMPORT_REQUIRED_VALUE_MISSING",
        severity: "BLOCKING_ERROR",
        field: mapping.destinationField,
        message: `Required source value '${mapping.sourceColumn}' is empty`,
        suggestedResolution: `Complete '${mapping.sourceColumn}' or configure a default value`,
      });
      continue;
    }
    if (selected === null || selected === undefined || selected === "") continue;
    try {
      normalized[mapping.destinationField] = transformImportValue(selected, mapping.transformation);
    } catch (error: unknown) {
      issues.push({
        code: "IMPORT_VALUE_FORMAT_INVALID",
        severity: "BLOCKING_ERROR",
        field: mapping.destinationField,
        message: error instanceof Error ? error.message : "Value format is invalid",
        suggestedResolution: `Correct '${mapping.sourceColumn}' or select a different transformation`,
      });
    }
  }
  return { normalized, issues };
}

export function renderExport(
  records: Record<string, unknown>[],
  mappings: ExportMappingItem[],
  format: "CSV" | "XLSX",
) {
  const rows = records.map((record) => Object.fromEntries(mappings.map((mapping) => {
    const sourceFields = mapping.concatenate?.length ? mapping.concatenate : [mapping.sourceField];
    const sourceValues = sourceFields.map((field) => getPath(record, field)).filter((value) => value !== undefined && value !== null && value !== "");
    let value: unknown = mapping.concatenate?.length ? sourceValues.join(" ") : sourceValues[0];
    if (value === undefined || value === null || value === "") value = mapping.defaultValue ?? "";
    if (mapping.enumerationMapping && typeof value === "string") value = mapping.enumerationMapping[value] ?? value;
    if (mapping.unitConversion && (typeof value === "number" || !Number.isNaN(Number(value)))) {
      value = Number(value) * mapping.unitConversion.factor;
    }
    value = transformExportValue(value, mapping.transformation);
    if (mapping.required && (value === "" || value === null || value === undefined)) {
      throw new SpreadsheetValidationError(
        "EXPORT_REQUIRED_VALUE_MISSING",
        `Required export column '${mapping.destinationColumn}' is empty`,
      );
    }
    return [mapping.destinationColumn, safeExportCell(value)];
  })));
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: mappings.map((mapping) => mapping.destinationColumn) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
  return Buffer.from(XLSX.write(workbook, {
    type: "buffer",
    bookType: format === "CSV" ? "csv" : "xlsx",
  }));
}

function assertSafeSheet(sheet: XLSX.WorkSheet | undefined) {
  if (!sheet) return;
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    const value = cell as XLSX.CellObject;
    if (value.f) {
      throw new SpreadsheetValidationError(
        "IMPORT_FORMULA_UNSUPPORTED",
        `Formula cell ${address} is not accepted`,
        { cell: address },
      );
    }
  }
}

function safeCellValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && /^\s*[=+@]/.test(value)) {
    throw new SpreadsheetValidationError(
      "IMPORT_FORMULA_TEXT_UNSUPPORTED",
      "Formula-like text values are not accepted",
    );
  }
  return value;
}

function transformImportValue(value: unknown, transformation: ImportMappingItem["transformation"]) {
  switch (transformation) {
    case "NONE": return value;
    case "TRIM": return typeof value === "string" ? value.trim() : value;
    case "UPPERCASE": return String(value).trim().toUpperCase();
    case "LOWERCASE": return String(value).trim().toLowerCase();
    case "DECIMAL": {
      const parsed = Number(String(value).replace(",", "."));
      if (!Number.isFinite(parsed)) throw new Error(`'${String(value)}' is not a decimal number`);
      return parsed.toFixed(2);
    }
    case "INTEGER": {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) throw new Error(`'${String(value)}' is not an integer`);
      return parsed;
    }
    case "BOOLEAN": {
      const normalized = String(value).trim().toLowerCase();
      if (["true", "yes", "da", "1"].includes(normalized)) return true;
      if (["false", "no", "nu", "0"].includes(normalized)) return false;
      throw new Error(`'${String(value)}' is not a boolean value`);
    }
    case "SPLIT_COMMA": return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function transformExportValue(value: unknown, transformation: ExportMappingItem["transformation"]) {
  switch (transformation) {
    case "NONE": return value;
    case "TRIM": return typeof value === "string" ? value.trim() : value;
    case "UPPERCASE": return String(value).toUpperCase();
    case "LOWERCASE": return String(value).toLowerCase();
    case "DECIMAL_2": return value === "" ? "" : Number(value).toFixed(2);
    case "BOOLEAN_YES_NO": return Boolean(value) ? "Yes" : "No";
    case "JOIN_COMMA": return Array.isArray(value) ? value.join(", ") : value;
  }
}

function getPath(record: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, record);
}

function safeExportCell(value: unknown) {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
