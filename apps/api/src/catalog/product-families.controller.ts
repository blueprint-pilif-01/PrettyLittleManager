import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  addFamilyMemberSchema,
  createProductFamilySchema,
  updateProductFamilySchema,
  type AddFamilyMemberInput,
  type CreateProductFamilyInput,
  type UpdateProductFamilyInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductFamiliesService } from "./product-families.service";

@ApiTags("Product families")
@ApiBearerAuth()
@Controller("product-families")
export class ProductFamiliesController {
  constructor(private readonly families: ProductFamiliesService) {}

  @Get()
  @RequirePermissions("product.read")
  list(@CurrentAuth() auth: RequestAuth) {
    return this.families.list(auth);
  }

  @Get(":id")
  @RequirePermissions("product.read")
  get(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.families.get(auth, id);
  }

  @Post()
  @RequirePermissions("product.create")
  create(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createProductFamilySchema))
    input: CreateProductFamilyInput,
  ) {
    return this.families.create(auth, input);
  }

  @Patch(":id")
  @RequirePermissions("product.update")
  update(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductFamilySchema))
    input: UpdateProductFamilyInput,
  ) {
    return this.families.update(auth, id, input);
  }

  @Post(":id/members")
  @RequirePermissions("product.update")
  addMember(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addFamilyMemberSchema))
    input: AddFamilyMemberInput,
  ) {
    return this.families.addMember(auth, id, input);
  }

  @Delete(":id/members/:variantId")
  @RequirePermissions("product.update")
  removeMember(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("variantId", ParseUUIDPipe) variantId: string,
  ) {
    return this.families.removeMember(auth, id, variantId);
  }
}
