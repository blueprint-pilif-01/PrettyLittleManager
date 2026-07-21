import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateEmagAccountInput,
  EmagEanLookupInput,
  EnqueueEmagOperationInput,
  UpdateEmagAccountInput,
  UpsertCategoryMappingInput,
  UpsertEmagListingInput,
} from "@plm/contracts";
import {
  getEmagReadiness,
  marketplaceApiUrls,
  type EmagConfig,
  type EmagMarketplace,
} from "@plm/emag";
import { createHash } from "node:crypto";
import { EncryptionService } from "../channels/encryption.service";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import {
  BackgroundJobsService,
  type OperationalQueue,
} from "../jobs/background-jobs.service";
import {
  buildEmagProductOfferPayload,
  type EmagPayloadSource,
} from "./emag-payload.builder";

type StoredEmagConfiguration = {
  marketplace: EmagMarketplace;
  mode: "mock" | "live";
  apiUrl: string;
  sourceLanguage: string;
};
type StoredEmagCredentials = { username: string; password: string };

@Injectable()
export class EmagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly jobs: BackgroundJobsService,
  ) {}

  async listAccounts(auth: RequestAuth) {
    const accounts = await this.prisma.channelAccount.findMany({
      where: { companyId: auth.companyId, type: "EMAG" },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            listings: true,
            emagCategories: true,
            integrationRequestLogs: true,
          },
        },
      },
    });
    return accounts.map((account) => ({
      ...account,
      encryptedCredentials: undefined,
      readiness: this.readiness(
        account.configuration as StoredEmagConfiguration,
        Boolean(account.encryptedCredentials),
      ),
    }));
  }

  async createAccount(auth: RequestAuth, input: CreateEmagAccountInput) {
    const configuration = this.configuration(input);
    const encryptedCredentials =
      input.username && input.password
        ? this.encryption.encrypt({
            username: input.username,
            password: input.password,
          })
        : undefined;
    if (configuration.mode === "live" && !encryptedCredentials)
      throw new BadRequestException({
        code: "EMAG_CREDENTIALS_REQUIRED",
        message: "Live eMAG mode requires credentials",
      });
    try {
      const account = await this.prisma.channelAccount.create({
        data: {
          companyId: auth.companyId,
          type: "EMAG",
          name: input.name,
          isActive: input.isActive,
          configuration,
          encryptedCredentials,
        },
      });
      await this.audit(auth, "emag.account.created", account.id, {
        name: account.name,
        configuration,
      });
      return this.safeAccount(account);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException({
          code: "EMAG_ACCOUNT_EXISTS",
          message: "An eMAG account with this name already exists",
        });
      throw error;
    }
  }

  async updateAccount(
    auth: RequestAuth,
    id: string,
    input: UpdateEmagAccountInput,
  ) {
    const account = await this.assertAccount(auth.companyId, id);
    const current = account.configuration as StoredEmagConfiguration;
    const configuration = {
      ...current,
      ...this.configuration({
        marketplace: input.marketplace ?? current.marketplace,
        mode: input.mode ?? current.mode,
        apiUrl: input.apiUrl ?? current.apiUrl,
        sourceLanguage: current.sourceLanguage,
      }),
    };
    const encryptedCredentials =
      input.username && input.password
        ? this.encryption.encrypt({
            username: input.username,
            password: input.password,
          })
        : account.encryptedCredentials;
    if (configuration.mode === "live" && !encryptedCredentials)
      throw new BadRequestException({
        code: "EMAG_CREDENTIALS_REQUIRED",
        message: "Live eMAG mode requires credentials",
      });
    const updated = await this.prisma.channelAccount.update({
      where: { id },
      data: {
        name: input.name,
        isActive: input.isActive,
        configuration,
        encryptedCredentials,
      },
    });
    await this.audit(auth, "emag.account.updated", id, {
      name: updated.name,
      configuration,
      credentialsRotated: Boolean(input.password),
    });
    return this.safeAccount(updated);
  }

  async readinessForAccount(auth: RequestAuth, id: string) {
    const account = await this.assertAccount(auth.companyId, id);
    const configuration = account.configuration as StoredEmagConfiguration;
    return {
      accountId: id,
      active: account.isActive,
      ...this.readiness(configuration, Boolean(account.encryptedCredentials)),
      prerequisites: [
        "API access enabled for the seller account",
        "Stable public IP for the backend",
        "Server IP whitelisted by eMAG",
        "HTTPS in production",
      ],
    };
  }

  async enqueueMetadataSync(
    auth: RequestAuth,
    accountId: string,
    correlationId?: string,
  ) {
    await this.assertAccount(auth.companyId, accountId);
    return this.jobs.enqueue({
      companyId: auth.companyId,
      type: "emag.metadata.sync",
      queueName: "reconciliation",
      payload: { accountId },
      correlationId,
      deduplicationKey: `metadata:${accountId}`,
    });
  }

  async enqueueEanLookup(
    auth: RequestAuth,
    accountId: string,
    input: EmagEanLookupInput,
    correlationId?: string,
  ) {
    await this.assertAccount(auth.companyId, accountId);
    return this.jobs.enqueue({
      companyId: auth.companyId,
      type: "emag.ean.lookup",
      queueName: "reconciliation",
      payload: { accountId, eans: input.eans },
      correlationId,
    });
  }

  async enqueueOperation(
    auth: RequestAuth,
    accountId: string,
    input: EnqueueEmagOperationInput,
    correlationId?: string,
  ) {
    await this.assertAccount(auth.companyId, accountId);
    const count = await this.prisma.channelListing.count({
      where: {
        id: { in: input.listingIds },
        companyId: auth.companyId,
        channelAccountId: accountId,
        channelAccount: { type: "EMAG" },
      },
    });
    if (count !== input.listingIds.length)
      throw new BadRequestException({
        code: "EMAG_LISTING_SCOPE_INVALID",
        message: "One or more listing IDs do not belong to this eMAG account",
      });
    const queueName: OperationalQueue =
      input.operation === "stock"
        ? "stock-sync"
        : input.operation === "reconcile"
          ? "reconciliation"
          : "marketplace-publication";
    await this.prisma.channelListing.updateMany({
      where: { id: { in: input.listingIds } },
      data: {
        status: "QUEUED",
        synchronizationStatus: "QUEUED",
        lastError: Prisma.DbNull,
      },
    });
    return this.jobs.enqueue({
      companyId: auth.companyId,
      type: `emag.${input.operation}`,
      queueName,
      payload: { accountId, listingIds: input.listingIds },
      correlationId,
      deduplicationKey: `${input.operation}:${createHash("sha256")
        .update([...input.listingIds].sort().join(","))
        .digest("hex")}`,
    });
  }

  listCategories(auth: RequestAuth, accountId: string, search?: string) {
    return this.prisma.emagCategory.findMany({
      where: {
        companyId: auth.companyId,
        channelAccountId: accountId,
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      take: 100,
      orderBy: { name: "asc" },
      include: { _count: { select: { characteristics: true } } },
    });
  }

  async category(auth: RequestAuth, accountId: string, externalId: number) {
    const category = await this.prisma.emagCategory.findFirst({
      where: {
        companyId: auth.companyId,
        channelAccountId: accountId,
        externalId,
      },
      include: {
        characteristics: {
          include: { values: { orderBy: { value: "asc" }, take: 500 } },
          orderBy: [{ presentationGroup: "asc" }, { name: "asc" }],
        },
        familyTypes: true,
      },
    });
    if (!category)
      throw new NotFoundException({
        code: "EMAG_CATEGORY_NOT_FOUND",
        message: "Synced eMAG category not found",
      });
    return category;
  }

  listVatRates(auth: RequestAuth, accountId: string) {
    return this.prisma.emagVatRate.findMany({
      where: { companyId: auth.companyId, channelAccountId: accountId },
      orderBy: [{ rate: "asc" }, { externalId: "asc" }],
    });
  }

  listHandlingTimes(auth: RequestAuth, accountId: string) {
    return this.prisma.emagHandlingTime.findMany({
      where: { companyId: auth.companyId, channelAccountId: accountId },
      orderBy: [{ minimumDays: "asc" }, { externalId: "asc" }],
    });
  }

  listFamilyTypes(auth: RequestAuth, accountId: string) {
    return this.prisma.emagFamilyType.findMany({
      where: { companyId: auth.companyId, channelAccountId: accountId },
      orderBy: [{ name: "asc" }, { externalId: "asc" }],
    });
  }

  async upsertCategoryMapping(
    auth: RequestAuth,
    accountId: string,
    input: UpsertCategoryMappingInput,
  ) {
    await this.assertAccount(auth.companyId, accountId);
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, companyId: auth.companyId },
    });
    if (!category)
      throw new NotFoundException({
        code: "CATEGORY_NOT_FOUND",
        message: "Internal category not found",
      });
    const externalId = Number(input.externalCategoryId);
    if (!Number.isInteger(externalId))
      throw new BadRequestException({
        code: "EMAG_CATEGORY_ID_INVALID",
        message: "eMAG category ID must be numeric",
      });
    const external = await this.prisma.emagCategory.findFirst({
      where: {
        companyId: auth.companyId,
        channelAccountId: accountId,
        externalId,
      },
    });
    if (!external)
      throw new NotFoundException({
        code: "EMAG_CATEGORY_NOT_SYNCED",
        message: "Synchronize this eMAG category before mapping it",
      });
    return this.prisma.categoryMapping.upsert({
      where: {
        categoryId_channelAccountId: {
          categoryId: input.categoryId,
          channelAccountId: accountId,
        },
      },
      create: {
        companyId: auth.companyId,
        categoryId: input.categoryId,
        channelAccountId: accountId,
        externalCategoryId: String(externalId),
        externalName: external.name,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      update: {
        externalCategoryId: String(externalId),
        externalName: external.name,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async upsertListing(
    auth: RequestAuth,
    accountId: string,
    input: UpsertEmagListingInput,
  ) {
    const account = await this.assertAccount(auth.companyId, accountId);
    const [product, variant, category] = await Promise.all([
      this.prisma.product.findFirst({
        where: {
          id: input.productId,
          companyId: auth.companyId,
          deletedAt: null,
        },
        include: {
          brand: true,
          imageAssignments: {
            include: { image: true },
            orderBy: { position: "asc" },
          },
        },
      }),
      this.prisma.productVariant.findFirst({
        where: {
          id: input.variantId,
          productId: input.productId,
          companyId: auth.companyId,
          deletedAt: null,
        },
        include: {
          stockLevels: true,
          imageAssignments: {
            include: { image: true },
            orderBy: { position: "asc" },
          },
          familyMemberships: { include: { family: true } },
        },
      }),
      this.prisma.emagCategory.findFirst({
        where: {
          companyId: auth.companyId,
          channelAccountId: accountId,
          externalId: input.externalCategoryId,
        },
        include: {
          characteristics: {
            where: { isRequired: true },
            select: { externalId: true },
          },
          familyTypes: { select: { externalId: true } },
        },
      }),
    ]);
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found",
      });
    if (!variant)
      throw new NotFoundException({
        code: "VARIANT_NOT_FOUND",
        message: "Variant does not belong to this product",
      });
    if (!category)
      throw new NotFoundException({
        code: "EMAG_CATEGORY_NOT_SYNCED",
        message: "Synchronize and select an eMAG category",
      });
    const canonicalFamily = variant.familyMemberships?.[0]?.family;
    const familyTypeId = await this.resolveFamilyTypeId(
      auth.companyId,
      accountId,
      input.externalCategoryId,
      canonicalFamily?.id,
      input.familyTypeId,
    );
    const normalizedInput = { ...input, familyTypeId };
    const duplicateSellerId = await this.prisma.channelListing.findFirst({
      where: {
        channelAccountId: accountId,
        id: { not: undefined },
        emagData: { sellerProductId: normalizedInput.sellerProductId },
        NOT: {
          productId: normalizedInput.productId,
          variantId: normalizedInput.variantId,
        },
      },
    });
    if (duplicateSellerId)
      throw new ConflictException({
        code: "EMAG_SELLER_PRODUCT_ID_EXISTS",
        message: "This seller product ID is already used by another listing",
      });
    const source = this.payloadSource(
      account.configuration as StoredEmagConfiguration,
      product,
      variant,
      category,
      normalizedInput,
    );
    const built = buildEmagProductOfferPayload(source);
    const resolvedInput = source.family
      ? {
          ...input,
          sellerFamilyId: source.family.id,
          familyName: source.family.name ?? undefined,
          familyTypeId: source.family.familyTypeId ?? undefined,
        }
      : normalizedInput;
    const existing = await this.prisma.channelListing.findFirst({
      where: {
        companyId: auth.companyId,
        channelAccountId: accountId,
        productId: normalizedInput.productId,
        variantId: normalizedInput.variantId,
      },
    });
    const listingStatus = built.issues.length
      ? "VALIDATION_FAILED"
      : normalizedInput.status;
    const listingData = {
      externalCategoryId: String(input.externalCategoryId),
      status: listingStatus as any,
      validation: { valid: built.issues.length === 0, issues: built.issues },
      payloadSnapshot: built.payload as unknown as Prisma.InputJsonValue,
      synchronizationStatus: built.issues.length
        ? ("NOT_SYNCED" as const)
        : ("NOT_SYNCED" as const),
    };
    const listing = existing
      ? await this.prisma.channelListing.update({
          where: { id: existing.id },
          data: listingData,
        })
      : await this.prisma.channelListing.create({
          data: {
            companyId: auth.companyId,
            channelAccountId: accountId,
            productId: input.productId,
            variantId: input.variantId,
            ...listingData,
          },
        });
    await this.prisma.emagListingData.upsert({
      where: { channelListingId: listing.id },
      create: this.emagCreateData(listing.id, resolvedInput),
      update: this.emagUpdateData(resolvedInput),
    });
    await this.audit(auth, "emag.listing.saved", listing.id, {
      accountId,
      valid: built.issues.length === 0,
      publicationPath: input.publicationPath,
    });
    return {
      listing: await this.getListing(auth, accountId, listing.id),
      payloadPreview: built.payload,
      validation: { valid: built.issues.length === 0, issues: built.issues },
    };
  }

  async getListing(auth: RequestAuth, accountId: string, listingId: string) {
    const listing = await this.prisma.channelListing.findFirst({
      where: {
        id: listingId,
        companyId: auth.companyId,
        channelAccountId: accountId,
      },
      include: {
        emagData: true,
        product: { select: { id: true, publicName: true, slug: true } },
        variant: {
          select: { id: true, sku: true, gtin: true, variantName: true },
        },
      },
    });
    if (!listing)
      throw new NotFoundException({
        code: "EMAG_LISTING_NOT_FOUND",
        message: "eMAG listing not found",
      });
    return listing;
  }

  listListings(auth: RequestAuth, accountId: string) {
    return this.prisma.channelListing.findMany({
      where: { companyId: auth.companyId, channelAccountId: accountId },
      take: 100,
      orderBy: { updatedAt: "desc" },
      include: {
        emagData: true,
        product: { select: { publicName: true } },
        variant: { select: { sku: true, gtin: true } },
      },
    });
  }

  listLogs(auth: RequestAuth, accountId: string) {
    return this.prisma.integrationRequestLog.findMany({
      where: { companyId: auth.companyId, channelAccountId: accountId },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }

  private async resolveFamilyTypeId(
    companyId: string,
    accountId: string,
    externalCategoryId: number,
    familyId: string | undefined,
    requestedFamilyTypeId: number | undefined,
  ) {
    if (!familyId) return requestedFamilyTypeId;
    const members = await this.prisma.productFamilyMember.findMany({
      where: { familyId },
      select: { variantId: true },
    });
    const variantIds = members.map((member) => member.variantId);
    if (!variantIds.length) return requestedFamilyTypeId;
    const siblingListing = await this.prisma.channelListing.findFirst({
      where: {
        companyId,
        channelAccountId: accountId,
        externalCategoryId: String(externalCategoryId),
        variantId: { in: variantIds },
        emagData: { is: { familyTypeId: { not: null } } },
      },
      select: { emagData: { select: { familyTypeId: true } } },
      orderBy: { updatedAt: "desc" },
    });
    const existingFamilyTypeId = siblingListing?.emagData?.familyTypeId;
    if (
      existingFamilyTypeId &&
      requestedFamilyTypeId &&
      existingFamilyTypeId !== requestedFamilyTypeId
    ) {
      throw new ConflictException({
        code: "EMAG_FAMILY_TYPE_MISMATCH",
        message:
          "All products in this family must use the same eMAG family type for the selected category",
        details: { existingFamilyTypeId, requestedFamilyTypeId },
      });
    }
    return requestedFamilyTypeId ?? existingFamilyTypeId ?? undefined;
  }

  private payloadSource(
    configuration: StoredEmagConfiguration,
    product: any,
    variant: any,
    category: any,
    input: UpsertEmagListingInput,
  ): EmagPayloadSource {
    const availability = variant.stockLevels.reduce(
      (sum: number, level: any) =>
        sum +
        Math.max(
          0,
          level.onHand -
            level.reserved -
            level.damaged -
            level.quarantined -
            level.safetyStock,
        ),
      0,
    );
    const assignments = [
      ...variant.imageAssignments,
      ...product.imageAssignments,
    ];
    const canonicalFamily =
      variant.familyMemberships?.[0]?.family ?? product.family;
    const family = canonicalFamily
      ? {
          id: canonicalFamily.sellerFamilyId ?? -1,
          name: canonicalFamily.name,
          familyTypeId: input.familyTypeId,
        }
      : input.sellerFamilyId === undefined
        ? null
        : {
            id: input.sellerFamilyId,
            name: input.familyName,
            familyTypeId: input.familyTypeId,
          };
    return {
      publicationPath: input.publicationPath,
      sellerProductId: input.sellerProductId,
      externalCategoryId: input.externalCategoryId,
      partNumberKey: input.partNumberKey,
      name: product.publicName,
      partNumber: product.manufacturerPartNumber ?? variant.sku,
      brand: product.brand?.name,
      description: product.description,
      sourceLanguage: configuration.sourceLanguage,
      productUrl: undefined,
      images: assignments.map((item: any) => ({
        url: item.image.publicUrl,
        role: item.role,
      })),
      gtin: variant.gtin,
      categoryRequiresEan: category.isEanMandatory,
      categoryRequiresWarranty: category.isWarrantyMandatory,
      warrantyMonths: input.warrantyMonths,
      characteristics: input.characteristicMappings,
      requiredCharacteristicIds: category.characteristics.map(
        (item: any) => item.externalId,
      ),
      salePrice: input.salePrice,
      recommendedPrice: input.recommendedPrice,
      minimumSalePrice: input.minimumSalePrice,
      maximumSalePrice: input.maximumSalePrice,
      vatId: input.vatId,
      handlingTimeId: input.handlingTimeId,
      supplyLeadTime: input.supplyLeadTime,
      startDate: input.startDate,
      emagGenius: input.emagGenius,
      offerStatus: input.offerStatus,
      stock: Math.max(0, availability - input.stockBuffer),
      greenTax: input.greenTax,
      family,
      allowedFamilyTypeIds: category.familyTypes.map(
        (item: any) => item.externalId,
      ),
      safetyInformation: product.safetyInformation,
      manufacturer: {
        name: product.manufacturerName,
        address: product.manufacturerAddress,
        email: product.manufacturerEmail,
      },
      euRepresentative: {
        name: product.euResponsiblePersonName,
        address: product.euResponsiblePersonAddress,
        email: product.euResponsiblePersonEmail,
      },
    };
  }

  private emagUpdateData(
    input: UpsertEmagListingInput,
  ): Prisma.EmagListingDataUncheckedUpdateInput {
    return {
      publicationPath: input.publicationPath,
      sellerProductId: input.sellerProductId,
      partNumberKey: input.partNumberKey,
      salePrice: new Prisma.Decimal(input.salePrice),
      recommendedPrice: input.recommendedPrice
        ? new Prisma.Decimal(input.recommendedPrice)
        : null,
      minimumSalePrice: input.minimumSalePrice
        ? new Prisma.Decimal(input.minimumSalePrice)
        : null,
      maximumSalePrice: input.maximumSalePrice
        ? new Prisma.Decimal(input.maximumSalePrice)
        : null,
      vatId: input.vatId,
      handlingTimeId: input.handlingTimeId,
      supplyLeadTime: input.supplyLeadTime,
      startDate: input.startDate ? new Date(input.startDate) : null,
      emagGenius: input.emagGenius,
      offerStatus: input.offerStatus,
      warrantyMonths: input.warrantyMonths,
      greenTax: input.greenTax ? new Prisma.Decimal(input.greenTax) : null,
      stockBuffer: input.stockBuffer,
      sellerFamilyId: input.sellerFamilyId,
      familyName: input.familyName,
      familyTypeId: input.familyTypeId,
      characteristicMappings:
        input.characteristicMappings as unknown as Prisma.InputJsonValue,
    };
  }

  private emagCreateData(
    channelListingId: string,
    input: UpsertEmagListingInput,
  ): Prisma.EmagListingDataUncheckedCreateInput {
    return Object.assign({}, this.emagUpdateData(input), {
      channelListingId,
    }) as Prisma.EmagListingDataUncheckedCreateInput;
  }

  private configuration(input: {
    marketplace?: string;
    mode?: string;
    apiUrl?: string;
    sourceLanguage?: string;
  }): StoredEmagConfiguration {
    const marketplace = (input.marketplace ?? "EMAG_RO") as EmagMarketplace;
    const sourceLanguages: Record<EmagMarketplace, string> = {
      EMAG_RO: "ro_RO",
      EMAG_BG: "bg_BG",
      EMAG_HU: "hu_HU",
      FASHION_DAYS_RO: "ro_RO",
      FASHION_DAYS_BG: "bg_BG",
    };
    return {
      marketplace,
      mode: input.mode === "live" ? "live" : "mock",
      apiUrl: input.apiUrl ?? marketplaceApiUrls[marketplace],
      sourceLanguage: input.sourceLanguage ?? sourceLanguages[marketplace],
    };
  }

  private readiness(
    configuration: StoredEmagConfiguration,
    hasCredentials: boolean,
  ) {
    const config: EmagConfig = {
      mode: configuration.mode,
      apiUrl: configuration.apiUrl,
      ...(hasCredentials
        ? { username: "configured", password: "configured" }
        : {}),
    };
    return getEmagReadiness(config);
  }
  private safeAccount(account: any) {
    const { encryptedCredentials: _secret, ...safe } = account;
    return {
      ...safe,
      readiness: this.readiness(
        account.configuration as StoredEmagConfiguration,
        Boolean(account.encryptedCredentials),
      ),
    };
  }
  private assertAccount(companyId: string, id: string) {
    return this.prisma.channelAccount
      .findFirst({ where: { id, companyId, type: "EMAG" } })
      .then((account) => {
        if (!account)
          throw new NotFoundException({
            code: "EMAG_ACCOUNT_NOT_FOUND",
            message: "eMAG account not found",
          });
        return account;
      });
  }
  private audit(
    auth: RequestAuth,
    action: string,
    entityId: string,
    after: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorId: auth.userId,
        action,
        entityType: "EmagIntegration",
        entityId,
        after,
      },
    });
  }
}
