import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FileFormat, GtinType, ImportRowStatus, Prisma, ProductStatus } from "@prisma/client";
import {
  configureImportSchema,
  gtinTypeFor,
  importMappingItemSchema,
  isValidGtin,
  type ConfigureImportInput,
  type CreateImportMappingTemplateInput,
  type ExecuteImportInput,
  type ExportMappingItem,
  type ImportMappingItem,
} from "@plm/contracts";
import { createHash, randomUUID } from "node:crypto";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { AttributeValueValidator } from "../catalog/attribute-value.validator";
import { ObjectStorageService } from "../catalog/object-storage.service";
import { sanitizeRichText, slugify } from "../catalog/catalog.utils";
import { InventoryService } from "../inventory/inventory.service";
import { BackgroundJobsService } from "../jobs/background-jobs.service";
import {
  SpreadsheetValidationError,
  applyImportMappings,
  detectFileFormat,
  inspectSpreadsheet,
  renderExport,
  type ImportIssue,
} from "./spreadsheet-engine";

type NormalizedRow = Record<string, unknown>;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly inventory: InventoryService,
    private readonly attributeValidator: AttributeValueValidator,
    private readonly jobs: BackgroundJobsService,
  ) {}

  list(auth: RequestAuth) {
    return this.prisma.importJob.findMany({
      where: { companyId: auth.companyId },
      take: 100,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        originalFileName: true,
        format: true,
        sheetName: true,
        rowCount: true,
        processedRows: true,
        successfulRows: true,
        failedRows: true,
        warningRows: true,
        validationSummary: true,
        reportUrl: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  async get(auth: RequestAuth, id: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id, companyId: auth.companyId },
      include: {
        mappingTemplate: true,
        rows: { take: 100, orderBy: { rowNumber: "asc" } },
      },
    });
    if (!job) throw this.notFound();
    return job;
  }

  listMappings(auth: RequestAuth) {
    return this.prisma.importMappingTemplate.findMany({
      where: { companyId: auth.companyId, isActive: true },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
  }

  async createMapping(auth: RequestAuth, input: CreateImportMappingTemplateInput) {
    try {
      const template = await this.prisma.importMappingTemplate.create({
        data: {
          companyId: auth.companyId,
          name: input.name,
          description: input.description,
          format: input.format as FileFormat | undefined,
          sheetName: input.sheetName,
          headerRow: input.headerRow,
          mappings: input.mappings as Prisma.InputJsonValue,
          defaults: input.defaults as Prisma.InputJsonValue,
          createdById: auth.userId,
        },
      });
      await this.audit(auth, "import_mapping.created", "ImportMappingTemplate", template.id, {
        name: template.name,
        format: template.format,
      });
      return template;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "IMPORT_MAPPING_NAME_EXISTS", message: "An import mapping with this name already exists" });
      }
      throw error;
    }
  }

  async upload(auth: RequestAuth, file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: "IMPORT_FILE_REQUIRED", message: "Select an import file" });
    let format: "XLS" | "XLSX" | "CSV";
    let inspected: ReturnType<typeof inspectSpreadsheet>;
    try {
      format = detectFileFormat(file.originalname, file.mimetype, file.buffer);
      inspected = inspectSpreadsheet(file.buffer, format);
    } catch (error: unknown) {
      throw this.spreadsheetError(error);
    }
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const extension = format.toLowerCase();
    const objectKey = `private/imports/${auth.companyId}/${randomUUID()}/source.${extension}`;
    try {
      await this.storage.put({
        key: objectKey,
        body: file.buffer,
        contentType: file.mimetype || "application/octet-stream",
        cacheControl: "private, no-store",
      });
      const job = await this.prisma.importJob.create({
        data: {
          companyId: auth.companyId,
          status: "UPLOADED",
          format: format as FileFormat,
          originalFileName: file.originalname,
          mimeType: file.mimetype || "application/octet-stream",
          sizeBytes: file.size,
          sha256,
          objectKey,
          sheetName: inspected.sheetName,
          headerRow: inspected.headerRow,
          detectedSheets: inspected.sheetNames,
          detectedHeaders: inspected.headers,
          previewRows: inspected.previewRows as unknown as Prisma.InputJsonValue,
          mappingSnapshot: inspected.suggestedMappings as Prisma.InputJsonValue,
          rowCount: inspected.rowCount,
          createdById: auth.userId,
        },
      });
      await this.audit(auth, "import.uploaded", "ImportJob", job.id, {
        fileName: file.originalname,
        format,
        rowCount: inspected.rowCount,
        sheetNames: inspected.sheetNames,
      });
      return job;
    } catch (error: unknown) {
      await this.storage.delete([objectKey]);
      throw error;
    }
  }

  async configure(auth: RequestAuth, id: string, input: ConfigureImportInput) {
    const job = await this.job(auth, id);
    if (new Set(["RUNNING", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "CANCELLED"]).has(job.status)) {
      throw new ConflictException({ code: "IMPORT_JOB_IMMUTABLE", message: "This import can no longer be reconfigured" });
    }
    if (input.mappingTemplateId) {
      const template = await this.prisma.importMappingTemplate.count({
        where: { id: input.mappingTemplateId, companyId: auth.companyId, isActive: true },
      });
      if (!template) throw new NotFoundException({ code: "IMPORT_MAPPING_NOT_FOUND", message: "Import mapping not found" });
    }
    const file = await this.storage.read(job.objectKey);
    let inspected: ReturnType<typeof inspectSpreadsheet>;
    try {
      inspected = inspectSpreadsheet(file, job.format, input.sheetName, input.headerRow);
    } catch (error: unknown) {
      throw this.spreadsheetError(error);
    }
    const missingColumns = input.mappings
      .map((mapping) => mapping.sourceColumn)
      .filter((column) => !inspected.headers.includes(column));
    if (missingColumns.length) {
      throw new BadRequestException({
        code: "IMPORT_MAPPING_SOURCE_MISSING",
        message: "One or more mapped source columns are absent",
        columns: [...new Set(missingColumns)],
      });
    }
    await this.assertAttributeMappings(auth.companyId, input.mappings);
    return this.prisma.importJob.update({
      where: { id },
      data: {
        status: "MAPPING",
        mappingTemplateId: input.mappingTemplateId,
        sheetName: inspected.sheetName,
        headerRow: inspected.headerRow,
        detectedHeaders: inspected.headers,
        previewRows: inspected.previewRows as unknown as Prisma.InputJsonValue,
        mappingSnapshot: input.mappings as Prisma.InputJsonValue,
        defaultsSnapshot: input.defaults as Prisma.InputJsonValue,
        rowCount: inspected.rowCount,
        validationSummary: {},
      },
    });
  }

  async validate(auth: RequestAuth, id: string) {
    const job = await this.job(auth, id);
    if (!job.sheetName) throw new BadRequestException({ code: "IMPORT_NOT_CONFIGURED", message: "Select a worksheet and mapping first" });
    const mappings = importMappingItemSchema.array().parse(job.mappingSnapshot) as ImportMappingItem[];
    if (!mappings.length) throw new BadRequestException({ code: "IMPORT_MAPPING_REQUIRED", message: "Configure at least one column mapping" });
    const defaults = this.jsonRecord(job.defaultsSnapshot);
    const file = await this.storage.read(job.objectKey);
    let inspected: ReturnType<typeof inspectSpreadsheet>;
    try {
      inspected = inspectSpreadsheet(file, job.format, job.sheetName, job.headerRow);
    } catch (error: unknown) {
      throw this.spreadsheetError(error);
    }
    await this.assertAttributeMappings(auth.companyId, mappings);
    const mapped = inspected.rows.map((row) => ({
      rowNumber: row.rowNumber,
      source: row.values,
      ...applyImportMappings(row.values, mappings, defaults),
    }));
    const skuCounts = this.valueCounts(mapped, "variant.sku", (value) => String(value).trim().toUpperCase());
    const gtinCounts = this.valueCounts(mapped, "variant.gtin", (value) => String(value).trim());
    const skus = [...skuCounts.keys()];
    const gtins = [...gtinCounts.keys()];
    const existingVariants = await this.prisma.productVariant.findMany({
      where: {
        companyId: auth.companyId,
        deletedAt: null,
        OR: [
          ...(skus.length ? [{ sku: { in: skus } }] : []),
          ...(gtins.length ? [{ gtin: { in: gtins } }] : []),
        ],
      },
      select: { id: true, sku: true, gtin: true },
    });
    const existingBySku = new Map(existingVariants.map((variant) => [variant.sku.toUpperCase(), variant]));
    const existingByGtin = new Map(existingVariants.filter((variant) => variant.gtin).map((variant) => [variant.gtin as string, variant]));
    const warehouseCodes = new Set(
      (await this.prisma.warehouse.findMany({ where: { companyId: auth.companyId, isActive: true }, select: { code: true } }))
        .map((warehouse) => warehouse.code.toUpperCase()),
    );

    const rows = mapped.map((row) => {
      const issues = [...row.issues, ...this.validateBusinessRow(row.normalized, warehouseCodes)];
      const sku = this.text(row.normalized["variant.sku"])?.toUpperCase();
      const gtin = this.text(row.normalized["variant.gtin"]);
      if (sku && (skuCounts.get(sku) ?? 0) > 1) issues.push(this.blocking("IMPORT_DUPLICATE_SKU_FILE", "variant.sku", "SKU appears more than once in the import file", "Keep one row per SKU"));
      if (gtin && (gtinCounts.get(gtin) ?? 0) > 1) issues.push(this.blocking("IMPORT_DUPLICATE_GTIN_FILE", "variant.gtin", "GTIN appears more than once in the import file", "Keep one row per GTIN"));
      if (sku && existingBySku.has(sku)) issues.push(this.warning("IMPORT_SKU_ALREADY_EXISTS", "variant.sku", "SKU already exists in the catalog", "Use UPSERT_BY_SKU to update it or choose a new SKU"));
      if (gtin && existingByGtin.has(gtin) && existingByGtin.get(gtin)?.sku.toUpperCase() !== sku) {
        issues.push(this.blocking("IMPORT_GTIN_ALREADY_EXISTS", "variant.gtin", "GTIN belongs to another variant", "Remove or correct the duplicate GTIN"));
      }
      const status: ImportRowStatus = issues.some((issue) => issue.severity === "BLOCKING_ERROR")
        ? "BLOCKED"
        : issues.length
          ? "WARNING"
          : "VALID";
      return { rowNumber: row.rowNumber, status, sourceData: row.source, normalizedData: row.normalized, issues };
    });

    await this.prisma.$transaction(async (transaction) => {
      await transaction.importRowResult.deleteMany({ where: { importJobId: id } });
      for (let index = 0; index < rows.length; index += 500) {
        const batch = rows.slice(index, index + 500);
        await transaction.importRowResult.createMany({
          data: batch.map((row) => ({
            importJobId: id,
            rowNumber: row.rowNumber,
            status: row.status,
            sourceData: row.sourceData as Prisma.InputJsonValue,
            normalizedData: row.normalizedData as Prisma.InputJsonValue,
            issues: row.issues as unknown as Prisma.InputJsonValue,
          })),
        });
      }
      const blocked = rows.filter((row) => row.status === "BLOCKED").length;
      const warnings = rows.filter((row) => row.status === "WARNING").length;
      await transaction.importJob.update({
        where: { id },
        data: {
          status: "VALIDATED",
          rowCount: rows.length,
          failedRows: blocked,
          warningRows: warnings,
          validationSummary: {
            rows: rows.length,
            valid: rows.length - blocked,
            blocked,
            warnings,
            canExecute: rows.length > blocked,
          },
        },
      });
    });
    return this.get(auth, id);
  }

  async execute(auth: RequestAuth, id: string, input: ExecuteImportInput) {
    const job = await this.job(auth, id);
    if (!["VALIDATED", "QUEUED"].includes(job.status)) {
      throw new ConflictException({ code: "IMPORT_NOT_VALIDATED", message: "Validate the import before execution" });
    }
    const rows = await this.prisma.importRowResult.findMany({
      where: { importJobId: id, status: { in: ["VALID", "WARNING"] } },
      orderBy: { rowNumber: "asc" },
    });
    const blockedRows = await this.prisma.importRowResult.count({
      where: { importJobId: id, status: "BLOCKED" },
    });
    if (!rows.length) throw new BadRequestException({ code: "IMPORT_NO_VALID_ROWS", message: "There are no valid rows to import" });
    await this.prisma.importJob.update({ where: { id }, data: { status: "RUNNING", startedAt: new Date(), processedRows: 0, successfulRows: 0 } });
    let nextNumericId = (await this.prisma.productVariant.aggregate({
      where: { companyId: auth.companyId },
      _max: { internalNumericId: true },
    }))._max.internalNumericId ?? 0;
    let successful = 0;
    let failed = blockedRows;
    for (const row of rows) {
      try {
        const normalized = this.jsonRecord(row.normalizedData);
        const numeric = this.integer(normalized["variant.internalNumericId"]);
        if (!numeric) nextNumericId += 1;
        const imported = await this.importRow(auth, job.id, row.rowNumber, normalized, input.mode, numeric ?? nextNumericId);
        await this.prisma.importRowResult.update({
          where: { id: row.id },
          data: { status: "IMPORTED", productId: imported.productId, variantId: imported.variantId },
        });
        successful += 1;
      } catch (error: unknown) {
        failed += 1;
        const prior = Array.isArray(row.issues) ? row.issues : [];
        await this.prisma.importRowResult.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            issues: [
              ...prior,
              {
                code: "IMPORT_ROW_EXECUTION_FAILED",
                severity: "BLOCKING_ERROR",
                message: error instanceof Error ? error.message : "Row import failed",
                suggestedResolution: "Correct the row and retry it in a new import",
              },
            ],
          },
        });
      }
      await this.prisma.importJob.update({
        where: { id },
        data: {
          processedRows: blockedRows + successful + (failed - blockedRows),
          successfulRows: successful,
          failedRows: failed,
        },
      });
    }
    const completedAt = new Date();
    const status = failed ? (successful ? "PARTIALLY_SUCCEEDED" : "FAILED") : "SUCCEEDED";
    await this.prisma.importJob.update({ where: { id }, data: { status, completedAt } });
    await this.createReport(auth, id);
    await this.audit(auth, "import.completed", "ImportJob", id, { status, successful, failed, mode: input.mode });
    return this.get(auth, id);
  }

  async queueExecution(auth: RequestAuth, id: string, input: ExecuteImportInput, correlationId?: string) {
    const job = await this.job(auth, id);
    if (job.status !== "VALIDATED") throw new ConflictException({ code: "IMPORT_NOT_VALIDATED", message: "Validate the import before execution" });
    await this.prisma.importJob.update({ where: { id }, data: { status: "QUEUED" } });
    try {
      return await this.jobs.enqueue({
        companyId: auth.companyId,
        type: "imports.execute",
        queueName: "imports",
        payload: { importJobId: id, input, actor: this.backgroundActor(auth) },
        correlationId,
        deduplicationKey: `import:${id}`,
        maxAttempts: 2,
      });
    } catch (error) {
      await this.prisma.importJob.update({ where: { id }, data: { status: "VALIDATED" } });
      throw error;
    }
  }

  async report(auth: RequestAuth, id: string) {
    const job = await this.job(auth, id);
    if (!job.reportObjectKey) throw new NotFoundException({ code: "IMPORT_REPORT_NOT_READY", message: "Import report is not ready" });
    return { body: await this.storage.read(job.reportObjectKey), fileName: `import-${id}-report.csv` };
  }

  private async importRow(
    auth: RequestAuth,
    jobId: string,
    rowNumber: number,
    row: NormalizedRow,
    mode: "CREATE_ONLY" | "UPSERT_BY_SKU",
    internalNumericId: number,
  ) {
    const publicName = this.text(row["product.publicName"]) as string;
    const internalName = this.text(row["product.internalName"]) ?? publicName;
    const sku = (this.text(row["variant.sku"]) as string).toUpperCase();
    const gtin = this.text(row["variant.gtin"]);
    const existing = await this.prisma.productVariant.findFirst({
      where: { companyId: auth.companyId, sku, deletedAt: null },
      include: { product: true },
    });
    if (existing && mode === "CREATE_ONLY") throw new Error(`SKU ${sku} already exists`);
    const [brandId, categoryId] = await Promise.all([
      this.ensureBrand(auth.companyId, this.text(row["brand.name"])),
      this.ensureCategory(auth.companyId, this.text(row["category.name"])),
    ]);
    const productStatus = this.productStatus(row["product.status"]);
    const variantStatus = this.productStatus(row["variant.status"] ?? row["product.status"]);
    const result = await this.prisma.$transaction(async (transaction) => {
      let productId: string;
      let variantId: string;
      if (existing) {
        const product = await transaction.product.update({
          where: { id: existing.productId },
          data: {
            publicName,
            internalName,
            description: sanitizeRichText(this.text(row["product.description"])),
            status: productStatus,
            defaultVatRate: this.decimal(row["product.defaultVatRate"]),
            brandId,
            categoryId,
            updatedById: auth.userId,
          },
        });
        const variant = await transaction.productVariant.update({
          where: { id: existing.id },
          data: {
            internalNumericId: this.integer(row["variant.internalNumericId"]) ?? existing.internalNumericId,
            gtin,
            gtinType: gtin ? gtinTypeFor(gtin) as GtinType : null,
            basePrice: this.decimal(row["variant.basePrice"]),
            currency: this.text(row["variant.currency"]) ?? existing.currency,
            status: variantStatus,
            updatedById: auth.userId,
          },
        });
        productId = product.id;
        variantId = variant.id;
      } else {
        const product = await transaction.product.create({
          data: {
            companyId: auth.companyId,
            productType: "SIMPLE",
            status: productStatus,
            internalName,
            publicName,
            slug: `${slugify(publicName) || "product"}-${jobId.slice(0, 8)}-${rowNumber}`,
            brandId,
            categoryId,
            description: sanitizeRichText(this.text(row["product.description"])),
            defaultVatRate: this.decimal(row["product.defaultVatRate"]),
            defaultCurrency: this.text(row["variant.currency"]) ?? "RON",
            createdById: auth.userId,
            updatedById: auth.userId,
          },
        });
        const variant = await transaction.productVariant.create({
          data: {
            companyId: auth.companyId,
            productId: product.id,
            sku,
            internalNumericId,
            gtin,
            gtinType: gtin ? gtinTypeFor(gtin) as GtinType : undefined,
            variantName: publicName,
            status: variantStatus,
            basePrice: this.decimal(row["variant.basePrice"]),
            currency: this.text(row["variant.currency"]) ?? "RON",
            isDefaultVariant: true,
            variationValues: {},
            variationKey: "default",
            createdById: auth.userId,
            updatedById: auth.userId,
          },
        });
        productId = product.id;
        variantId = variant.id;
      }
      await this.setDynamicAttributes(transaction, auth.companyId, productId, variantId, row);
      await transaction.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: existing ? "import.product_updated" : "import.product_created",
          entityType: "ProductVariant",
          entityId: variantId,
          after: { importJobId: jobId, rowNumber, sku },
        },
      });
      return { productId, variantId };
    });

    const stock = this.integer(row["stock.onHand"]);
    if (stock && stock > 0) {
      const warehouseCode = this.text(row["stock.warehouseCode"])?.toUpperCase();
      const warehouse = await this.prisma.warehouse.findFirst({ where: { companyId: auth.companyId, code: warehouseCode, isActive: true } });
      if (!warehouse) throw new Error(`Warehouse ${warehouseCode ?? ""} is not available`);
      await this.inventory.receive(auth, {
        variantId: result.variantId,
        warehouseId: warehouse.id,
        quantity: stock,
        reason: `Import ${jobId}, row ${rowNumber}`,
        idempotencyKey: this.deterministicUuid(`${jobId}:${rowNumber}:stock`),
      });
    }
    return result;
  }

  private async setDynamicAttributes(
    transaction: Prisma.TransactionClient,
    companyId: string,
    productId: string,
    variantId: string,
    row: NormalizedRow,
  ) {
    const values = Object.entries(row).filter(([key]) => key.startsWith("attribute."));
    if (!values.length) return;
    const keys = values.map(([key]) => key.slice("attribute.".length));
    const definitions = await transaction.attributeDefinition.findMany({
      where: { companyId, key: { in: keys }, isActive: true },
      include: { options: { where: { isActive: true } } },
    });
    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
    for (const [path, rawValue] of values) {
      const key = path.slice("attribute.".length);
      const definition = byKey.get(key);
      if (!definition) throw new Error(`Attribute '${key}' is not configured`);
      const value = this.attributeValidator.validate(definition, rawValue);
      if (definition.scope === "PRODUCT") {
        await transaction.productAttributeValue.upsert({
          where: { productId_attributeDefinitionId_locale: { productId, attributeDefinitionId: definition.id, locale: "" } },
          update: { value },
          create: { productId, attributeDefinitionId: definition.id, value },
        });
      } else {
        await transaction.variantAttributeValue.upsert({
          where: { variantId_attributeDefinitionId_locale: { variantId, attributeDefinitionId: definition.id, locale: "" } },
          update: { value, isOverride: true },
          create: { variantId, attributeDefinitionId: definition.id, value, isOverride: true },
        });
      }
    }
  }

  private validateBusinessRow(row: NormalizedRow, warehouseCodes: Set<string>) {
    const issues: ImportIssue[] = [];
    const name = this.text(row["product.publicName"]);
    const sku = this.text(row["variant.sku"]);
    if (!name) issues.push(this.blocking("IMPORT_PRODUCT_NAME_MISSING", "product.publicName", "Product name is required", "Map or enter a product name"));
    if (!sku) issues.push(this.blocking("IMPORT_SKU_MISSING", "variant.sku", "SKU is required", "Map or enter a SKU"));
    else if (!/^[A-Za-z0-9._-]{2,64}$/.test(sku)) issues.push(this.blocking("IMPORT_SKU_INVALID", "variant.sku", "SKU format is invalid", "Use 2–64 letters, numbers, dots, underscores, or hyphens"));
    const gtin = this.text(row["variant.gtin"]);
    if (gtin && !isValidGtin(gtin)) issues.push(this.blocking("IMPORT_GTIN_INVALID", "variant.gtin", "GTIN length or check digit is invalid", "Correct or remove the GTIN"));
    const price = this.number(row["variant.basePrice"]);
    if (row["variant.basePrice"] !== undefined && (price === undefined || price < 0)) issues.push(this.blocking("IMPORT_PRICE_INVALID", "variant.basePrice", "Price must be a non-negative decimal", "Use a valid decimal price"));
    const vat = this.number(row["product.defaultVatRate"]);
    if (row["product.defaultVatRate"] !== undefined && (vat === undefined || vat < 0 || vat > 100)) issues.push(this.blocking("IMPORT_VAT_INVALID", "product.defaultVatRate", "VAT must be between 0 and 100", "Use a valid VAT percentage"));
    const currency = this.text(row["variant.currency"]);
    if (currency && !/^[A-Za-z]{3}$/.test(currency)) issues.push(this.blocking("IMPORT_CURRENCY_INVALID", "variant.currency", "Currency must use a three-letter ISO code", "Use a code such as RON or EUR"));
    const stock = this.integer(row["stock.onHand"]);
    if (row["stock.onHand"] !== undefined && (stock === undefined || stock < 0)) issues.push(this.blocking("IMPORT_STOCK_INVALID", "stock.onHand", "Stock must be a non-negative integer", "Use a whole number"));
    if (stock && stock > 0) {
      const code = this.text(row["stock.warehouseCode"])?.toUpperCase();
      if (!code || !warehouseCodes.has(code)) issues.push(this.blocking("IMPORT_WAREHOUSE_INVALID", "stock.warehouseCode", "Mapped warehouse code does not exist", "Create the warehouse or correct its code"));
    }
    const images = row["images.urls"];
    if (images !== undefined) {
      const urls = Array.isArray(images) ? images : String(images).split(",").map((value) => value.trim());
      if (urls.some((url) => {
        try { return !new Set(["http:", "https:"]).has(new URL(String(url)).protocol); } catch { return true; }
      })) issues.push(this.blocking("IMPORT_IMAGE_URL_INVALID", "images.urls", "One or more image URLs are invalid", "Use public HTTP or HTTPS image URLs"));
      else issues.push(this.warning("IMPORT_IMAGES_DEFERRED", "images.urls", "Remote images will require media ingestion after product import", "Review and ingest the URLs from the import report"));
    }
    return issues;
  }

  private async createReport(auth: RequestAuth, importJobId: string) {
    const rows = await this.prisma.importRowResult.findMany({ where: { importJobId }, orderBy: { rowNumber: "asc" } });
    const records = rows.map((row) => ({
      row: row.rowNumber,
      status: row.status,
      sku: this.jsonRecord(row.normalizedData)["variant.sku"] ?? "",
      productName: this.jsonRecord(row.normalizedData)["product.publicName"] ?? "",
      issues: Array.isArray(row.issues)
        ? row.issues.map((issue) => typeof issue === "object" && issue && "message" in issue ? String(issue.message) : String(issue)).join(" | ")
        : "",
      productId: row.productId ?? "",
      variantId: row.variantId ?? "",
    }));
    const mappings: ExportMappingItem[] = [
      { sourceField: "row", destinationColumn: "Row", required: true, transformation: "NONE" },
      { sourceField: "status", destinationColumn: "Status", required: true, transformation: "NONE" },
      { sourceField: "sku", destinationColumn: "SKU", required: false, transformation: "NONE" },
      { sourceField: "productName", destinationColumn: "Product name", required: false, transformation: "NONE" },
      { sourceField: "issues", destinationColumn: "Issues", required: false, transformation: "NONE" },
      { sourceField: "productId", destinationColumn: "Product ID", required: false, transformation: "NONE" },
      { sourceField: "variantId", destinationColumn: "Variant ID", required: false, transformation: "NONE" },
    ];
    const body = renderExport(records, mappings, "CSV");
    const objectKey = `private/imports/${auth.companyId}/${importJobId}/report.csv`;
    await this.storage.put({ key: objectKey, body, contentType: "text/csv; charset=utf-8", cacheControl: "private, no-store" });
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: { reportObjectKey: objectKey, reportUrl: `/api/v1/imports/${importJobId}/report` },
    });
  }

  private async assertAttributeMappings(companyId: string, mappings: ImportMappingItem[]) {
    const keys = mappings.map((mapping) => mapping.destinationField).filter((field) => field.startsWith("attribute.")).map((field) => field.slice("attribute.".length));
    if (!keys.length) return;
    const count = await this.prisma.attributeDefinition.count({ where: { companyId, key: { in: keys }, isActive: true } });
    if (count !== new Set(keys).size) {
      throw new BadRequestException({ code: "IMPORT_ATTRIBUTE_MAPPING_INVALID", message: "One or more mapped dynamic attributes do not exist" });
    }
  }

  private ensureBrand(companyId: string, name?: string) {
    if (!name) return Promise.resolve(undefined);
    const slug = slugify(name);
    return this.prisma.brand.upsert({
      where: { companyId_slug: { companyId, slug } },
      update: { name, isActive: true },
      create: { companyId, name, slug },
      select: { id: true },
    }).then((brand) => brand.id);
  }

  private ensureCategory(companyId: string, name?: string) {
    if (!name) return Promise.resolve(undefined);
    const slug = slugify(name);
    return this.prisma.category.upsert({
      where: { companyId_slug: { companyId, slug } },
      update: { name, isActive: true },
      create: { companyId, name, slug },
      select: { id: true },
    }).then((category) => category.id);
  }

  private valueCounts(rows: Array<{ normalized: NormalizedRow }>, field: string, normalize: (value: unknown) => string) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = row.normalized[field];
      if (value === undefined || value === null || value === "") continue;
      const key = normalize(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  private async job(auth: RequestAuth, id: string) {
    const job = await this.prisma.importJob.findFirst({ where: { id, companyId: auth.companyId } });
    if (!job) throw this.notFound();
    return job;
  }

  private jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private text(value: unknown) {
    if (value === undefined || value === null || value === "") return undefined;
    return String(value).trim();
  }

  private number(value: unknown) {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private decimal(value: unknown) {
    const number = this.number(value);
    return number === undefined ? undefined : String(number);
  }

  private integer(value: unknown) {
    const number = this.number(value);
    return number !== undefined && Number.isSafeInteger(number) ? number : undefined;
  }

  private productStatus(value: unknown) {
    const status = this.text(value)?.toUpperCase();
    return new Set(["DRAFT", "READY", "ACTIVE", "ARCHIVED"]).has(status ?? "")
      ? status as ProductStatus
      : ProductStatus.DRAFT;
  }

  private blocking(code: string, field: string, message: string, suggestedResolution: string): ImportIssue {
    return { code, field, message, suggestedResolution, severity: "BLOCKING_ERROR" };
  }

  private warning(code: string, field: string, message: string, suggestedResolution: string): ImportIssue {
    return { code, field, message, suggestedResolution, severity: "WARNING" };
  }

  private deterministicUuid(seed: string) {
    const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
    hex[12] = "5";
    hex[16] = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
    const value = hex.join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  private spreadsheetError(error: unknown) {
    if (error instanceof SpreadsheetValidationError) {
      return new BadRequestException({ code: error.code, message: error.message, details: error.details });
    }
    return new BadRequestException({ code: "IMPORT_FILE_INVALID", message: "The spreadsheet could not be read" });
  }

  private audit(auth: RequestAuth, action: string, entityType: string, entityId: string, after: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { companyId: auth.companyId, actorId: auth.userId, action, entityType, entityId, after } });
  }

  private backgroundActor(auth: RequestAuth): Prisma.InputJsonObject {
    return { userId: auth.userId, companyId: auth.companyId, membershipId: auth.membershipId, sessionId: auth.sessionId, companySlug: auth.companySlug, roleKey: auth.roleKey, permissions: [...auth.permissions] };
  }

  private notFound() {
    return new NotFoundException({ code: "IMPORT_JOB_NOT_FOUND", message: "Import job not found" });
  }
}
