import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createBrandSchema,
  createCategorySchema,
  updateBrandSchema,
  updateCategorySchema,
  type CreateBrandInput,
  type CreateCategoryInput,
  type UpdateBrandInput,
  type UpdateCategoryInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReferenceDataService } from "./reference-data.service";

@ApiBearerAuth()
@Controller()
export class ReferenceDataController {
  constructor(private readonly referenceData: ReferenceDataService) {}

  @ApiTags("Categories")
  @Get("categories")
  @RequirePermissions("category.read")
  listCategories(@CurrentAuth() auth: RequestAuth) {
    return this.referenceData.listCategories(auth);
  }

  @ApiTags("Categories")
  @Post("categories")
  @RequirePermissions("category.manage")
  createCategory(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createCategorySchema)) input: CreateCategoryInput,
  ) {
    return this.referenceData.createCategory(auth, input);
  }

  @ApiTags("Categories")
  @Patch("categories/:id")
  @RequirePermissions("category.manage")
  updateCategory(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) input: UpdateCategoryInput,
  ) {
    return this.referenceData.updateCategory(auth, id, input);
  }

  @ApiTags("Brands")
  @Get("brands")
  @RequirePermissions("product.read")
  listBrands(@CurrentAuth() auth: RequestAuth) {
    return this.referenceData.listBrands(auth);
  }

  @ApiTags("Brands")
  @Post("brands")
  @RequirePermissions("category.manage")
  createBrand(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createBrandSchema)) input: CreateBrandInput,
  ) {
    return this.referenceData.createBrand(auth, input);
  }

  @ApiTags("Brands")
  @Patch("brands/:id")
  @RequirePermissions("category.manage")
  updateBrand(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) input: UpdateBrandInput,
  ) {
    return this.referenceData.updateBrand(auth, id, input);
  }
}
