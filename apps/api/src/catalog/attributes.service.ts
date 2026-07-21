import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AttributeScope, Prisma } from "@prisma/client";
import type {
  AssignCategoryAttributeInput,
  CreateAttributeDefinitionInput,
  SetAttributeValuesInput,
} from "@plm/contracts";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { AttributeValueValidator } from "./attribute-value.validator";

@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: AttributeValueValidator,
  ) {}

  list(auth: RequestAuth) {
    return this.prisma.attributeDefinition.findMany({
      where: { companyId: auth.companyId, isActive: true },
      orderBy: [{ scope: "asc" }, { displayOrder: "asc" }, { displayName: "asc" }],
      include: { options: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
    });
  }

  async create(auth: RequestAuth, input: CreateAttributeDefinitionInput) {
    const { options, defaultValue, ...definitionInput } = input;
    try {
      const definition = await this.prisma.attributeDefinition.create({
        data: {
          companyId: auth.companyId,
          ...definitionInput,
          ...(defaultValue === undefined
            ? {}
            : { defaultValue: defaultValue as Prisma.InputJsonValue }),
          options: { create: options },
        },
        include: { options: true },
      });
      await this.prisma.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: "attribute.created",
          entityType: "AttributeDefinition",
          entityId: definition.id,
          after: { key: definition.key, dataType: definition.dataType, scope: definition.scope },
        },
      });
      return definition;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "ATTRIBUTE_KEY_EXISTS", message: "An attribute with this key already exists" });
      }
      throw error;
    }
  }

  async assignToCategory(auth: RequestAuth, categoryId: string, input: AssignCategoryAttributeInput) {
    const [category, definition] = await Promise.all([
      this.prisma.category.findFirst({ where: { id: categoryId, companyId: auth.companyId } }),
      this.prisma.attributeDefinition.findFirst({ where: { id: input.attributeDefinitionId, companyId: auth.companyId } }),
    ]);
    if (!category) throw new NotFoundException({ code: "CATEGORY_NOT_FOUND", message: "Category not found" });
    if (!definition) throw new NotFoundException({ code: "ATTRIBUTE_NOT_FOUND", message: "Attribute definition not found" });

    return this.prisma.categoryAttributeDefinition.upsert({
      where: { categoryId_attributeDefinitionId: { categoryId, attributeDefinitionId: definition.id } },
      update: { isRequiredOverride: input.isRequiredOverride, displayOrder: input.displayOrder },
      create: { categoryId, attributeDefinitionId: definition.id, isRequiredOverride: input.isRequiredOverride, displayOrder: input.displayOrder },
    });
  }

  async setProductValues(auth: RequestAuth, productId: string, input: SetAttributeValuesInput) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, companyId: auth.companyId, deletedAt: null } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    return this.setValues(auth, "PRODUCT", productId, input);
  }

  async setVariantValues(auth: RequestAuth, variantId: string, input: SetAttributeValuesInput) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, companyId: auth.companyId, deletedAt: null } });
    if (!variant) throw new NotFoundException({ code: "VARIANT_NOT_FOUND", message: "Variant not found" });
    return this.setValues(auth, "VARIANT", variantId, input);
  }

  private async setValues(
    auth: RequestAuth,
    scope: AttributeScope,
    entityId: string,
    input: SetAttributeValuesInput,
  ) {
    const definitionIds = [...new Set(input.values.map((item) => item.definitionId))];
    const definitions = await this.prisma.attributeDefinition.findMany({
      where: { id: { in: definitionIds }, companyId: auth.companyId, scope, isActive: true },
      include: { options: { where: { isActive: true } } },
    });
    if (definitions.length !== definitionIds.length) {
      throw new NotFoundException({ code: "ATTRIBUTE_NOT_FOUND", message: "One or more attribute definitions do not belong to this workspace and scope" });
    }
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    const values = input.values.map((item) => {
      const definition = byId.get(item.definitionId);
      if (!definition) throw new Error("Validated attribute definition is missing");
      return { ...item, validated: this.validator.validate(definition, item.value) };
    });

    await this.prisma.$transaction(async (transaction) => {
      for (const item of values) {
        if (scope === "PRODUCT") {
          await transaction.productAttributeValue.upsert({
            where: { productId_attributeDefinitionId_locale: { productId: entityId, attributeDefinitionId: item.definitionId, locale: item.locale } },
            update: { value: item.validated, isOverride: item.isOverride ?? false },
            create: { productId: entityId, attributeDefinitionId: item.definitionId, locale: item.locale, value: item.validated, isOverride: item.isOverride ?? false },
          });
        } else {
          await transaction.variantAttributeValue.upsert({
            where: { variantId_attributeDefinitionId_locale: { variantId: entityId, attributeDefinitionId: item.definitionId, locale: item.locale } },
            update: { value: item.validated, isOverride: item.isOverride ?? true },
            create: { variantId: entityId, attributeDefinitionId: item.definitionId, locale: item.locale, value: item.validated, isOverride: item.isOverride ?? true },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: scope === "PRODUCT" ? "product.attributes.updated" : "variant.attributes.updated",
          entityType: scope === "PRODUCT" ? "Product" : "ProductVariant",
          entityId,
          after: { attributeDefinitionIds: definitionIds },
        },
      });
    });
    return { updated: values.length };
  }
}
