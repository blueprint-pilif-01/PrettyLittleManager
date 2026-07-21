import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createExportTemplateSchema,
  runExportSchema,
  type CreateExportTemplateInput,
  type RunExportInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ExportsService } from "./exports.service";

@ApiTags("Exports")
@ApiBearerAuth()
@Controller()
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get("export-templates")
  @RequirePermissions("exports.read")
  templates(@CurrentAuth() auth: RequestAuth) {
    return this.exportsService.listTemplates(auth);
  }

  @Post("export-templates")
  @RequirePermissions("exports.run")
  createTemplate(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createExportTemplateSchema)) input: CreateExportTemplateInput,
  ) {
    return this.exportsService.createTemplate(auth, input);
  }

  @Post("export-templates/emag-preset")
  @RequirePermissions("exports.run")
  createEmagPreset(@CurrentAuth() auth: RequestAuth) {
    return this.exportsService.createEmagPreset(auth);
  }

  @Get("exports")
  @RequirePermissions("exports.read")
  jobs(@CurrentAuth() auth: RequestAuth) {
    return this.exportsService.listJobs(auth);
  }

  @Get("exports/:id")
  @RequirePermissions("exports.read")
  get(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) {
    return this.exportsService.getJob(auth, id);
  }

  @Post("exports")
  @RequirePermissions("exports.run")
  run(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(runExportSchema)) input: RunExportInput,
    @Req() request: Request,
  ) {
    return this.exportsService.queueRun(auth, input, request.correlationId);
  }

  @Get("exports/:id/download")
  @RequirePermissions("exports.read")
  async download(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const file = await this.exportsService.download(auth, id);
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }
}
