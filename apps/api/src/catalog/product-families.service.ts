import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProductStatus } from "@prisma/client";
import type {
  AddFamilyMemberInput,
  CreateProductFamilyInput,
  UpdateProductFamilyInput,
} from "@plm/contracts";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { variationKey } from "./catalog.utils";

type FamilyAxis = {
  attributeDefinitionId: string;
  key: string;
  label: string;
};

@Injectable()
export class ProductFamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  list(auth: RequestAuth) {
    return this.prisma.productFamily.findMany({
      where: { companyId: auth.companyId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        product: {
          select: {
            id: true,
            publicName: true,
            internalName: true,
            status: true,
          },
        },
        _count: { select: { members: true } },
      },
    });
  }

  async get(auth: RequestAuth, id: string) {
    const family = await this.prisma.productFamily.findFirst({
      where: { id, companyId: auth.companyId },
      include: {
        product: true,
        members: {
          orderBy: [{ position: "asc" }, { variantId: "asc" }],
          include: {
            variant: {
              include: {
                attributeValues: { include: { definition: true } },
                imageAssignments: {
                  orderBy: { position: "asc" },
                  include: { image: true },
                },
              },
            },
          },
        },
      },
    });
    if (!family) throw this.notFound();
    return family;
  }

  async create(auth: RequestAuth, input: CreateProductFamilyInput) {
    const parent = await this.prisma.product.findFirst({
      where: {
        id: input.productId,
        companyId: auth.companyId,
        deletedAt: null,
      },
      select: { id: true, productType: true, family: { select: { id: true } } },
    });
    if (!parent) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Parent product not found",
      });
    }
    if (parent.family) {
      throw new ConflictException({
        code: "PRODUCT_ALREADY_HAS_FAMILY",
        message: "This parent product already belongs to a family",
      });
    }

    const axes = await this.loadAxes(auth.companyId, input.variationAxes);
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: { in: input.variantIds },
        companyId: auth.companyId,
        deletedAt: null,
      },
      select: { id: true, productId: true, variationValues: true },
    });
    if (variants.length !== input.variantIds.length) {
      throw new BadRequestException({
        code: "FAMILY_VARIANT_INVALID",
        message:
          "Every family member must be an active variant of the selected parent product",
      });
    }
    if (
      new Set(variants.map((variant) => variant.productId)).size !==
      variants.length
    ) {
      throw new BadRequestException({
        code: "FAMILY_PRODUCT_DUPLICATE",
        message:
          "A product family may contain only one sellable SKU from each product",
      });
    }
    this.assertVariationCombinations(axes, variants);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const family = await transaction.productFamily.create({
          data: {
            companyId: auth.companyId,
            productId: parent.id,
            sellerFamilyId: input.sellerFamilyId,
            code: input.code.toUpperCase(),
            name: input.name,
            description: input.description,
            variationAxes: axes as unknown as Prisma.InputJsonValue,
            members: {
              create: input.variantIds.map((variantId, position) => ({
                variantId,
                position,
              })),
            },
          },
          include: {
            product: true,
            members: {
              orderBy: { position: "asc" },
              include: { variant: true },
            },
          },
        });
        await transaction.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorId: auth.userId,
            action: "product_family.created",
            entityType: "ProductFamily",
            entityId: family.id,
            after: {
              code: family.code,
              productId: parent.id,
              variantIds: input.variantIds,
              variationAxes: axes,
            },
          },
        });
        return family;
      });
    } catch (error: unknown) {
      this.handleUniqueConflict(error);
      throw error;
    }
  }

  async update(auth: RequestAuth, id: string, input: UpdateProductFamilyInput) {
    const before = await this.prisma.productFamily.findFirst({
      where: { id, companyId: auth.companyId },
    });
    if (!before) throw this.notFound();

    const axes = input.variationAxes
      ? await this.loadAxes(auth.companyId, input.variationAxes)
      : undefined;
    if (axes) {
      const members = await this.prisma.productFamilyMember.findMany({
        where: { familyId: id },
        select: { variant: { select: { id: true, variationValues: true } } },
      });
      this.assertVariationCombinations(
        axes,
        members.map((member) => member.variant),
      );
    }

    const family = await this.prisma.productFamily.update({
      where: { id },
      data: {
        sellerFamilyId: input.sellerFamilyId,
        code: input.code?.toUpperCase(),
        name: input.name,
        description: input.description,
        status: input.status as ProductStatus | undefined,
        ...(axes
          ? { variationAxes: axes as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.channelMetadata === undefined
          ? {}
          : {
              channelMetadata: input.channelMetadata as Prisma.InputJsonValue,
            }),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorId: auth.userId,
        action: "product_family.updated",
        entityType: "ProductFamily",
        entityId: family.id,
        before: { code: before.code, name: before.name, status: before.status },
        after: { code: family.code, name: family.name, status: family.status },
      },
    });
    return family;
  }

  async addMember(
    auth: RequestAuth,
    familyId: string,
    input: AddFamilyMemberInput,
  ) {
    const family = await this.prisma.productFamily.findFirst({
      where: { id: familyId, companyId: auth.companyId },
      select: { id: true, productId: true, variationAxes: true },
    });
    if (!family) throw this.notFound();
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: input.variantId,
        companyId: auth.companyId,
        deletedAt: null,
      },
      select: { id: true, productId: true, variationValues: true },
    });
    if (!variant) {
      throw new BadRequestException({
        code: "FAMILY_VARIANT_INVALID",
        message:
          "The member must be an active variant of the family parent product",
      });
    }

    const axes = this.readAxes(family.variationAxes);
    const existing = await this.prisma.productFamilyMember.findMany({
      where: { familyId },
      select: {
        variant: {
          select: { id: true, productId: true, variationValues: true },
        },
      },
    });
    if (existing.some((item) => item.variant.productId === variant.productId)) {
      throw new ConflictException({
        code: "FAMILY_PRODUCT_DUPLICATE",
        message: "This product is already represented in the family",
      });
    }
    this.assertVariationCombinations(axes, [
      ...existing.map((item) => item.variant),
      variant,
    ]);

    try {
      const member = await this.prisma.$transaction(async (transaction) => {
        if (existing.length === 0 && family.productId !== variant.productId) {
          await transaction.productFamily.update({
            where: { id: familyId },
            data: { productId: variant.productId },
          });
        }
        const created = await transaction.productFamilyMember.create({
          data: { familyId, variantId: variant.id, position: input.position },
          include: { variant: true },
        });
        await transaction.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorId: auth.userId,
            action: "product_family.member_added",
            entityType: "ProductFamily",
            entityId: familyId,
            after: { variantId: variant.id, position: input.position },
          },
        });
        return created;
      });
      return member;
    } catch (error: unknown) {
      this.handleUniqueConflict(error);
      throw error;
    }
  }

  async removeMember(auth: RequestAuth, familyId: string, variantId: string) {
    const family = await this.prisma.productFamily.findFirst({
      where: { id: familyId, companyId: auth.companyId },
      select: { id: true, productId: true },
    });
    if (!family) throw this.notFound();
    const member = await this.prisma.productFamilyMember.findUnique({
      where: { familyId_variantId: { familyId, variantId } },
      select: { variant: { select: { productId: true } } },
    });
    if (!member) {
      throw new NotFoundException({
        code: "FAMILY_MEMBER_NOT_FOUND",
        message: "Product family member not found",
      });
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.productFamilyMember.delete({
        where: { familyId_variantId: { familyId, variantId } },
      });
      if (member.variant.productId === family.productId) {
        const replacement = await transaction.productFamilyMember.findFirst({
          where: { familyId },
          orderBy: [{ position: "asc" }, { variantId: "asc" }],
          select: { variant: { select: { productId: true } } },
        });
        if (replacement) {
          await transaction.productFamily.update({
            where: { id: familyId },
            data: { productId: replacement.variant.productId },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: "product_family.member_removed",
          entityType: "ProductFamily",
          entityId: familyId,
          before: { variantId },
        },
      });
    });
  }

  private async loadAxes(
    companyId: string,
    requested: CreateProductFamilyInput["variationAxes"],
  ): Promise<FamilyAxis[]> {
    const ids = requested.map((axis) => axis.attributeDefinitionId);
    const definitions = await this.prisma.attributeDefinition.findMany({
      where: { id: { in: ids }, companyId, scope: "VARIANT", isActive: true },
      select: { id: true, key: true },
    });
    if (definitions.length !== ids.length) {
      throw new BadRequestException({
        code: "FAMILY_AXIS_INVALID",
        message:
          "Every variation axis must be an active VARIANT attribute in this workspace",
      });
    }
    const byId = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    return requested.map((axis) => ({
      ...axis,
      key: byId.get(axis.attributeDefinitionId)?.key ?? "",
    }));
  }

  private readAxes(value: Prisma.JsonValue): FamilyAxis[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException({
        code: "FAMILY_AXIS_INVALID",
        message: "The family variation axes are invalid",
      });
    }
    const axes = value.filter(
      (axis): axis is Prisma.JsonObject =>
        Boolean(axis) && typeof axis === "object" && !Array.isArray(axis),
    );
    if (
      axes.length !== value.length ||
      axes.some(
        (axis) =>
          typeof axis.attributeDefinitionId !== "string" ||
          typeof axis.key !== "string" ||
          typeof axis.label !== "string",
      )
    ) {
      throw new BadRequestException({
        code: "FAMILY_AXIS_INVALID",
        message: "The family variation axes are invalid",
      });
    }
    return axes.map((axis) => ({
      attributeDefinitionId: axis.attributeDefinitionId as string,
      key: axis.key as string,
      label: axis.label as string,
    }));
  }

  private assertVariationCombinations(
    axes: FamilyAxis[],
    variants: Array<{ id: string; variationValues: Prisma.JsonValue }>,
  ) {
    const axisKeys = axes.map((axis) => axis.key);
    const seen = new Map<string, string>();
    for (const variant of variants) {
      const values = this.variationValues(variant.id, variant.variationValues);
      const missing = axisKeys.filter((key) => !values[key]?.trim());
      if (missing.length) {
        throw new BadRequestException({
          code: "FAMILY_VARIATION_INCOMPLETE",
          message: "Every family variant must define all variation axes",
          entity: { type: "ProductVariant", id: variant.id },
          fields: missing,
        });
      }
      const combination = variationKey(
        Object.fromEntries(axisKeys.map((key) => [key, values[key] ?? ""])),
      );
      const duplicateOf = seen.get(combination);
      if (duplicateOf) {
        throw new ConflictException({
          code: "FAMILY_VARIATION_DUPLICATE",
          message: "Two variants use the same variation combination",
          variants: [duplicateOf, variant.id],
          combination,
        });
      }
      seen.set(combination, variant.id);
    }
  }

  private variationValues(variantId: string, value: Prisma.JsonValue) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException({
        code: "FAMILY_VARIATION_INVALID",
        message: "Variant variation values must be an object",
        entity: { type: "ProductVariant", id: variantId },
      });
    }
    const entries = Object.entries(value);
    if (entries.some(([, item]) => typeof item !== "string")) {
      throw new BadRequestException({
        code: "FAMILY_VARIATION_INVALID",
        message: "Variant variation values must contain text values",
        entity: { type: "ProductVariant", id: variantId },
      });
    }
    return Object.fromEntries(entries) as Record<string, string>;
  }

  private handleUniqueConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException({
        code: "FAMILY_UNIQUE_CONFLICT",
        message: "The family code or selected variant is already assigned",
        fields: error.meta?.target,
      });
    }
  }

  private notFound() {
    return new NotFoundException({
      code: "FAMILY_NOT_FOUND",
      message: "Product family not found",
    });
  }
}
