-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SIMPLE', 'PARENT', 'BUNDLE');

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'RICH_TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'SINGLE_SELECT', 'MULTI_SELECT', 'COLOR', 'MEASUREMENT', 'FILE', 'IMAGE', 'URL', 'EMAIL', 'JSON');

-- CreateEnum
CREATE TYPE "AttributeScope" AS ENUM ('PRODUCT', 'VARIANT');

-- CreateEnum
CREATE TYPE "ImageProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductImageRole" AS ENUM ('MAIN', 'SECONDARY', 'OTHER');

-- CreateEnum
CREATE TYPE "Gs1RegistrationStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'READY_FOR_REGISTRATION', 'SUBMITTED_MANUALLY', 'GTIN_ASSIGNED', 'VALIDATION_FAILED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "GtinType" AS ENUM ('GTIN_8', 'GTIN_12', 'GTIN_13', 'GTIN_14');

-- CreateEnum
CREATE TYPE "GtinAssignmentSource" AS ENUM ('MANUAL_GS1', 'IMPORTED', 'LEGACY');

-- CreateEnum
CREATE TYPE "SynchronizationStatus" AS ENUM ('NOT_SYNCED', 'QUEUED', 'IN_PROGRESS', 'SYNCED', 'FAILED', 'PARTIALLY_SYNCED', 'RECONCILIATION_REQUIRED');

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_familyId_fkey";

-- DropForeignKey
ALTER TABLE "StockLevel" DROP CONSTRAINT "StockLevel_productId_fkey";

-- DropIndex
DROP INDEX "ChannelListing_productId_channelAccountId_key";

-- DropIndex
DROP INDEX "InventoryMovement_productId_occurredAt_idx";

-- DropIndex
DROP INDEX "Product_companyId_gtin_key";

-- DropIndex
DROP INDEX "Product_companyId_name_idx";

-- DropIndex
DROP INDEX "Product_companyId_sku_key";

-- DropIndex
DROP INDEX "ProductFamily_companyId_name_idx";

-- DropIndex
DROP INDEX "StockLevel_productId_warehouseId_key";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "gs1GpcCode" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ChannelListing" DROP COLUMN "externalId",
ADD COLUMN     "companyId" UUID NOT NULL,
ADD COLUMN     "externalCategoryId" TEXT,
ADD COLUMN     "externalOfferId" TEXT,
ADD COLUMN     "externalProductId" TEXT,
ADD COLUMN     "lastError" JSONB,
ADD COLUMN     "lastSuccessfulPayloadHash" TEXT,
ADD COLUMN     "remoteMetadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "remoteUrl" TEXT,
ADD COLUMN     "synchronizationStatus" "SynchronizationStatus" NOT NULL DEFAULT 'NOT_SYNCED',
ADD COLUMN     "variantId" UUID,
ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "InventoryMovement" DROP COLUMN "productId",
ADD COLUMN     "variantId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "attributes",
DROP COLUMN "brand",
DROP COLUMN "channelData",
DROP COLUMN "currency",
DROP COLUMN "dimensions",
DROP COLUMN "familyId",
DROP COLUMN "gtin",
DROP COLUMN "name",
DROP COLUMN "price",
DROP COLUMN "safetyText",
DROP COLUMN "sku",
DROP COLUMN "vatRate",
DROP COLUMN "weightGrams",
ADD COLUMN     "brandId" UUID,
ADD COLUMN     "createdById" UUID NOT NULL,
ADD COLUMN     "defaultCurrency" TEXT NOT NULL DEFAULT 'RON',
ADD COLUMN     "defaultLanguage" TEXT NOT NULL DEFAULT 'ro',
ADD COLUMN     "defaultVatRate" DECIMAL(5,2),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "diameter" DECIMAL(12,3),
ADD COLUMN     "dimensionUnit" TEXT DEFAULT 'MM',
ADD COLUMN     "euResponsiblePersonAddress" TEXT,
ADD COLUMN     "euResponsiblePersonName" TEXT,
ADD COLUMN     "gs1LabelDescription" TEXT,
ADD COLUMN     "height" DECIMAL(12,3),
ADD COLUMN     "internalName" TEXT NOT NULL,
ADD COLUMN     "length" DECIMAL(12,3),
ADD COLUMN     "manufacturerAddress" TEXT,
ADD COLUMN     "manufacturerName" TEXT,
ADD COLUMN     "manufacturerPartNumber" TEXT,
ADD COLUMN     "parentProductId" UUID,
ADD COLUMN     "productType" "ProductType" NOT NULL DEFAULT 'SIMPLE',
ADD COLUMN     "publicName" TEXT NOT NULL,
ADD COLUMN     "safetyInformation" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "shortName" TEXT,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "taxClass" TEXT,
ADD COLUMN     "updatedById" UUID NOT NULL,
ADD COLUMN     "weight" DECIMAL(12,3),
ADD COLUMN     "weightUnit" TEXT DEFAULT 'G',
ADD COLUMN     "width" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "ProductFamily" DROP COLUMN "attributes",
ADD COLUMN     "channelMetadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "productId" UUID NOT NULL,
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "variationAxes" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "StockLevel" DROP COLUMN "productId",
ADD COLUMN     "variantId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "manufacturer" TEXT,
    "websiteUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "dataType" "AttributeDataType" NOT NULL,
    "scope" "AttributeScope" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "minimum" DECIMAL(18,6),
    "maximum" DECIMAL(18,6),
    "regexPattern" TEXT,
    "unitType" TEXT,
    "isSearchable" BOOLEAN NOT NULL DEFAULT false,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isComparable" BOOLEAN NOT NULL DEFAULT false,
    "isInheritable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "localization" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" UUID NOT NULL,
    "attributeDefinitionId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "localization" JSONB NOT NULL DEFAULT '{}',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryAttributeDefinition" (
    "categoryId" UUID NOT NULL,
    "attributeDefinitionId" UUID NOT NULL,
    "isRequiredOverride" BOOLEAN,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryAttributeDefinition_pkey" PRIMARY KEY ("categoryId","attributeDefinitionId")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "internalNumericId" INTEGER NOT NULL,
    "gtin" TEXT,
    "gtinType" "GtinType",
    "variantName" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "basePrice" DECIMAL(12,2),
    "costPrice" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "weight" DECIMAL(12,3),
    "weightUnit" TEXT,
    "length" DECIMAL(12,3),
    "width" DECIMAL(12,3),
    "height" DECIMAL(12,3),
    "diameter" DECIMAL(12,3),
    "dimensionUnit" TEXT,
    "isDefaultVariant" BOOLEAN NOT NULL DEFAULT false,
    "variationValues" JSONB NOT NULL DEFAULT '{}',
    "variationKey" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFamilyMember" (
    "familyId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductFamilyMember_pkey" PRIMARY KEY ("familyId","variantId")
);

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "attributeDefinitionId" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT '',
    "value" JSONB NOT NULL,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttributeValue" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "attributeDefinitionId" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT '',
    "value" JSONB NOT NULL,
    "isOverride" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "processingStatus" "ImageProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "publicUrl" TEXT,
    "thumbnailUrl" TEXT,
    "mediumUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImageAssignment" (
    "id" UUID NOT NULL,
    "imageId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "role" "ProductImageRole" NOT NULL DEFAULT 'OTHER',
    "position" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,

    CONSTRAINT "ProductImageAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gs1Registration" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "status" "Gs1RegistrationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "gtinType" "GtinType" NOT NULL DEFAULT 'GTIN_13',
    "activityDomain" TEXT,
    "productName" TEXT,
    "shortProductName" TEXT,
    "labelDescription" TEXT,
    "isPromotionalProduct" BOOLEAN NOT NULL DEFAULT false,
    "brand" TEXT,
    "internalCode" TEXT,
    "packagingMaterial" TEXT,
    "packagingType" TEXT,
    "netQuantity" DECIMAL(18,6),
    "netQuantityUnit" TEXT,
    "targetMarkets" JSONB NOT NULL DEFAULT '[]',
    "productPresentationUrl" TEXT,
    "productImageUrl" TEXT,
    "height" DECIMAL(12,3),
    "heightUnit" TEXT,
    "width" DECIMAL(12,3),
    "widthUnit" TEXT,
    "length" DECIMAL(12,3),
    "lengthUnit" TEXT,
    "diameter" DECIMAL(12,3),
    "diameterUnit" TEXT,
    "romanianDistributionNetworks" JSONB NOT NULL DEFAULT '[]',
    "otherDistributionNetworks" JSONB NOT NULL DEFAULT '[]',
    "gpcCode" TEXT,
    "responsibilityConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gs1Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtinAssignment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "gtin" TEXT NOT NULL,
    "gtinType" "GtinType" NOT NULL,
    "source" "GtinAssignmentSource" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GtinAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_companyId_name_idx" ON "Brand"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_companyId_slug_key" ON "Brand"("companyId", "slug");

-- CreateIndex
CREATE INDEX "AttributeDefinition_companyId_scope_isActive_displayOrder_idx" ON "AttributeDefinition"("companyId", "scope", "isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "AttributeDefinition_companyId_isSearchable_idx" ON "AttributeDefinition"("companyId", "isSearchable");

-- CreateIndex
CREATE INDEX "AttributeDefinition_companyId_isFilterable_idx" ON "AttributeDefinition"("companyId", "isFilterable");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_companyId_key_key" ON "AttributeDefinition"("companyId", "key");

-- CreateIndex
CREATE INDEX "AttributeOption_attributeDefinitionId_displayOrder_idx" ON "AttributeOption"("attributeDefinitionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_attributeDefinitionId_value_key" ON "AttributeOption"("attributeDefinitionId", "value");

-- CreateIndex
CREATE INDEX "CategoryAttributeDefinition_attributeDefinitionId_idx" ON "CategoryAttributeDefinition"("attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_gtin_key" ON "ProductVariant"("gtin");

-- CreateIndex
CREATE INDEX "ProductVariant_companyId_status_updatedAt_idx" ON "ProductVariant"("companyId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ProductVariant_companyId_productId_status_idx" ON "ProductVariant"("companyId", "productId", "status");

-- CreateIndex
CREATE INDEX "ProductVariant_companyId_gtin_idx" ON "ProductVariant"("companyId", "gtin");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_companyId_sku_key" ON "ProductVariant"("companyId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_companyId_internalNumericId_key" ON "ProductVariant"("companyId", "internalNumericId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_variationKey_key" ON "ProductVariant"("productId", "variationKey");

-- CreateIndex
CREATE INDEX "ProductFamilyMember_familyId_position_idx" ON "ProductFamilyMember"("familyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFamilyMember_variantId_key" ON "ProductFamilyMember"("variantId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_attributeDefinitionId_idx" ON "ProductAttributeValue"("attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeDefinitionId_local_key" ON "ProductAttributeValue"("productId", "attributeDefinitionId", "locale");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_attributeDefinitionId_idx" ON "VariantAttributeValue"("attributeDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValue_variantId_attributeDefinitionId_local_key" ON "VariantAttributeValue"("variantId", "attributeDefinitionId", "locale");

-- CreateIndex
CREATE INDEX "ProductImage_companyId_processingStatus_createdAt_idx" ON "ProductImage"("companyId", "processingStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_companyId_objectKey_key" ON "ProductImage"("companyId", "objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_companyId_sha256_key" ON "ProductImage"("companyId", "sha256");

-- CreateIndex
CREATE INDEX "ProductImageAssignment_productId_position_idx" ON "ProductImageAssignment"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductImageAssignment_variantId_position_idx" ON "ProductImageAssignment"("variantId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImageAssignment_imageId_productId_variantId_key" ON "ProductImageAssignment"("imageId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Gs1Registration_variantId_key" ON "Gs1Registration"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GtinAssignment_variantId_key" ON "GtinAssignment"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GtinAssignment_gtin_key" ON "GtinAssignment"("gtin");

-- CreateIndex
CREATE INDEX "GtinAssignment_companyId_assignedAt_idx" ON "GtinAssignment"("companyId", "assignedAt");

-- CreateIndex
CREATE INDEX "Category_companyId_isActive_name_idx" ON "Category"("companyId", "isActive", "name");

-- CreateIndex
CREATE INDEX "ChannelListing_companyId_status_synchronizationStatus_idx" ON "ChannelListing"("companyId", "status", "synchronizationStatus");

-- CreateIndex
CREATE INDEX "ChannelListing_companyId_externalProductId_idx" ON "ChannelListing"("companyId", "externalProductId");

-- CreateIndex
CREATE INDEX "ChannelListing_companyId_externalOfferId_idx" ON "ChannelListing"("companyId", "externalOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelListing_channelAccountId_productId_variantId_key" ON "ChannelListing"("channelAccountId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "InventoryMovement_variantId_occurredAt_idx" ON "InventoryMovement"("variantId", "occurredAt");

-- CreateIndex
CREATE INDEX "Product_companyId_productType_status_idx" ON "Product"("companyId", "productType", "status");

-- CreateIndex
CREATE INDEX "Product_companyId_categoryId_status_idx" ON "Product"("companyId", "categoryId", "status");

-- CreateIndex
CREATE INDEX "Product_companyId_brandId_status_idx" ON "Product"("companyId", "brandId", "status");

-- CreateIndex
CREATE INDEX "Product_companyId_parentProductId_idx" ON "Product"("companyId", "parentProductId");

-- CreateIndex
CREATE INDEX "Product_companyId_internalName_idx" ON "Product"("companyId", "internalName");

-- CreateIndex
CREATE INDEX "Product_companyId_publicName_idx" ON "Product"("companyId", "publicName");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_slug_key" ON "Product"("companyId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFamily_productId_key" ON "ProductFamily"("productId");

-- CreateIndex
CREATE INDEX "ProductFamily_companyId_status_name_idx" ON "ProductFamily"("companyId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_variantId_warehouseId_key" ON "StockLevel"("variantId", "warehouseId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeDefinition" ADD CONSTRAINT "AttributeDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttributeDefinition" ADD CONSTRAINT "CategoryAttributeDefinition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAttributeDefinition" ADD CONSTRAINT "CategoryAttributeDefinition_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFamily" ADD CONSTRAINT "ProductFamily_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFamilyMember" ADD CONSTRAINT "ProductFamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFamilyMember" ADD CONSTRAINT "ProductFamilyMember_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageAssignment" ADD CONSTRAINT "ProductImageAssignment_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageAssignment" ADD CONSTRAINT "ProductImageAssignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageAssignment" ADD CONSTRAINT "ProductImageAssignment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gs1Registration" ADD CONSTRAINT "Gs1Registration_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtinAssignment" ADD CONSTRAINT "GtinAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtinAssignment" ADD CONSTRAINT "GtinAssignment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtinAssignment" ADD CONSTRAINT "GtinAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelListing" ADD CONSTRAINT "ChannelListing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelListing" ADD CONSTRAINT "ChannelListing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
