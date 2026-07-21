import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ListingStatus } from "@prisma/client";
import type {
  CreateWebsiteApiCredentialInput,
  CreateWebsiteChannelInput,
  UpdateWebsiteChannelInput,
  UpsertCategoryMappingInput,
  UpsertWebsiteListingInput,
  WebsiteCatalogQuery,
} from "@plm/contracts";
import { randomBytes } from "node:crypto";
import type { RequestAuth, WebsiteRequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { hashWebsiteApiKey } from "./website-api-key.guard";

type WebsiteConfiguration = {
  domain: string;
  currency: string;
  language: string;
  stockBuffer: number;
};

type WebsiteListingMetadata = {
  price?: string;
  currency: string;
  stockBuffer: number;
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
  imageAssignmentIds: string[];
};

@Injectable()
export class WebsitesService {
  constructor(private readonly prisma: PrismaService) {}

  list(auth: RequestAuth) {
    return this.prisma.channelAccount.findMany({
      where: { companyId: auth.companyId, type: "WEBSITE" },
      orderBy: { name: "asc" },
      include: { _count: { select: { listings: true, websiteApiCredentials: true, categoryMappings: true } } },
    });
  }

  async create(auth: RequestAuth, input: CreateWebsiteChannelInput) {
    const { name, isActive, ...configuration } = input;
    try {
      const account = await this.prisma.channelAccount.create({
        data: { companyId: auth.companyId, type: "WEBSITE", name, isActive, configuration },
      });
      await this.audit(auth, "website.created", account.id, { name, configuration });
      return account;
    } catch (error) {
      this.handleUnique(error, "A website connection with this name already exists");
      throw error;
    }
  }

  async update(auth: RequestAuth, id: string, input: UpdateWebsiteChannelInput) {
    const account = await this.assertWebsite(auth.companyId, id);
    const current = account.configuration as WebsiteConfiguration;
    const { name, isActive, ...changes } = input;
    const updated = await this.prisma.channelAccount.update({
      where: { id },
      data: {
        ...(name === undefined ? {} : { name }),
        ...(isActive === undefined ? {} : { isActive }),
        configuration: { ...current, ...changes },
      },
    });
    await this.audit(auth, "website.updated", id, { name: updated.name, isActive: updated.isActive });
    return updated;
  }

  async issueCredential(auth: RequestAuth, websiteId: string, input: CreateWebsiteApiCredentialInput) {
    await this.assertWebsite(auth.companyId, websiteId);
    const prefix = randomBytes(6).toString("base64url");
    const apiKey = `plm_w_${prefix}_${randomBytes(32).toString("base64url")}`;
    const credential = await this.prisma.websiteApiCredential.create({
      data: {
        companyId: auth.companyId,
        channelAccountId: websiteId,
        name: input.name,
        keyPrefix: prefix,
        secretHash: hashWebsiteApiKey(apiKey),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdById: auth.userId,
      },
      select: { id: true, name: true, keyPrefix: true, expiresAt: true, createdAt: true },
    });
    await this.audit(auth, "website.api_key.issued", credential.id, { websiteId, keyPrefix: prefix });
    return { credential, apiKey, warning: "Copy this API key now. It cannot be retrieved later." };
  }

  async listCredentials(auth: RequestAuth, websiteId: string) {
    await this.assertWebsite(auth.companyId, websiteId);
    return this.prisma.websiteApiCredential.findMany({
      where: { companyId: auth.companyId, channelAccountId: websiteId },
      select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeCredential(auth: RequestAuth, websiteId: string, credentialId: string) {
    await this.assertWebsite(auth.companyId, websiteId);
    const credential = await this.prisma.websiteApiCredential.findFirst({
      where: { id: credentialId, companyId: auth.companyId, channelAccountId: websiteId },
    });
    if (!credential) throw new NotFoundException({ code: "WEBSITE_API_KEY_NOT_FOUND", message: "Website API key not found" });
    const updated = await this.prisma.websiteApiCredential.update({ where: { id: credentialId }, data: { revokedAt: new Date() } });
    await this.audit(auth, "website.api_key.revoked", credentialId, { websiteId });
    return { id: updated.id, revokedAt: updated.revokedAt };
  }

  async upsertCategoryMapping(auth: RequestAuth, websiteId: string, input: UpsertCategoryMappingInput) {
    await Promise.all([this.assertWebsite(auth.companyId, websiteId), this.assertCategory(auth.companyId, input.categoryId)]);
    const mapping = await this.prisma.categoryMapping.upsert({
      where: { categoryId_channelAccountId: { categoryId: input.categoryId, channelAccountId: websiteId } },
      create: {
        companyId: auth.companyId,
        channelAccountId: websiteId,
        categoryId: input.categoryId,
        externalCategoryId: input.externalCategoryId,
        externalName: input.externalName,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      update: { externalCategoryId: input.externalCategoryId, externalName: input.externalName, metadata: input.metadata as Prisma.InputJsonValue },
    });
    await this.audit(auth, "website.category_mapping.upserted", mapping.id, { websiteId, categoryId: input.categoryId });
    return mapping;
  }

  async upsertListing(auth: RequestAuth, websiteId: string, input: UpsertWebsiteListingInput) {
    await this.assertWebsite(auth.companyId, websiteId);
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, companyId: auth.companyId, deletedAt: null } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    if (input.variantId) {
      const variant = await this.prisma.productVariant.findFirst({ where: { id: input.variantId, productId: input.productId, companyId: auth.companyId, deletedAt: null } });
      if (!variant) throw new NotFoundException({ code: "VARIANT_NOT_FOUND", message: "Variant does not belong to this product" });
    }
    const existing = await this.prisma.channelListing.findFirst({
      where: { companyId: auth.companyId, channelAccountId: websiteId, productId: input.productId, variantId: input.variantId ?? null },
    });
    const websiteData: WebsiteListingMetadata = {
      price: input.price,
      currency: input.currency,
      stockBuffer: input.stockBuffer,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      slug: input.slug,
      imageAssignmentIds: input.imageAssignmentIds,
    };
    const data = {
      externalCategoryId: input.externalCategoryId,
      status: input.status as ListingStatus,
      synchronizationStatus: "SYNCED" as const,
      remoteMetadata: {},
      lastSyncedAt: new Date(),
    };
    const listing = existing
      ? await this.prisma.channelListing.update({ where: { id: existing.id }, data })
      : await this.prisma.channelListing.create({ data: { companyId: auth.companyId, channelAccountId: websiteId, productId: input.productId, variantId: input.variantId, ...data } });
    await this.prisma.websiteListingData.upsert({
      where: { channelListingId: listing.id },
      create: {
        channelListingId: listing.id,
        price: websiteData.price ? new Prisma.Decimal(websiteData.price) : null,
        currency: websiteData.currency,
        stockBuffer: websiteData.stockBuffer,
        seoTitle: websiteData.seoTitle,
        seoDescription: websiteData.seoDescription,
        slug: websiteData.slug,
        imageAssignmentIds: websiteData.imageAssignmentIds,
      },
      update: {
        price: websiteData.price ? new Prisma.Decimal(websiteData.price) : null,
        currency: websiteData.currency,
        stockBuffer: websiteData.stockBuffer,
        seoTitle: websiteData.seoTitle,
        seoDescription: websiteData.seoDescription,
        slug: websiteData.slug,
        imageAssignmentIds: websiteData.imageAssignmentIds,
      },
    });
    await this.audit(auth, "website.listing.upserted", listing.id, { websiteId, status: listing.status });
    return listing;
  }

  listMappings(auth: RequestAuth, websiteId: string) {
    return this.prisma.categoryMapping.findMany({
      where: { companyId: auth.companyId, channelAccountId: websiteId },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { externalName: "asc" },
    });
  }

  async categories(auth: WebsiteRequestAuth) {
    return this.prisma.categoryMapping.findMany({
      where: { companyId: auth.companyId, channelAccountId: auth.channelAccountId, category: { isActive: true } },
      select: { externalCategoryId: true, externalName: true, metadata: true, category: { select: { id: true, name: true, slug: true, description: true, parentId: true } } },
      orderBy: { category: { name: "asc" } },
    });
  }

  async catalog(auth: WebsiteRequestAuth, query: WebsiteCatalogQuery) {
    const listings = await this.prisma.channelListing.findMany({
      where: {
        companyId: auth.companyId,
        channelAccountId: auth.channelAccountId,
        status: "PUBLISHED",
        ...(query.category ? { OR: [{ externalCategoryId: query.category }, { product: { category: { slug: query.category } } }] } : {}),
        ...(query.search ? { product: { OR: [{ publicName: { contains: query.search, mode: "insensitive" } }, { variants: { some: { sku: { contains: query.search, mode: "insensitive" } } } }] } } : {}),
      },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
      orderBy: this.catalogOrder(query.sort),
      include: this.catalogInclude(),
    });
    const hasMore = listings.length > query.limit;
    const page = listings.slice(0, query.limit).map((listing) => this.toWebsiteProduct(listing));
    return { data: page, pageInfo: { hasMore, nextCursor: hasMore ? listings[query.limit - 1]?.id : null } };
  }

  async detail(auth: WebsiteRequestAuth, slug: string) {
    const listing = await this.prisma.channelListing.findFirst({
      where: {
        companyId: auth.companyId,
        channelAccountId: auth.channelAccountId,
        status: "PUBLISHED",
        OR: [{ product: { slug } }, { websiteData: { slug } }],
      },
      include: this.catalogInclude(),
    });
    if (!listing) throw new NotFoundException({ code: "WEBSITE_PRODUCT_NOT_FOUND", message: "Published website product not found" });
    return this.toWebsiteProduct(listing);
  }

  private catalogInclude() {
    return {
      websiteData: true,
      product: {
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          attributeValues: { include: { definition: { select: { key: true, displayName: true, dataType: true } } } },
          imageAssignments: { include: { image: true }, orderBy: { position: "asc" as const } },
        },
      },
      variant: {
        include: {
          attributeValues: { include: { definition: { select: { key: true, displayName: true, dataType: true } } } },
          imageAssignments: { include: { image: true }, orderBy: { position: "asc" as const } },
          stockLevels: true,
        },
      },
    };
  }

  private catalogOrder(sort: WebsiteCatalogQuery["sort"]): Prisma.ChannelListingOrderByWithRelationInput[] {
    if (sort === "name_asc") return [{ product: { publicName: "asc" } }, { id: "asc" }];
    if (sort === "price_asc") return [{ websiteData: { price: { sort: "asc", nulls: "last" } } }, { id: "asc" }];
    if (sort === "price_desc") return [{ websiteData: { price: { sort: "desc", nulls: "last" } } }, { id: "asc" }];
    return [{ updatedAt: "desc" }, { id: "asc" }];
  }

  private toWebsiteProduct(listing: any) {
    const metadata = (listing.websiteData ?? {}) as WebsiteListingMetadata;
    const variant = listing.variant;
    const configStockBuffer = metadata.stockBuffer ?? 0;
    const available = variant
      ? variant.stockLevels.reduce((sum: number, level: any) => sum + Math.max(0, level.onHand - level.reserved - level.damaged - level.quarantined - level.safetyStock), 0)
      : null;
    const assignments = [...(variant?.imageAssignments ?? []), ...(listing.product?.imageAssignments ?? [])];
    const selected = metadata.imageAssignmentIds?.length
      ? assignments.filter((item: any) => metadata.imageAssignmentIds.includes(item.id))
      : assignments;
    return {
      id: listing.id,
      slug: metadata.slug ?? listing.product.slug,
      name: listing.product.publicName,
      shortName: listing.product.shortName,
      description: listing.product.description,
      shortDescription: listing.product.shortDescription,
      seo: { title: metadata.seoTitle ?? listing.product.seoTitle, description: metadata.seoDescription ?? listing.product.seoDescription },
      brand: listing.product.brand,
      category: listing.product.category,
      variant: variant ? { id: variant.id, sku: variant.sku, gtin: variant.gtin, name: variant.variantName, variationValues: variant.variationValues } : null,
      price: { amount: metadata.price ?? variant?.basePrice?.toString() ?? null, currency: metadata.currency ?? variant?.currency ?? listing.product.defaultCurrency },
      stock: available === null ? null : { available: Math.max(0, available - configStockBuffer), inStock: available - configStockBuffer > 0 },
      images: selected.filter((item: any) => item.image.processingStatus === "READY").map((item: any) => ({ role: item.role, position: item.position, altText: item.altText, url: item.image.publicUrl, thumbnailUrl: item.image.thumbnailUrl, mediumUrl: item.image.mediumUrl })),
      attributes: [
        ...listing.product.attributeValues.map((item: any) => ({ key: item.definition.key, name: item.definition.displayName, value: item.value })),
        ...(variant?.attributeValues ?? []).map((item: any) => ({ key: item.definition.key, name: item.definition.displayName, value: item.value })),
      ],
      updatedAt: listing.updatedAt,
    };
  }

  private assertWebsite(companyId: string, id: string) {
    return this.prisma.channelAccount.findFirst({ where: { id, companyId, type: "WEBSITE" } }).then((account) => {
      if (!account) throw new NotFoundException({ code: "WEBSITE_NOT_FOUND", message: "Website connection not found" });
      return account;
    });
  }

  private assertCategory(companyId: string, id: string) {
    return this.prisma.category.findFirst({ where: { id, companyId } }).then((category) => {
      if (!category) throw new NotFoundException({ code: "CATEGORY_NOT_FOUND", message: "Category not found" });
      return category;
    });
  }

  private audit(auth: RequestAuth, action: string, entityId: string, after: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { companyId: auth.companyId, actorId: auth.userId, action, entityType: "WebsiteChannel", entityId, after } });
  }

  private handleUnique(error: unknown, message: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "UNIQUE_CONFLICT", message });
  }
}
