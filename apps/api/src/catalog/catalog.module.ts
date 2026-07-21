import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ReferenceDataController } from "./reference-data.controller";
import { ReferenceDataService } from "./reference-data.service";
import { AttributesController } from "./attributes.controller";
import { AttributesService } from "./attributes.service";
import { AttributeValueValidator } from "./attribute-value.validator";
import { ProductFamiliesController } from "./product-families.controller";
import { ProductFamiliesService } from "./product-families.service";
import { Gs1Controller } from "./gs1.controller";
import { Gs1Service } from "./gs1.service";
import { Gs1Connector, ManualGs1Connector } from "./gs1.connector";
import { Gs1ValidationService } from "./gs1-validation.service";
import { ImagesController, PublicMediaController } from "./images.controller";
import { ImagesService } from "./images.service";
import { ObjectStorageService } from "./object-storage.service";

@Module({
  controllers: [
    ProductsController,
    ReferenceDataController,
    AttributesController,
    ProductFamiliesController,
    Gs1Controller,
    ImagesController,
    PublicMediaController,
  ],
  providers: [
    ProductsService,
    ReferenceDataService,
    AttributesService,
    AttributeValueValidator,
    ProductFamiliesService,
    Gs1Service,
    Gs1ValidationService,
    { provide: Gs1Connector, useClass: ManualGs1Connector },
    ImagesService,
    ObjectStorageService,
  ],
  exports: [ProductsService, AttributeValueValidator, ObjectStorageService],
})
export class CatalogModule {}
