import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  GtinType,
  Prisma,
  ProductStatus,
  type ProductType,
} from "@prisma/client";
import {
  gtinTypeFor,
  type CreateProductInput,
  type CreateVariantInput,
  type UpdateVariantInput,
  type UpdateProductInput,
} from "@plm/contracts";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { sanitizeRichText, slugify, variationKey } from "./catalog.utils";
import type { ListProductsQuery } from "./dto/list-products.query";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: RequestAuth, query: ListProductsQuery) {
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      companyId: auth.companyId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { internalName: { contains: search, mode: "insensitive" } },
              { publicName: { contains: search, mode: "insensitive" } },
              {
                variants: {
                  some: { sku: { contains: search, mode: "insensitive" } },
                },
              },
              { variants: { some: { gtin: { contains: search } } } },
              { brand: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.product.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        productType: true,
        status: true,
        internalName: true,
        publicName: true,
        slug: true,
        updatedAt: true,
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ isDefaultVariant: "desc" }, { createdAt: "asc" }],
          take: 3,
          select: {
            id: true,
            sku: true,
            gtin: true,
            variantName: true,
            status: true,
            basePrice: true,
            currency: true,
            isDefaultVariant: true,
          },
        },
        _count: { select: { variants: true } },
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      page: {
        limit,
        nextCursor: hasMore ? items.at(-1)?.id : undefined,
        hasMore,
      },
    };
  }

  async get(auth: RequestAuth, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: null },
      include: {
        brand: true,
        category: true,
        family: { include: { members: { orderBy: { position: "asc" } } } },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ isDefaultVariant: "desc" }, { createdAt: "asc" }],
          include: {
            gtinAssignment: true,
            gs1Registration: true,
            attributeValues: { include: { definition: true } },
            familyMemberships: {
              include: {
                family: {
                  include: { members: { orderBy: { position: "asc" } } },
                },
              },
            },
          },
        },
        attributeValues: { include: { definition: true } },
        imageAssignments: {
          orderBy: { position: "asc" },
          include: { image: true },
        },
      },
    });
    if (!product) throw this.notFound();
    const family =
      product.family ??
      product.variants.flatMap((variant) =>
        variant.familyMemberships.map((membership) => membership.family),
      )[0];
    return { ...product, family };
  }

  listVariants(auth: RequestAuth) {
    return this.prisma.productVariant.findMany({
      where: {
        companyId: auth.companyId,
        deletedAt: null,
        product: { deletedAt: null },
      },
      orderBy: [{ product: { publicName: "asc" } }, { sku: "asc" }],
      take: 2_000,
      select: {
        id: true,
        sku: true,
        gtin: true,
        variantName: true,
        status: true,
        basePrice: true,
        currency: true,
        variationValues: true,
        product: { select: { id: true, publicName: true, productType: true } },
      },
    });
  }

  async create(auth: RequestAuth, input: CreateProductInput) {
    await this.assertReferences(
      auth.companyId,
      input.brandId,
      input.categoryId,
    );
    const slug = await this.uniqueSlug(
      auth.companyId,
      input.slug ?? slugify(input.publicName),
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const { defaultVariant, family, existingFamilyId, ...productInput } =
          input;
        const product = await transaction.product.create({
          data: {
            companyId: auth.companyId,
            productType: productInput.productType as ProductType,
            status: productInput.status as ProductStatus,
            internalName: productInput.internalName,
            publicName: productInput.publicName,
            shortName: productInput.shortName,
            slug,
            brandId: productInput.brandId,
            categoryId: productInput.categoryId,
            description: sanitizeRichText(productInput.description),
            shortDescription: sanitizeRichText(productInput.shortDescription),
            gs1LabelDescription: productInput.gs1LabelDescription,
            safetyInformation: sanitizeRichText(productInput.safetyInformation),
            manufacturerPartNumber: productInput.manufacturerPartNumber,
            manufacturerName: productInput.manufacturerName,
            manufacturerAddress: productInput.manufacturerAddress,
            manufacturerEmail: productInput.manufacturerEmail,
            euResponsiblePersonName: productInput.euResponsiblePersonName,
            euResponsiblePersonAddress: productInput.euResponsiblePersonAddress,
            euResponsiblePersonEmail: productInput.euResponsiblePersonEmail,
            seoTitle: productInput.seoTitle,
            seoDescription: productInput.seoDescription,
            defaultLanguage: productInput.defaultLanguage,
            taxClass: productInput.taxClass,
            defaultVatRate: productInput.defaultVatRate,
            defaultCurrency: productInput.defaultCurrency,
            weight: productInput.weight,
            weightUnit: productInput.weightUnit,
            length: productInput.length,
            width: productInput.width,
            height: productInput.height,
            diameter: productInput.diameter,
            dimensionUnit: productInput.dimensionUnit,
            createdById: auth.userId,
            updatedById: auth.userId,
          },
        });

        const createdVariant = defaultVariant
          ? await this.createVariantRecord(transaction, auth, product.id, {
              ...defaultVariant,
              isDefaultVariant: true,
            })
          : undefined;

        if (family && createdVariant) {
          const axes = [] as Array<{
            attributeDefinitionId: string;
            key: string;
            label: string;
          }>;
          for (const requestedAxis of family.variationAxes) {
            const existing = await transaction.attributeDefinition.findUnique({
              where: {
                companyId_key: {
                  companyId: auth.companyId,
                  key: requestedAxis.key,
                },
              },
              select: { id: true, key: true, scope: true, isActive: true },
            });
            if (
              existing &&
              (existing.scope !== "VARIANT" || !existing.isActive)
            ) {
              throw new ConflictException({
                code: "FAMILY_AXIS_CONFLICT",
                message: `The key ${requestedAxis.key} already belongs to a non-variant or inactive attribute`,
                fields: [requestedAxis.key],
              });
            }
            const definition =
              existing ??
              (await transaction.attributeDefinition.create({
                data: {
                  companyId: auth.companyId,
                  key: requestedAxis.key,
                  displayName: requestedAxis.label,
                  description: `Variation axis created with product family ${family.name}`,
                  dataType: "SHORT_TEXT",
                  scope: "VARIANT",
                  isFilterable: true,
                  isComparable: true,
                  visibility: "PUBLIC",
                },
                select: { id: true, key: true, scope: true, isActive: true },
              }));
            axes.push({
              attributeDefinitionId: definition.id,
              key: definition.key,
              label: requestedAxis.label,
            });
          }
          await transaction.productFamily.create({
            data: {
              companyId: auth.companyId,
              productId: product.id,
              sellerFamilyId: family.sellerFamilyId,
              code: family.code.toUpperCase(),
              name: family.name,
              description: family.description,
              variationAxes: axes as unknown as Prisma.InputJsonValue,
              members: {
                create: [{ variantId: createdVariant.id, position: 0 }],
              },
            },
          });
        }

        if (existingFamilyId && createdVariant) {
          const existingFamily = await transaction.productFamily.findFirst({
            where: {
              id: existingFamilyId,
              companyId: auth.companyId,
              status: { not: "ARCHIVED" },
            },
            select: {
              id: true,
              variationAxes: true,
              _count: { select: { members: true } },
            },
          });
          if (!existingFamily)
            throw new NotFoundException({
              code: "FAMILY_NOT_FOUND",
              message: "The selected product family was not found",
            });
          const axes = this.readFamilyAxes(existingFamily.variationAxes);
          const missing = axes.filter(
            (axis) => !defaultVariant?.variationValues[axis.key]?.trim(),
          );
          if (missing.length) {
            throw new ConflictException({
              code: "FAMILY_VARIATION_INCOMPLETE",
              message: `Complete the family choices: ${missing.map((axis) => axis.label).join(", ")}`,
              fields: missing.map((axis) => axis.key),
            });
          }
          const requestedCombination = variationKey(
            Object.fromEntries(
              axes.map((axis) => [
                axis.key,
                defaultVariant!.variationValues[axis.key]!,
              ]),
            ),
          );
          const members = await transaction.productFamilyMember.findMany({
            where: { familyId: existingFamily.id },
            select: { variant: { select: { variationValues: true } } },
          });
          const duplicate = members.some(({ variant }) => {
            const values =
              variant.variationValues &&
              typeof variant.variationValues === "object" &&
              !Array.isArray(variant.variationValues)
                ? (variant.variationValues as Record<string, unknown>)
                : {};
            return (
              variationKey(
                Object.fromEntries(
                  axes.map((axis) => [
                    axis.key,
                    String(values[axis.key] ?? ""),
                  ]),
                ),
              ) === requestedCombination
            );
          });
          if (duplicate)
            throw new ConflictException({
              code: "FAMILY_VARIATION_DUPLICATE",
              message:
                "This family already contains a product with the same choices",
            });
          await transaction.productFamilyMember.create({
            data: {
              familyId: existingFamily.id,
              variantId: createdVariant.id,
              position: existingFamily._count.members,
            },
          });
        }

        await transaction.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorId: auth.userId,
            action: "product.created",
            entityType: "Product",
            entityId: product.id,
            after: {
              productType: product.productType,
              status: product.status,
              publicName: product.publicName,
              slug,
            },
          },
        });
        return transaction.product.findUniqueOrThrow({
          where: { id: product.id },
          include: {
            variants: true,
            brand: true,
            category: true,
            family: { include: { members: true } },
          },
        });
      });
    } catch (error: unknown) {
      this.handleUniqueConflict(error);
      throw error;
    }
  }

  async update(auth: RequestAuth, id: string, input: UpdateProductInput) {
    const before = await this.prisma.product.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: null },
    });
    if (!before) throw this.notFound();
    await this.assertReferences(
      auth.companyId,
      input.brandId,
      input.categoryId,
    );

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...input,
        description: sanitizeRichText(input.description),
        shortDescription: sanitizeRichText(input.shortDescription),
        safetyInformation: sanitizeRichText(input.safetyInformation),
        updatedById: auth.userId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorId: auth.userId,
        action: "product.updated",
        entityType: "Product",
        entityId: id,
        before: {
          status: before.status,
          publicName: before.publicName,
          slug: before.slug,
        },
        after: {
          status: updated.status,
          publicName: updated.publicName,
          slug: updated.slug,
        },
      },
    });
    return updated;
  }

  async archive(auth: RequestAuth, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!product) throw this.notFound();

    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          updatedById: auth.userId,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: "product.archived",
          entityType: "Product",
          entityId: id,
          before: { status: product.status },
          after: { status: "ARCHIVED" },
        },
      }),
    ]);
  }

  async createVariant(
    auth: RequestAuth,
    productId: string,
    input: CreateVariantInput,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: auth.companyId, deletedAt: null },
      select: {
        id: true,
        family: {
          select: {
            id: true,
            variationAxes: true,
            _count: { select: { members: true } },
          },
        },
      },
    });
    if (!product) throw this.notFound();

    const existingVariantCount = await this.prisma.productVariant.count({
      where: { productId, companyId: auth.companyId, deletedAt: null },
    });
    if (existingVariantCount > 0) {
      throw new ConflictException({
        code: "PRODUCT_ALREADY_HAS_SELLABLE_IDENTITY",
        message:
          "A sellable product can contain only one SKU/EAN. Create another product and add it to the same family.",
      });
    }

    const familyAxes = product.family
      ? this.readFamilyAxes(product.family.variationAxes)
      : [];
    if (product.family) {
      const missing = familyAxes.filter(
        (axis) => !input.variationValues[axis.key]?.trim(),
      );
      if (missing.length) {
        throw new ConflictException({
          code: "FAMILY_VARIATION_INCOMPLETE",
          message: `Complete the family choices: ${missing.map((axis) => axis.label).join(", ")}`,
          fields: missing.map((axis) => axis.key),
        });
      }
      const requestedCombination = variationKey(
        Object.fromEntries(
          familyAxes.map((axis) => [
            axis.key,
            input.variationValues[axis.key]!,
          ]),
        ),
      );
      const members = await this.prisma.productFamilyMember.findMany({
        where: { familyId: product.family.id },
        select: { variant: { select: { id: true, variationValues: true } } },
      });
      const duplicate = members.find(({ variant }) => {
        const values =
          variant.variationValues &&
          typeof variant.variationValues === "object" &&
          !Array.isArray(variant.variationValues)
            ? (variant.variationValues as Record<string, unknown>)
            : {};
        return (
          variationKey(
            Object.fromEntries(
              familyAxes.map((axis) => [
                axis.key,
                String(values[axis.key] ?? ""),
              ]),
            ),
          ) === requestedCombination
        );
      });
      if (duplicate) {
        throw new ConflictException({
          code: "FAMILY_VARIATION_DUPLICATE",
          message: "This family already has a variant with the same choices",
        });
      }
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (input.isDefaultVariant) {
          await transaction.productVariant.updateMany({
            where: { productId, companyId: auth.companyId },
            data: { isDefaultVariant: false },
          });
        }
        const variant = await this.createVariantRecord(
          transaction,
          auth,
          productId,
          input,
        );
        if (product.family) {
          await transaction.productFamilyMember.create({
            data: {
              familyId: product.family.id,
              variantId: variant.id,
              position: product.family._count.members,
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorId: auth.userId,
            action: "variant.created",
            entityType: "ProductVariant",
            entityId: variant.id,
            after: {
              productId,
              sku: variant.sku,
              gtin: variant.gtin,
              variationKey: variant.variationKey,
            },
          },
        });
        return variant;
      });
    } catch (error: unknown) {
      this.handleUniqueConflict(error);
      throw error;
    }
  }

  async updateVariant(
    auth: RequestAuth,
    productId: string,
    variantId: string,
    input: UpdateVariantInput,
  ) {
    const before = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId,
        companyId: auth.companyId,
        deletedAt: null,
      },
    });
    if (!before)
      throw new NotFoundException({
        code: "VARIANT_NOT_FOUND",
        message: "Variant not found",
      });
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (input.isDefaultVariant)
          await transaction.productVariant.updateMany({
            where: {
              productId,
              companyId: auth.companyId,
              id: { not: variantId },
              deletedAt: null,
            },
            data: { isDefaultVariant: false },
          });
        const variant = await transaction.productVariant.update({
          where: { id: variantId },
          data: {
            sku: input.sku?.toUpperCase(),
            internalNumericId: input.internalNumericId,
            variantName: input.variantName,
            status: input.status as ProductStatus | undefined,
            gtin: input.gtin,
            gtinType: input.gtin
              ? (gtinTypeFor(input.gtin) as GtinType)
              : input.gtin === null
                ? null
                : undefined,
            basePrice: input.basePrice,
            costPrice: input.costPrice,
            currency: input.currency,
            isDefaultVariant: input.isDefaultVariant,
            weight: input.weight,
            weightUnit: input.weightUnit,
            length: input.length,
            width: input.width,
            height: input.height,
            diameter: input.diameter,
            dimensionUnit: input.dimensionUnit,
            variationValues: input.variationValues,
            variationKey: input.variationValues
              ? variationKey(input.variationValues)
              : undefined,
            updatedById: auth.userId,
          },
        });
        await transaction.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorId: auth.userId,
            action: "variant.updated",
            entityType: "ProductVariant",
            entityId: variant.id,
            before: {
              sku: before.sku,
              gtin: before.gtin,
              status: before.status,
            },
            after: {
              sku: variant.sku,
              gtin: variant.gtin,
              status: variant.status,
            },
          },
        });
        return variant;
      });
    } catch (error) {
      this.handleUniqueConflict(error);
      throw error;
    }
  }

  async archiveVariant(
    auth: RequestAuth,
    productId: string,
    variantId: string,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId,
        companyId: auth.companyId,
        deletedAt: null,
      },
    });
    if (!variant)
      throw new NotFoundException({
        code: "VARIANT_NOT_FOUND",
        message: "Variant not found",
      });
    const remaining = await this.prisma.productVariant.findMany({
      where: {
        productId,
        companyId: auth.companyId,
        id: { not: variantId },
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!remaining.length)
      throw new ConflictException({
        code: "LAST_VARIANT_REQUIRED",
        message: "A product must retain at least one sellable variant",
      });
    await this.prisma.$transaction([
      this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          isDefaultVariant: false,
          updatedById: auth.userId,
        },
      }),
      ...(variant.isDefaultVariant
        ? [
            this.prisma.productVariant.update({
              where: { id: remaining[0]!.id },
              data: { isDefaultVariant: true, updatedById: auth.userId },
            }),
          ]
        : []),
      this.prisma.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: "variant.archived",
          entityType: "ProductVariant",
          entityId: variantId,
          before: { status: variant.status },
          after: { status: "ARCHIVED" },
        },
      }),
    ]);
  }

  private createVariantRecord(
    transaction: Prisma.TransactionClient,
    auth: RequestAuth,
    productId: string,
    input: CreateVariantInput,
  ) {
    const detectedGtinType = input.gtin ? gtinTypeFor(input.gtin) : undefined;
    return transaction.productVariant.create({
      data: {
        companyId: auth.companyId,
        productId,
        sku: input.sku.toUpperCase(),
        internalNumericId: input.internalNumericId,
        variantName: input.variantName,
        status: input.status as ProductStatus,
        gtin: input.gtin,
        gtinType: detectedGtinType as GtinType | undefined,
        basePrice: input.basePrice,
        costPrice: input.costPrice,
        currency: input.currency,
        weight: input.weight,
        weightUnit: input.weightUnit,
        length: input.length,
        width: input.width,
        height: input.height,
        diameter: input.diameter,
        dimensionUnit: input.dimensionUnit,
        isDefaultVariant: input.isDefaultVariant,
        variationValues: input.variationValues,
        variationKey: variationKey(input.variationValues),
        createdById: auth.userId,
        updatedById: auth.userId,
      },
    });
  }

  private async assertReferences(
    companyId: string,
    brandId?: string,
    categoryId?: string,
  ) {
    if (brandId) {
      const count = await this.prisma.brand.count({
        where: { id: brandId, companyId },
      });
      if (!count)
        throw new NotFoundException({
          code: "BRAND_NOT_FOUND",
          message: "Brand not found in this workspace",
        });
    }
    if (categoryId) {
      const count = await this.prisma.category.count({
        where: { id: categoryId, companyId },
      });
      if (!count)
        throw new NotFoundException({
          code: "CATEGORY_NOT_FOUND",
          message: "Category not found in this workspace",
        });
    }
  }

  private readFamilyAxes(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((axis) => {
      if (!axis || typeof axis !== "object" || Array.isArray(axis)) return [];
      const key = axis.key;
      const label = axis.label;
      return typeof key === "string" && typeof label === "string"
        ? [{ key, label }]
        : [];
    });
  }

  private async uniqueSlug(companyId: string, requested: string) {
    const base = slugify(requested) || "product";
    for (let suffix = 0; suffix < 100; suffix++) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const exists = await this.prisma.product.count({
        where: { companyId, slug: candidate },
      });
      if (!exists) return candidate;
    }
    throw new ConflictException({
      code: "SLUG_EXHAUSTED",
      message: "Could not allocate a unique product slug",
    });
  }

  private handleUniqueConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException({
        code: "CATALOG_UNIQUE_CONFLICT",
        message:
          "SKU, GTIN, numeric ID, slug, or variant combination already exists",
        fields: error.meta?.target,
      });
    }
  }

  private notFound() {
    return new NotFoundException({
      code: "PRODUCT_NOT_FOUND",
      message: "Product not found",
    });
  }
}
