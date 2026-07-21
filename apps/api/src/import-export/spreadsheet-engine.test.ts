import type { ExportMappingItem, ImportMappingItem } from "@plm/contracts";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  SpreadsheetValidationError,
  applyImportMappings,
  detectFileFormat,
  inspectSpreadsheet,
  renderExport,
} from "./spreadsheet-engine";

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Products");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

describe("spreadsheet import and export engine", () => {
  it("detects, previews, and suggests mappings for XLSX", () => {
    const buffer = workbookBuffer([
      ["Nume produs", "SKU", "Pret", "Stoc"],
      ["Șampon Aline", "AL-001", 49.9, 10],
    ]);
    expect(detectFileFormat("products.xlsx", "application/octet-stream", buffer)).toBe("XLSX");
    const inspected = inspectSpreadsheet(buffer, "XLSX");
    expect(inspected.rowCount).toBe(1);
    expect(inspected.headers).toEqual(["Nume produs", "SKU", "Pret", "Stoc"]);
    expect(inspected.suggestedMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceColumn: "Nume produs", destinationField: "product.publicName" }),
      expect.objectContaining({ sourceColumn: "SKU", destinationField: "variant.sku" }),
    ]));
  });

  it("rejects formula cells without evaluating them", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["SKU", "Price"], ["AL-001", 2]]);
    sheet.B2 = { t: "n", f: "1+1", v: 2 };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Products");
    const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    expect(() => inspectSpreadsheet(buffer, "XLSX")).toThrow(SpreadsheetValidationError);
    expect(() => inspectSpreadsheet(buffer, "XLSX")).toThrow("Formula cell B2 is not accepted");
  });

  it("maps typed values and reports invalid numeric formats", () => {
    const mappings: ImportMappingItem[] = [
      { sourceColumn: "SKU", destinationField: "variant.sku", required: true, transformation: "UPPERCASE" },
      { sourceColumn: "Price", destinationField: "variant.basePrice", required: true, transformation: "DECIMAL" },
    ];
    expect(applyImportMappings({ SKU: " al-1 ", Price: "12,50" }, mappings, {})).toEqual({
      normalized: { "variant.sku": "AL-1", "variant.basePrice": "12.50" },
      issues: [],
    });
    expect(applyImportMappings({ SKU: "AL-1", Price: "invalid" }, mappings, {}).issues[0]).toMatchObject({
      code: "IMPORT_VALUE_FORMAT_INVALID",
      severity: "BLOCKING_ERROR",
    });
  });

  it("renders mapped CSV and neutralizes spreadsheet formula injection", () => {
    const mappings: ExportMappingItem[] = [
      { sourceField: "variant.sku", destinationColumn: "SKU", required: true, transformation: "NONE" },
      { sourceField: "product.publicName", destinationColumn: "Name", required: true, transformation: "NONE" },
    ];
    const output = renderExport([
      { variant: { sku: "AL-1" }, product: { publicName: "=HYPERLINK(\"bad\")" } },
    ], mappings, "CSV").toString("utf8");
    expect(output).toContain("'=HYPERLINK");
  });
});
