import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  assignGtinSchema,
  updateGs1RegistrationSchema,
  type AssignGtinInput,
  type UpdateGs1RegistrationInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Gs1Service } from "./gs1.service";

@ApiTags("GS1")
@ApiBearerAuth()
@Controller("variants/:variantId/gs1")
export class Gs1Controller {
  constructor(private readonly gs1: Gs1Service) {}

  @Get()
  @RequirePermissions("gs1.read")
  get(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
  ) {
    return this.gs1.get(auth, variantId);
  }

  @Put()
  @RequirePermissions("gs1.manage")
  update(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(updateGs1RegistrationSchema))
    input: UpdateGs1RegistrationInput,
  ) {
    return this.gs1.update(auth, variantId, input);
  }

  @Post("validate")
  @RequirePermissions("gs1.manage")
  validate(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
  ) {
    return this.gs1.validate(auth, variantId);
  }

  @Get("summary")
  @RequirePermissions("gs1.read")
  summary(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
  ) {
    return this.gs1.summary(auth, variantId);
  }

  @Get("export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="gs1-registration.csv"')
  @RequirePermissions("gs1.read")
  exportCsv(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
  ) {
    return this.gs1.exportCsv(auth, variantId);
  }

  @Post("submit-manually")
  @RequirePermissions("gs1.manage")
  markSubmitted(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
  ) {
    return this.gs1.markSubmitted(auth, variantId);
  }

  @Post("gtin")
  @RequirePermissions("gs1.manage")
  assignGtin(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(assignGtinSchema)) input: AssignGtinInput,
  ) {
    return this.gs1.assignGtin(auth, variantId, input);
  }
}
