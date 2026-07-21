import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createProductSchema,
  createVariantSchema,
  updateVariantSchema,
  updateProductSchema,
  type CreateProductInput,
  type CreateVariantInput,
  type UpdateVariantInput,
  type UpdateProductInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ListProductsQuery } from "./dto/list-products.query";
import { ProductsService } from "./products.service";

@ApiTags("Products")
@ApiBearerAuth()
@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions("product.read")
  list(@CurrentAuth() auth: RequestAuth, @Query() query: ListProductsQuery) {
    return this.products.list(auth, query);
  }

  @Get(":id")
  @RequirePermissions("product.read")
  get(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.products.get(auth, id);
  }

  @Get("catalog/variants")
  @RequirePermissions("product.read")
  variants(@CurrentAuth() auth: RequestAuth) {
    return this.products.listVariants(auth);
  }

  @Post()
  @RequirePermissions("product.create")
  create(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createProductSchema)) input: CreateProductInput,
  ) {
    return this.products.create(auth, input);
  }

  @Patch(":id")
  @RequirePermissions("product.update")
  update(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) input: UpdateProductInput,
  ) {
    return this.products.update(auth, id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions("product.delete")
  archive(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.products.archive(auth, id);
  }

  @Post(":id/variants")
  @RequirePermissions("product.create")
  createVariant(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createVariantSchema)) input: CreateVariantInput,
  ) {
    return this.products.createVariant(auth, id, input);
  }

  @Patch(":productId/variants/:variantId")
  @RequirePermissions("product.update")
  updateVariant(
    @CurrentAuth() auth: RequestAuth,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Param("variantId", ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(updateVariantSchema)) input: UpdateVariantInput,
  ) {
    return this.products.updateVariant(auth, productId, variantId, input);
  }

  @Delete(":productId/variants/:variantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions("product.delete")
  archiveVariant(
    @CurrentAuth() auth: RequestAuth,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Param("variantId", ParseUUIDPipe) variantId: string,
  ) {
    return this.products.archiveVariant(auth, productId, variantId);
  }
}
