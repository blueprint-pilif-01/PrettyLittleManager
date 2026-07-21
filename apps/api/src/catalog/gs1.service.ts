import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Gs1RegistrationStatus,
  GtinAssignmentSource,
  GtinType,
  Prisma,
} from "@prisma/client";
import {
  gtinTypeFor,
  isValidGtin,
  type AssignGtinInput,
  type UpdateGs1RegistrationInput,
} from "@plm/contracts";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { Gs1Connector } from "./gs1.connector";
import { Gs1ValidationService } from "./gs1-validation.service";

@Injectable()
export class Gs1Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: Gs1ValidationService,
    private readonly connector: Gs1Connector,
  ) {}

  async get(auth: RequestAuth, variantId: string) {
    const context = await this.context(auth, variantId);
    return {
      mode: this.connector.mode,
      variant: context.variant,
      registration: context.registration,
      validation: this.validator.validate(context),
      suggestedDefaults: context.registration ? undefined : this.defaults(context.variant),
    };
  }

  async update(
    auth: RequestAuth,
    variantId: string,
    input: UpdateGs1RegistrationInput,
  ) {
    const context = await this.context(auth, variantId);
    const updateData = this.inputData(input);
    const preserveStatus = new Set<Gs1RegistrationStatus>([
      "GTIN_ASSIGNED",
      "ACTIVE",
      "INACTIVE",
    ]).has(context.registration?.status ?? "NOT_STARTED");
    const registration = await this.prisma.gs1Registration.upsert({
      where: { variantId },
      update: {
        ...updateData,
        ...(!preserveStatus ? { status: "DRAFT", submittedAt: null } : {}),
      },
      create: {
        variantId,
        ...this.defaults(context.variant),
        ...updateData,
        status: "DRAFT",
      },
    });
    await this.prisma.auditLog.create({
      data: {
        companyId: auth.companyId,
        actorId: auth.userId,
        action: "gs1.registration_updated",
        entityType: "Gs1Registration",
        entityId: registration.id,
        before: context.registration
          ? { status: context.registration.status, updatedAt: context.registration.updatedAt.toISOString() }
          : Prisma.JsonNull,
        after: { status: registration.status, variantId },
      },
    });
    return {
      registration,
      validation: this.validator.validate({ variant: context.variant, registration }),
    };
  }

  async validate(auth: RequestAuth, variantId: string) {
    const context = await this.context(auth, variantId);
    const validation = this.validator.validate(context);
    if (!context.registration) return validation;
    const nextStatus: Gs1RegistrationStatus = validation.valid
      ? "READY_FOR_REGISTRATION"
      : "VALIDATION_FAILED";
    if (!new Set<Gs1RegistrationStatus>(["GTIN_ASSIGNED", "ACTIVE", "INACTIVE"]).has(context.registration.status)) {
      await this.prisma.gs1Registration.update({
        where: { variantId },
        data: { status: nextStatus },
      });
    }
    return { ...validation, status: nextStatus };
  }

  async summary(auth: RequestAuth, variantId: string) {
    const context = await this.context(auth, variantId);
    if (!context.registration) throw this.registrationNotStarted();
    return this.connector.buildRegistrationSummary({
      variant: context.variant,
      registration: context.registration,
      validation: this.validator.validate(context),
    });
  }

  async exportCsv(auth: RequestAuth, variantId: string) {
    const context = await this.context(auth, variantId);
    if (!context.registration) throw this.registrationNotStarted();
    return this.connector.exportRegistrationCsv({
      variant: context.variant,
      registration: context.registration,
      validation: this.validator.validate(context),
    });
  }

  async markSubmitted(auth: RequestAuth, variantId: string) {
    const context = await this.context(auth, variantId);
    if (!context.registration) throw this.registrationNotStarted();
    const validation = this.validator.validate(context);
    if (!validation.valid) {
      throw new BadRequestException({
        code: "GS1_REGISTRATION_NOT_READY",
        message: "Resolve all blocking GS1 validation errors before marking the registration submitted",
        validation,
      });
    }
    const submittedAt = new Date();
    const registration = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.gs1Registration.update({
        where: { variantId },
        data: { status: "SUBMITTED_MANUALLY", submittedAt },
      });
      await transaction.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: "gs1.submitted_manually",
          entityType: "Gs1Registration",
          entityId: updated.id,
          before: { status: context.registration?.status },
          after: { status: updated.status, submittedAt: submittedAt.toISOString() },
        },
      });
      return updated;
    });
    return { registration, validation };
  }

  async assignGtin(auth: RequestAuth, variantId: string, input: AssignGtinInput) {
    if (!isValidGtin(input.gtin)) {
      throw new BadRequestException({
        code: "GTIN_INVALID",
        message: "GTIN length or check digit is invalid",
        field: "gtin",
      });
    }
    const detectedType = gtinTypeFor(input.gtin);
    if (!detectedType) {
      throw new BadRequestException({ code: "GTIN_TYPE_UNSUPPORTED", message: "GTIN type is not supported" });
    }
    const context = await this.context(auth, variantId);
    if (context.variant.gtin === input.gtin && context.variant.gtinAssignment) {
      return context.variant;
    }
    if (context.variant.gtin || context.variant.gtinAssignment) {
      throw new ConflictException({
        code: "VARIANT_GTIN_ALREADY_ASSIGNED",
        message: "This variant already has a GTIN assignment",
      });
    }
    if (
      input.source === "MANUAL_GS1" &&
      context.registration?.status !== "SUBMITTED_MANUALLY"
    ) {
      throw new BadRequestException({
        code: "GS1_NOT_SUBMITTED",
        message: "Mark the GS1 registration as submitted manually before entering the assigned GTIN",
      });
    }
    if (
      input.source === "MANUAL_GS1" &&
      context.registration?.gtinType !== detectedType
    ) {
      throw new BadRequestException({
        code: "GTIN_TYPE_MISMATCH",
        message: `The assigned code is ${detectedType}, but the registration requests ${context.registration?.gtinType}`,
      });
    }
    const duplicate = await this.prisma.gtinAssignment.findUnique({
      where: { gtin: input.gtin },
      select: { variantId: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: "GTIN_DUPLICATE",
        message: "This GTIN is already assigned to another variant",
      });
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const assignment = await transaction.gtinAssignment.create({
          data: {
            companyId: auth.companyId,
            variantId,
            gtin: input.gtin,
            gtinType: detectedType as GtinType,
            source: input.source as GtinAssignmentSource,
            createdById: auth.userId,
          },
        });
        await transaction.productVariant.update({
          where: { id: variantId },
          data: { gtin: input.gtin, gtinType: detectedType as GtinType, updatedById: auth.userId },
        });
        await transaction.gs1Registration.upsert({
          where: { variantId },
          update: { status: "GTIN_ASSIGNED" },
          create: {
            variantId,
            ...this.defaults(context.variant),
            gtinType: detectedType as GtinType,
            status: "GTIN_ASSIGNED",
          },
        });
        await transaction.channelListing.updateMany({
          where: {
            companyId: auth.companyId,
            OR: [{ variantId }, { productId: context.variant.productId }],
          },
          data: { synchronizationStatus: "RECONCILIATION_REQUIRED" },
        });
        await transaction.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorId: auth.userId,
            action: "gtin.assigned",
            entityType: "ProductVariant",
            entityId: variantId,
            before: { gtin: null },
            after: {
              gtin: input.gtin,
              gtinType: detectedType,
              source: input.source,
              assignmentId: assignment.id,
            },
          },
        });
        return transaction.productVariant.findUniqueOrThrow({
          where: { id: variantId },
          include: { gtinAssignment: true, gs1Registration: true },
        });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "GTIN_DUPLICATE",
          message: "This GTIN is already assigned",
        });
      }
      throw error;
    }
  }

  private async context(auth: RequestAuth, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, companyId: auth.companyId, deletedAt: null },
      include: {
        gtinAssignment: true,
        gs1Registration: true,
        imageAssignments: {
          where: { image: { processingStatus: "READY", deletedAt: null } },
          orderBy: { position: "asc" },
          include: { image: true },
        },
        product: {
          include: {
            brand: true,
            category: true,
            imageAssignments: {
              where: { image: { processingStatus: "READY", deletedAt: null } },
              orderBy: { position: "asc" },
              include: { image: true },
            },
          },
        },
      },
    });
    if (!variant) {
      throw new NotFoundException({ code: "VARIANT_NOT_FOUND", message: "Product variant not found" });
    }
    return { variant, registration: variant.gs1Registration };
  }

  private defaults(variant: Awaited<ReturnType<Gs1Service["context"]>>["variant"]) {
    const product = variant.product;
    const image = variant.imageAssignments[0]?.image ?? product.imageAssignments[0]?.image;
    return {
      gtinType: "GTIN_13" as GtinType,
      productName: product.publicName,
      shortProductName: product.shortName ?? product.publicName.slice(0, 100),
      labelDescription: product.gs1LabelDescription ?? product.shortDescription,
      brand: product.brand?.name,
      internalCode: variant.sku,
      targetMarkets: [] as Prisma.InputJsonValue,
      productImageUrl: image?.publicUrl,
      height: variant.height ?? product.height,
      heightUnit: variant.dimensionUnit ?? product.dimensionUnit,
      width: variant.width ?? product.width,
      widthUnit: variant.dimensionUnit ?? product.dimensionUnit,
      length: variant.length ?? product.length,
      lengthUnit: variant.dimensionUnit ?? product.dimensionUnit,
      diameter: variant.diameter ?? product.diameter,
      diameterUnit: variant.dimensionUnit ?? product.dimensionUnit,
      gpcCode: product.category?.gs1GpcCode,
    };
  }

  private inputData(input: UpdateGs1RegistrationInput) {
    return {
      gtinType: input.gtinType as GtinType | undefined,
      activityDomain: input.activityDomain,
      productName: input.productName,
      shortProductName: input.shortProductName,
      labelDescription: input.labelDescription,
      isPromotionalProduct: input.isPromotionalProduct,
      brand: input.brand,
      internalCode: input.internalCode,
      packagingMaterial: input.packagingMaterial,
      packagingType: input.packagingType,
      netQuantity: input.netQuantity,
      netQuantityUnit: input.netQuantityUnit,
      ...(input.targetMarkets === undefined
        ? {}
        : { targetMarkets: input.targetMarkets as Prisma.InputJsonValue }),
      productPresentationUrl: input.productPresentationUrl,
      productImageUrl: input.productImageUrl,
      height: input.height,
      heightUnit: input.heightUnit,
      width: input.width,
      widthUnit: input.widthUnit,
      length: input.length,
      lengthUnit: input.lengthUnit,
      diameter: input.diameter,
      diameterUnit: input.diameterUnit,
      ...(input.romanianDistributionNetworks === undefined
        ? {}
        : { romanianDistributionNetworks: input.romanianDistributionNetworks as Prisma.InputJsonValue }),
      ...(input.otherDistributionNetworks === undefined
        ? {}
        : { otherDistributionNetworks: input.otherDistributionNetworks as Prisma.InputJsonValue }),
      gpcCode: input.gpcCode,
      responsibilityConfirmed: input.responsibilityConfirmed,
    };
  }

  private registrationNotStarted() {
    return new BadRequestException({
      code: "GS1_REGISTRATION_NOT_STARTED",
      message: "Complete and save the GS1 registration before continuing",
    });
  }
}
