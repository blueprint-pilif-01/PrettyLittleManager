import { Module } from "@nestjs/common";
import { EncryptionService } from "./encryption.service";
import { WebsiteApiKeyGuard } from "./website-api-key.guard";
import { WebsiteCatalogController, WebsitesController } from "./websites.controller";
import { WebsitesService } from "./websites.service";

@Module({
  controllers: [WebsitesController, WebsiteCatalogController],
  providers: [WebsitesService, WebsiteApiKeyGuard, EncryptionService],
  exports: [EncryptionService],
})
export class ChannelsModule {}
