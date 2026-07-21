import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccessModule } from "./access/access.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { PermissionsGuard } from "./access/permissions.guard";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { CorrelationMiddleware } from "./common/correlation.middleware";
import { CsrfOriginMiddleware } from "./common/csrf-origin.middleware";
import { PrismaModule } from "./database/prisma.module";
import { CatalogModule } from "./catalog/catalog.module";
import { HealthController } from "./health.controller";
import { IntegrationController } from "./integration.controller";
import { WorkspaceController } from "./workspace.controller";
import { InventoryModule } from "./inventory/inventory.module";
import { ImportExportModule } from "./import-export/import-export.module";
import { ChannelsModule } from "./channels/channels.module";
import { JobsModule } from "./jobs/jobs.module";
import { EmagModule } from "./emag/emag.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: ["../../.env", ".env"],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    AccessModule,
    CatalogModule,
    InventoryModule,
    ImportExportModule,
    ChannelsModule,
    JobsModule,
    EmagModule,
  ],
  controllers: [HealthController, IntegrationController, WorkspaceController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware, CsrfOriginMiddleware).forRoutes("*");
  }
}
