import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import {
  configureImportSchema,
  createImportMappingTemplateSchema,
  executeImportSchema,
  type ConfigureImportInput,
  type CreateImportMappingTemplateInput,
  type ExecuteImportInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ImportsService } from "./imports.service";

@ApiTags("Imports")
@ApiBearerAuth()
@Controller()
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get("imports")
  @RequirePermissions("imports.read")
  list(@CurrentAuth() auth: RequestAuth) {
    return this.imports.list(auth);
  }

  @Get("imports/:id")
  @RequirePermissions("imports.read")
  get(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) {
    return this.imports.get(auth, id);
  }

  @Get("import-mappings")
  @RequirePermissions("imports.read")
  mappings(@CurrentAuth() auth: RequestAuth) {
    return this.imports.listMappings(auth);
  }

  @Post("import-mappings")
  @RequirePermissions("imports.run")
  createMapping(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createImportMappingTemplateSchema))
    input: CreateImportMappingTemplateInput,
  ) {
    return this.imports.createMapping(auth, input);
  }

  @Post("imports/upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  @RequirePermissions("imports.run")
  upload(
    @CurrentAuth() auth: RequestAuth,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.upload(auth, file);
  }

  @Put("imports/:id/configuration")
  @RequirePermissions("imports.run")
  configure(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(configureImportSchema)) input: ConfigureImportInput,
  ) {
    return this.imports.configure(auth, id, input);
  }

  @Post("imports/:id/validate")
  @RequirePermissions("imports.run")
  validate(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.imports.validate(auth, id);
  }

  @Post("imports/:id/execute")
  @RequirePermissions("imports.run")
  execute(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(executeImportSchema)) input: ExecuteImportInput,
    @Req() request: Request,
  ) {
    return this.imports.queueExecution(auth, id, input, request.correlationId);
  }

  @Get("imports/:id/report")
  @RequirePermissions("imports.read")
  async report(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const report = await this.imports.report(auth, id);
    return new StreamableFile(report.body, {
      type: "text/csv; charset=utf-8",
      disposition: `attachment; filename="${report.fileName}"`,
    });
  }
}
