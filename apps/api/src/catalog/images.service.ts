import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ProductImageRole, Prisma } from "@prisma/client";
import type {
  ImageTargetInput,
  ReorderImageAssignmentsInput,
  UpdateImageAssignmentInput,
} from "@plm/contracts";
import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import sharp, { type Metadata } from "sharp";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { ObjectStorageService } from "./object-storage.service";

const allowedMimeFormats: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "heif",
};

type ImageScope = { productId: string; variantId?: never } | { variantId: string; productId?: never };

@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async upload(auth: RequestAuth, files: Express.Multer.File[], target: ImageTargetInput) {
    if (!files.length) {
      throw new BadRequestException({ code: "IMAGE_FILE_REQUIRED", message: "Select at least one image" });
    }
    await this.assertTarget(auth.companyId, target);
    const results = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (!file) continue;
      results.push(await this.storeOne(auth, file, {
        ...target,
        role: index > 0 && target.role === "MAIN" ? "SECONDARY" : target.role,
        position: target.position + index,
      }));
    }
    return { items: results };
  }

  async assign(auth: RequestAuth, imageId: string, target: ImageTargetInput) {
    await this.assertTarget(auth.companyId, target);
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, companyId: auth.companyId, deletedAt: null, processingStatus: "READY" },
    });
    if (!image) throw this.imageNotFound();
    const assignment = await this.prisma.$transaction((transaction) =>
      this.assignInTransaction(transaction, image.id, target),
    );
    await this.audit(auth, "image.assigned", image.id, {
      assignmentId: assignment.id,
      productId: target.productId,
      variantId: target.variantId,
      role: assignment.role,
    });
    return assignment;
  }

  async productImages(auth: RequestAuth, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: auth.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    const items = await this.assignments({ productId });
    return { inherited: false, sourceProductId: productId, items };
  }

  async variantImages(auth: RequestAuth, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, companyId: auth.companyId, deletedAt: null },
      select: { id: true, productId: true },
    });
    if (!variant) throw new NotFoundException({ code: "VARIANT_NOT_FOUND", message: "Product variant not found" });
    const specific = await this.assignments({ variantId });
    if (specific.length) return { inherited: false, sourceVariantId: variantId, items: specific };
    return {
      inherited: true,
      sourceProductId: variant.productId,
      items: await this.assignments({ productId: variant.productId }),
    };
  }

  async updateAssignment(
    auth: RequestAuth,
    assignmentId: string,
    input: UpdateImageAssignmentInput,
  ) {
    const assignment = await this.prisma.productImageAssignment.findFirst({
      where: { id: assignmentId, image: { companyId: auth.companyId, deletedAt: null } },
    });
    if (!assignment) throw this.assignmentNotFound();
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (input.role === "MAIN") {
        await this.demoteMain(transaction, {
          productId: assignment.productId ?? undefined,
          variantId: assignment.variantId ?? undefined,
        }, assignment.id);
      }
      return transaction.productImageAssignment.update({
        where: { id: assignment.id },
        data: {
          role: input.role as ProductImageRole | undefined,
          position: input.position,
          altText: input.altText,
        },
        include: { image: true },
      });
    });
    await this.audit(auth, "image.assignment_updated", updated.imageId, {
      assignmentId,
      role: updated.role,
      position: updated.position,
    });
    return updated;
  }

  async reorder(
    auth: RequestAuth,
    scope: ImageScope,
    input: ReorderImageAssignmentsInput,
  ) {
    await this.assertTarget(auth.companyId, scope);
    const ids = input.assignments.map((item) => item.assignmentId);
    const rows = await this.prisma.productImageAssignment.findMany({
      where: {
        id: { in: ids },
        productId: scope.productId ?? null,
        variantId: scope.variantId ?? null,
        image: { companyId: auth.companyId, deletedAt: null },
      },
      select: { id: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException({
        code: "IMAGE_ORDER_SCOPE_INVALID",
        message: "Every assignment must belong to the selected product or variant",
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      if (input.assignments.some((item) => item.role === "MAIN")) {
        await this.demoteMain(transaction, scope);
      }
      for (const item of input.assignments) {
        await transaction.productImageAssignment.update({
          where: { id: item.assignmentId },
          data: { role: item.role as ProductImageRole, position: item.position },
        });
      }
      await transaction.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: "image.order_updated",
          entityType: scope.productId ? "Product" : "ProductVariant",
          entityId: scope.productId ?? scope.variantId,
          after: input.assignments,
        },
      });
    });
    return scope.productId
      ? this.productImages(auth, scope.productId)
      : this.variantImages(auth, scope.variantId!);
  }

  async remove(auth: RequestAuth, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, companyId: auth.companyId, deletedAt: null },
      include: { assignments: { select: { id: true, productId: true, variantId: true } } },
    });
    if (!image) throw this.imageNotFound();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.productImageAssignment.deleteMany({ where: { imageId } }),
      this.prisma.productImage.update({
        where: { id: imageId },
        data: { deletedAt: now, processingStatus: "FAILED", publicUrl: null, thumbnailUrl: null, mediumUrl: null },
      }),
      this.prisma.auditLog.create({
        data: {
          companyId: auth.companyId,
          actorId: auth.userId,
          action: "image.deleted",
          entityType: "ProductImage",
          entityId: imageId,
          before: { objectKey: image.objectKey, assignments: image.assignments },
          after: { deletedAt: now.toISOString() },
        },
      }),
    ]);
    await this.storage.delete(this.objectKeys(image.objectKey, image.metadata));
  }

  private async storeOne(auth: RequestAuth, file: Express.Multer.File, target: ImageTargetInput) {
    const inspected = await this.inspect(file);
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const duplicate = await this.prisma.productImage.findFirst({
      where: { companyId: auth.companyId, sha256, deletedAt: null },
    });
    if (duplicate) {
      const assignment = await this.prisma.$transaction((transaction) =>
        this.assignInTransaction(transaction, duplicate.id, target),
      );
      return { image: duplicate, assignment, deduplicated: true };
    }

    const identifier = randomUUID();
    const originalKey = `${auth.companyId}/${identifier}/original.${this.extension(file.mimetype, file.originalname)}`;
    const thumbnailKey = `${auth.companyId}/${identifier}/thumbnail.webp`;
    const mediumKey = `${auth.companyId}/${identifier}/medium.webp`;
    const [thumbnail, medium] = await Promise.all([
      sharp(file.buffer).rotate().resize(320, 320, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      sharp(file.buffer).rotate().resize(1_200, 1_200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer(),
    ]);
    const storedKeys: string[] = [];
    try {
      const publicUrl = await this.storage.put({ key: originalKey, body: file.buffer, contentType: file.mimetype });
      storedKeys.push(originalKey);
      const thumbnailUrl = await this.storage.put({ key: thumbnailKey, body: thumbnail, contentType: "image/webp" });
      storedKeys.push(thumbnailKey);
      const mediumUrl = await this.storage.put({ key: mediumKey, body: medium, contentType: "image/webp" });
      storedKeys.push(mediumKey);

      const created = await this.prisma.$transaction(async (transaction) => {
        const image = await transaction.productImage.create({
          data: {
            companyId: auth.companyId,
            objectKey: originalKey,
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sha256,
            width: inspected.width,
            height: inspected.height,
            processingStatus: "READY",
            publicUrl,
            thumbnailUrl,
            mediumUrl,
            metadata: {
              format: inspected.format,
              derivativeKeys: [thumbnailKey, mediumKey],
              originalPreserved: true,
              webpGenerated: true,
            },
            createdById: auth.userId,
          },
        });
        const assignment = await this.assignInTransaction(transaction, image.id, target);
        await transaction.auditLog.create({
          data: {
            companyId: auth.companyId,
            actorId: auth.userId,
            action: "image.uploaded",
            entityType: "ProductImage",
            entityId: image.id,
            after: {
              mimeType: image.mimeType,
              sizeBytes: image.sizeBytes,
              width: image.width,
              height: image.height,
              productId: target.productId,
              variantId: target.variantId,
            },
          },
        });
        return { image, assignment };
      });
      return { ...created, deduplicated: false };
    } catch (error: unknown) {
      await this.storage.delete(storedKeys);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "IMAGE_DUPLICATE", message: "This image already exists" });
      }
      throw error;
    }
  }

  private async inspect(file: Express.Multer.File) {
    const maximumBytes = 20 * 1024 * 1024;
    if (file.size > maximumBytes) {
      throw new BadRequestException({ code: "IMAGE_TOO_LARGE", message: "Images may not exceed 20 MB" });
    }
    const expectedFormat = allowedMimeFormats[file.mimetype];
    if (!expectedFormat) {
      throw new BadRequestException({
        code: "IMAGE_MIME_UNSUPPORTED",
        message: "Use JPEG, PNG, WebP, or AVIF images",
      });
    }
    let metadata: Metadata;
    try {
      metadata = await sharp(file.buffer, { failOn: "error" }).metadata();
    } catch {
      throw new BadRequestException({ code: "IMAGE_CORRUPT", message: "The uploaded file is not a valid image" });
    }
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
      throw new BadRequestException({
        code: "IMAGE_MIME_MISMATCH",
        message: "The file contents do not match its declared image type",
      });
    }
    const swapsOrientation = metadata.orientation !== undefined && metadata.orientation >= 5;
    const width = swapsOrientation ? metadata.height : metadata.width;
    const height = swapsOrientation ? metadata.width : metadata.height;
    if (width < 300 || height < 300) {
      throw new BadRequestException({
        code: "IMAGE_DIMENSIONS_TOO_SMALL",
        message: "Images must be at least 300 × 300 pixels",
      });
    }
    if (width > 12_000 || height > 12_000) {
      throw new BadRequestException({
        code: "IMAGE_DIMENSIONS_TOO_LARGE",
        message: "Images may not exceed 12,000 pixels on either side",
      });
    }
    return { format: metadata.format, width, height };
  }

  private async assertTarget(companyId: string, target: Pick<ImageTargetInput, "productId" | "variantId">) {
    if (target.productId) {
      const found = await this.prisma.product.count({
        where: { id: target.productId, companyId, deletedAt: null },
      });
      if (!found) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
      return;
    }
    if (target.variantId) {
      const found = await this.prisma.productVariant.count({
        where: { id: target.variantId, companyId, deletedAt: null },
      });
      if (!found) throw new NotFoundException({ code: "VARIANT_NOT_FOUND", message: "Product variant not found" });
      return;
    }
    throw new BadRequestException({ code: "IMAGE_TARGET_REQUIRED", message: "Select a product or variant" });
  }

  private async assignInTransaction(
    transaction: Prisma.TransactionClient,
    imageId: string,
    target: ImageTargetInput,
  ) {
    const where = {
      imageId,
      productId: target.productId ?? null,
      variantId: target.variantId ?? null,
    };
    const existing = await transaction.productImageAssignment.findFirst({ where });
    if (target.role === "MAIN") await this.demoteMain(transaction, target, existing?.id);
    if (existing) {
      return transaction.productImageAssignment.update({
        where: { id: existing.id },
        data: {
          role: target.role as ProductImageRole,
          position: target.position,
          altText: target.altText,
        },
      });
    }
    return transaction.productImageAssignment.create({
      data: {
        ...where,
        role: target.role as ProductImageRole,
        position: target.position,
        altText: target.altText,
      },
    });
  }

  private demoteMain(
    transaction: Prisma.TransactionClient,
    target: Pick<ImageTargetInput, "productId" | "variantId">,
    exceptId?: string,
  ) {
    return transaction.productImageAssignment.updateMany({
      where: {
        productId: target.productId ?? null,
        variantId: target.variantId ?? null,
        role: "MAIN",
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { role: "SECONDARY" },
    });
  }

  private assignments(scope: ImageScope) {
    return this.prisma.productImageAssignment.findMany({
      where: {
        productId: scope.productId ?? null,
        variantId: scope.variantId ?? null,
        image: { deletedAt: null, processingStatus: "READY" },
      },
      orderBy: [{ role: "asc" }, { position: "asc" }, { id: "asc" }],
      include: { image: true },
    });
  }

  private objectKeys(originalKey: string, metadata: Prisma.JsonValue) {
    const keys = [originalKey];
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const derivatives = metadata.derivativeKeys;
      if (Array.isArray(derivatives)) {
        keys.push(...derivatives.filter((key): key is string => typeof key === "string"));
      }
    }
    return [...new Set(keys)];
  }

  private extension(mimeType: string, originalName: string) {
    const byMime: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
    };
    return byMime[mimeType] ?? (extname(originalName).replace(/^\./, "").toLowerCase() || "bin");
  }

  private audit(auth: RequestAuth, action: string, entityId: string, after: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: { companyId: auth.companyId, actorId: auth.userId, action, entityType: "ProductImage", entityId, after },
    });
  }

  private imageNotFound() {
    return new NotFoundException({ code: "IMAGE_NOT_FOUND", message: "Product image not found" });
  }

  private assignmentNotFound() {
    return new NotFoundException({ code: "IMAGE_ASSIGNMENT_NOT_FOUND", message: "Image assignment not found" });
  }
}
