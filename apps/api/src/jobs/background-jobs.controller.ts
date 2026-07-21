import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { jobQuerySchema, type JobQuery } from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BackgroundJobsService } from "./background-jobs.service";

@ApiTags("Background jobs")
@ApiBearerAuth()
@Controller("sync-jobs")
export class BackgroundJobsController {
  constructor(private readonly jobs: BackgroundJobsService) {}
  @Get()
  @RequirePermissions("integration.read")
  list(@CurrentAuth() auth: RequestAuth, @Query(new ZodValidationPipe(jobQuerySchema)) query: JobQuery) { return this.jobs.list(auth, query); }
  @Get(":id")
  @RequirePermissions("integration.read")
  detail(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.jobs.detail(auth, id); }
  @Post(":id/retry")
  @RequirePermissions("integration.sync")
  retry(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.jobs.retry(auth, id); }
  @Post(":id/cancel")
  @RequirePermissions("integration.sync")
  cancel(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.jobs.cancel(auth, id); }
}

@ApiTags("Notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly jobs: BackgroundJobsService) {}
  @Get()
  @RequirePermissions("integration.read")
  list(@CurrentAuth() auth: RequestAuth, @Query("cursor") cursor?: string, @Query("limit") rawLimit?: string) {
    const limit = Math.max(1, Math.min(Number(rawLimit ?? 25) || 25, 100));
    return this.jobs.listNotifications(auth, cursor, limit);
  }
  @Patch(":id/resolve")
  @RequirePermissions("integration.read")
  resolve(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.jobs.resolveNotification(auth, id); }
}
