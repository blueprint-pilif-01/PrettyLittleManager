import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  assignCategoryAttributeSchema,
  createAttributeDefinitionSchema,
  setAttributeValuesSchema,
  type AssignCategoryAttributeInput,
  type CreateAttributeDefinitionInput,
  type SetAttributeValuesInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AttributesService } from "./attributes.service";

@ApiTags("Attributes")
@ApiBearerAuth()
@Controller()
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get("attributes")
  @RequirePermissions("attribute.read")
  list(@CurrentAuth() auth: RequestAuth) {
    return this.attributes.list(auth);
  }

  @Post("attributes")
  @RequirePermissions("attribute.manage")
  create(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createAttributeDefinitionSchema))
    input: CreateAttributeDefinitionInput,
  ) {
    return this.attributes.create(auth, input);
  }

  @Put("categories/:categoryId/attributes")
  @RequirePermissions("attribute.manage")
  assignToCategory(
    @CurrentAuth() auth: RequestAuth,
    @Param("categoryId", ParseUUIDPipe) categoryId: string,
    @Body(new ZodValidationPipe(assignCategoryAttributeSchema))
    input: AssignCategoryAttributeInput,
  ) {
    return this.attributes.assignToCategory(auth, categoryId, input);
  }

  @Put("products/:productId/attributes")
  @RequirePermissions("product.update")
  setProductValues(
    @CurrentAuth() auth: RequestAuth,
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(setAttributeValuesSchema)) input: SetAttributeValuesInput,
  ) {
    return this.attributes.setProductValues(auth, productId, input);
  }

  @Put("variants/:variantId/attributes")
  @RequirePermissions("product.update")
  setVariantValues(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(setAttributeValuesSchema)) input: SetAttributeValuesInput,
  ) {
    return this.attributes.setVariantValues(auth, variantId, input);
  }
}
