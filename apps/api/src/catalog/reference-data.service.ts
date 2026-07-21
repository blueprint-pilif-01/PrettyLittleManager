import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateBrandInput,
  CreateCategoryInput,
  UpdateBrandInput,
  UpdateCategoryInput,
} from "@plm/contracts";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class ReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories(auth: RequestAuth) {
    return this.prisma.category.findMany({
      where: { companyId: auth.companyId },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async createCategory(auth: RequestAuth, input: CreateCategoryInput) {
    if (input.parentId) await this.assertCategory(auth.companyId, input.parentId);
    try {
      const category = await this.prisma.category.create({
        data: { companyId: auth.companyId, ...input },
      });
      await this.audit(auth, "category.created", "Category", category.id, {
        name: category.name,
        slug: category.slug,
      });
      return category;
    } catch (error: unknown) {
      this.handleUnique(error, "A category with this slug already exists");
      throw error;
    }
  }

  async updateCategory(auth: RequestAuth, id: string, input: UpdateCategoryInput) {
    const before = await this.assertCategory(auth.companyId, id);
    if (input.parentId) {
      if (input.parentId === id) {
        throw new ConflictException({ code: "CATEGORY_CYCLE", message: "A category cannot be its own parent" });
      }
      await this.assertCategory(auth.companyId, input.parentId);
    }
    const category = await this.prisma.category.update({ where: { id }, data: input });
    await this.audit(auth, "category.updated", "Category", id, {
      before: { name: before.name, slug: before.slug },
      after: { name: category.name, slug: category.slug },
    });
    return category;
  }

  listBrands(auth: RequestAuth) {
    return this.prisma.brand.findMany({
      where: { companyId: auth.companyId, isActive: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
  }

  async createBrand(auth: RequestAuth, input: CreateBrandInput) {
    try {
      const brand = await this.prisma.brand.create({
        data: { companyId: auth.companyId, ...input },
      });
      await this.audit(auth, "brand.created", "Brand", brand.id, {
        name: brand.name,
        slug: brand.slug,
      });
      return brand;
    } catch (error: unknown) {
      this.handleUnique(error, "A brand with this slug already exists");
      throw error;
    }
  }

  async updateBrand(auth: RequestAuth, id: string, input: UpdateBrandInput) {
    const before = await this.prisma.brand.findFirst({ where: { id, companyId: auth.companyId } });
    if (!before) throw new NotFoundException({ code: "BRAND_NOT_FOUND", message: "Brand not found" });
    const brand = await this.prisma.brand.update({ where: { id }, data: input });
    await this.audit(auth, "brand.updated", "Brand", id, {
      before: { name: before.name, slug: before.slug },
      after: { name: brand.name, slug: brand.slug },
    });
    return brand;
  }

  private async assertCategory(companyId: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, companyId } });
    if (!category) throw new NotFoundException({ code: "CATEGORY_NOT_FOUND", message: "Category not found" });
    return category;
  }

  private audit(auth: RequestAuth, action: string, entityType: string, entityId: string, after: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: { companyId: auth.companyId, actorId: auth.userId, action, entityType, entityId, after },
    });
  }

  private handleUnique(error: unknown, message: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException({ code: "UNIQUE_CONFLICT", message });
    }
  }
}
