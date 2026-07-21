import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";
import { JobsModule } from "../jobs/jobs.module";

@Module({
  imports: [CatalogModule, InventoryModule, JobsModule],
  controllers: [ImportsController, ExportsController],
  providers: [ImportsService, ExportsService],
})
export class ImportExportModule {}
