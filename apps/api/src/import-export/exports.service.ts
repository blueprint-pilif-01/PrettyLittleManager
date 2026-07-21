import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { FileFormat, Prisma } from "@prisma/client";
import {
  exportMappingItemSchema,
  type CreateExportTemplateInput,
  type ExportMappingItem,
  type RunExportInput,
} from "@plm/contracts";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { ObjectStorageService } from "../catalog/object-storage.service";
import { calculateAvailability } from "../inventory/inventory.utils";
import { BackgroundJobsService } from "../jobs/background-jobs.service";
import { renderExport } from "./spreadsheet-engine";

const supportedExportFields = new Set([
  "product.id",
  "product.internalName",
  "product.publicName",
  "product.shortName",
  "product.slug",
  "product.status",
  "product.description",
  "product.shortDescription",
  "product.gs1LabelDescription",
  "product.safetyInformation",
  "product.manufacturerPartNumber",
  "product.manufacturerName",
  "product.euResponsiblePersonName",
  "product.defaultVatRate",
  "product.defaultCurrency",
  "brand.name",
  "category.name",
  "category.gs1GpcCode",
  "variant.id",
  "variant.sku",
  "variant.internalNumericId",
  "variant.gtin",
  "variant.gtinType",
  "variant.variantName",
  "variant.status",
  "variant.basePrice",
  "variant.costPrice",
  "variant.currency",
  "inventory.physicalStock",
  "inventory.reservedStock",
  "inventory.availableStock",
  "inventory.incomingStock",
  "inventory.damagedStock",
  "inventory.quarantinedStock",
  "images.urls",
  "emag.categoryId",
  "emag.sellerProductId",
  "emag.partNumberKey",
  "emag.publicationPath",
  "emag.salePrice",
  "emag.recommendedPrice",
  "emag.minimumSalePrice",
  "emag.maximumSalePrice",
  "emag.vatId",
  "emag.handlingTimeId",
  "emag.offerStatus",
  "emag.stockBuffer",
  "emag.characteristics",
]);

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly jobs: BackgroundJobsService,
  ) {}

  listTemplates(auth: RequestAuth) {
    return this.prisma.exportTemplate.findMany({
      where: { companyId: auth.companyId, isActive: true },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
  }

  listJobs(auth: RequestAuth) {
    return this.prisma.exportJob.findMany({
      where: { companyId: auth.companyId },
      take: 100,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { exportTemplate: { select: { id: true, name: true } } },
    });
  }

  async getJob(auth: RequestAuth, id: string) {
    const job = await this.prisma.exportJob.findFirst({
      where: { id, companyId: auth.companyId },
      include: { exportTemplate: true },
    });
    if (!job) throw this.jobNotFound();
    return job;
  }

  async createTemplate(auth: RequestAuth, input: CreateExportTemplateInput) {
    this.assertMappings(input.mappings);
    try {
      const template = await this.prisma.exportTemplate.create({
        data: {
          companyId: auth.companyId,
          name: input.name,
          description: input.description,
          format: input.format as FileFormat,
          mappings: input.mappings as Prisma.InputJsonValue,
          defaults: input.defaults as Prisma.InputJsonValue,
          createdById: auth.userId,
        },
      });
      await this.audit(auth, "export_template.created", "ExportTemplate", template.id, {
        name: template.name,
        format: template.format,
        columns: input.mappings.length,
      });
      return template;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "EXPORT_TEMPLATE_NAME_EXISTS", message: "An export template with this name already exists" });
      }
      throw error;
    }
  }

  async createEmagPreset(auth: RequestAuth) {
    const mappings: ExportMappingItem[] = [
      ["variant.internalNumericId", "id"], ["emag.categoryId", "category_id"], ["emag.partNumberKey", "part_number_key"],
      ["product.publicName", "name"], ["product.manufacturerPartNumber", "part_number"], ["product.description", "description"],
      ["brand.name", "brand"], ["variant.gtin", "ean"], ["emag.salePrice", "sale_price"], ["emag.recommendedPrice", "recommended_price"],
      ["emag.minimumSalePrice", "min_sale_price"], ["emag.maximumSalePrice", "max_sale_price"], ["emag.vatId", "vat_id"],
      ["inventory.availableStock", "stock"], ["emag.handlingTimeId", "handling_time"], ["emag.offerStatus", "status"],
      ["product.safetyInformation", "safety_information"], ["images.urls", "images"], ["emag.characteristics", "characteristics"],
    ].map(([sourceField, destinationColumn]) => ({ sourceField: sourceField!, destinationColumn: destinationColumn!, required: ["id", "sale_price", "vat_id", "stock", "status"].includes(destinationColumn!), transformation: ["images", "characteristics"].includes(destinationColumn!) ? "JOIN_COMMA" as const : "NONE" as const }));
    this.assertMappings(mappings);
    const template = await this.prisma.exportTemplate.upsert({
      where: { companyId_name: { companyId: auth.companyId, name: "eMAG Product Offer v4.5.1" } },
      create: { companyId: auth.companyId, name: "eMAG Product Offer v4.5.1", description: "Reusable eMAG product/offer fields based on the supplied Marketplace API specification", format: "XLSX", mappings: mappings as Prisma.InputJsonValue, defaults: {}, createdById: auth.userId },
      update: { description: "Reusable eMAG product/offer fields based on the supplied Marketplace API specification", mappings: mappings as Prisma.InputJsonValue, isActive: true },
    });
    await this.audit(auth, "export_template.emag_preset_upserted", "ExportTemplate", template.id, { columns: mappings.length });
    return template;
  }

  async run(auth: RequestAuth, input: RunExportInput) {
    const template = await this.prisma.exportTemplate.findFirst({
      where: { id: input.templateId, companyId: auth.companyId, isActive: true },
    });
    if (!template) throw new NotFoundException({ code: "EXPORT_TEMPLATE_NOT_FOUND", message: "Export template not found" });
    const mappings = exportMappingItemSchema.array().parse(template.mappings) as ExportMappingItem[];
    this.assertMappings(mappings);
    const format = (input.format ?? template.format) as "CSV" | "XLSX";
    const job = await this.prisma.exportJob.create({
      data: {
        companyId: auth.companyId,
        exportTemplateId: template.id,
        status: "RUNNING",
        format: format as FileFormat,
        mappingSnapshot: mappings as Prisma.InputJsonValue,
        filtersSnapshot: input.filters as Prisma.InputJsonValue,
        createdById: auth.userId,
        startedAt: new Date(),
      },
    });
    try {
      const records = await this.canonicalRecords(auth.companyId, input.filters);
      const body = renderExport(records, mappings, format);
      const extension = format.toLowerCase();
      const objectKey = `private/exports/${auth.companyId}/${job.id}/products.${extension}`;
      await this.storage.put({
        key: objectKey,
        body,
        contentType: format === "CSV"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        cacheControl: "private, no-store",
      });
      const completed = await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          rowCount: records.length,
          outputObjectKey: objectKey,
          outputUrl: `/api/v1/exports/${job.id}/download`,
          completedAt: new Date(),
        },
      });
      await this.audit(auth, "export.completed", "ExportJob", job.id, {
        format,
        rows: records.length,
        templateId: template.id,
      });
      return completed;
    } catch (error: unknown) {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: { message: error instanceof Error ? error.message : "Export failed" },
        },
      });
      throw error;
    }
  }

  async queueRun(auth: RequestAuth, input: RunExportInput, correlationId?: string) {
    const template = await this.prisma.exportTemplate.findFirst({ where: { id: input.templateId, companyId: auth.companyId, isActive: true } });
    if (!template) throw new NotFoundException({ code: "EXPORT_TEMPLATE_NOT_FOUND", message: "Export template not found" });
    return this.jobs.enqueue({
      companyId: auth.companyId,
      type: "exports.run",
      queueName: "exports",
      payload: { input, actor: { userId: auth.userId, companyId: auth.companyId, membershipId: auth.membershipId, sessionId: auth.sessionId, companySlug: auth.companySlug, roleKey: auth.roleKey, permissions: [...auth.permissions] } },
      correlationId,
      maxAttempts: 2,
    });
  }

  async download(auth: RequestAuth, id: string) {
    const job = await this.getJob(auth, id);
    if (job.status !== "SUCCEEDED" || !job.outputObjectKey) {
      throw new ConflictException({ code: "EXPORT_NOT_READY", message: "Export file is not ready" });
    }
    const extension = job.format.toLowerCase();
    return {
      body: await this.storage.read(job.outputObjectKey),
      fileName: `products-${id}.${extension}`,
      contentType: job.format === "CSV"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  private async canonicalRecords(
    companyId: string,
    filters: RunExportInput["filters"],
  ) {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: filters.productStatus,
        categoryId: filters.categoryId,
        brandId: filters.brandId,
        ...(filters.updatedAfter ? { updatedAt: { gte: new Date(filters.updatedAfter) } } : {}),
      },
      take: 50_000,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      include: {
        brand: true,
        category: true,
        attributeValues: { include: { definition: true } },
        imageAssignments: {
          where: { image: { deletedAt: null, processingStatus: "READY" } },
          orderBy: [{ role: "asc" }, { position: "asc" }],
          include: { image: true },
        },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ isDefaultVariant: "desc" }, { createdAt: "asc" }],
          include: {
            stockLevels: true,
            attributeValues: { include: { definition: true } },
            imageAssignments: {
              where: { image: { deletedAt: null, processingStatus: "READY" } },
              orderBy: [{ role: "asc" }, { position: "asc" }],
              include: { image: true },
            },
            listings: {
              where: { channelAccount: { type: "EMAG" }, ...(filters.channelAccountId ? { channelAccountId: filters.channelAccountId } : {}) },
              include: { emagData: true },
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    return products.flatMap((product) => product.variants.map((variant) => {
      const totals = variant.stockLevels.reduce(
        (sum, balance) => ({
          onHand: sum.onHand + balance.onHand,
          reserved: sum.reserved + balance.reserved,
          incoming: sum.incoming + balance.incoming,
          damaged: sum.damaged + balance.damaged,
          quarantined: sum.quarantined + balance.quarantined,
          safetyStock: sum.safetyStock + balance.safetyStock,
        }),
        { onHand: 0, reserved: 0, incoming: 0, damaged: 0, quarantined: 0, safetyStock: 0 },
      );
      const attributeValues = {
        ...Object.fromEntries(product.attributeValues.map((value) => [value.definition.key, value.value])),
        ...Object.fromEntries(variant.attributeValues.map((value) => [value.definition.key, value.value])),
      };
      const imageAssignments = variant.imageAssignments.length
        ? variant.imageAssignments
        : product.imageAssignments;
      const emagListing = variant.listings[0];
      return {
        product: {
          id: product.id,
          internalName: product.internalName,
          publicName: product.publicName,
          shortName: product.shortName,
          slug: product.slug,
          status: product.status,
          description: product.description,
          shortDescription: product.shortDescription,
          gs1LabelDescription: product.gs1LabelDescription,
          safetyInformation: product.safetyInformation,
          manufacturerPartNumber: product.manufacturerPartNumber,
          manufacturerName: product.manufacturerName,
          euResponsiblePersonName: product.euResponsiblePersonName,
          defaultVatRate: product.defaultVatRate?.toString(),
          defaultCurrency: product.defaultCurrency,
        },
        brand: { name: product.brand?.name },
        category: { name: product.category?.name, gs1GpcCode: product.category?.gs1GpcCode },
        variant: {
          id: variant.id,
          sku: variant.sku,
          internalNumericId: variant.internalNumericId,
          gtin: variant.gtin,
          gtinType: variant.gtinType,
          variantName: variant.variantName,
          status: variant.status,
          basePrice: variant.basePrice?.toString(),
          costPrice: variant.costPrice?.toString(),
          currency: variant.currency,
        },
        inventory: calculateAvailability(totals),
        images: { urls: imageAssignments.map((assignment) => assignment.image.publicUrl).filter(Boolean) },
        emag: {
          categoryId: emagListing?.externalCategoryId,
          sellerProductId: emagListing?.emagData?.sellerProductId,
          partNumberKey: emagListing?.emagData?.partNumberKey,
          publicationPath: emagListing?.emagData?.publicationPath,
          salePrice: emagListing?.emagData?.salePrice?.toString(),
          recommendedPrice: emagListing?.emagData?.recommendedPrice?.toString(),
          minimumSalePrice: emagListing?.emagData?.minimumSalePrice?.toString(),
          maximumSalePrice: emagListing?.emagData?.maximumSalePrice?.toString(),
          vatId: emagListing?.emagData?.vatId,
          handlingTimeId: emagListing?.emagData?.handlingTimeId,
          offerStatus: emagListing?.emagData?.offerStatus,
          stockBuffer: emagListing?.emagData?.stockBuffer,
          characteristics: emagListing?.emagData?.characteristicMappings,
        },
        attribute: attributeValues,
      } as Record<string, unknown>;
    }));
  }

  private assertMappings(mappings: ExportMappingItem[]) {
    const destinations = mappings.map((mapping) => mapping.destinationColumn.toLowerCase());
    if (new Set(destinations).size !== destinations.length) {
      throw new ConflictException({ code: "EXPORT_COLUMNS_DUPLICATE", message: "Export destination columns must be unique" });
    }
    const unsupported = mappings
      .flatMap((mapping) => [mapping.sourceField, ...(mapping.concatenate ?? [])])
      .filter((field) => !supportedExportFields.has(field) && !field.startsWith("attribute."));
    if (unsupported.length) {
      throw new ConflictException({
        code: "EXPORT_SOURCE_FIELD_UNSUPPORTED",
        message: "One or more export source fields are unsupported",
        fields: [...new Set(unsupported)],
      });
    }
  }

  private audit(auth: RequestAuth, action: string, entityType: string, entityId: string, after: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { companyId: auth.companyId, actorId: auth.userId, action, entityType, entityId, after } });
  }

  private jobNotFound() {
    return new NotFoundException({ code: "EXPORT_JOB_NOT_FOUND", message: "Export job not found" });
  }
}
