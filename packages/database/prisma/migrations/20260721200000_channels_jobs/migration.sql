/*
  Warnings:

  - Added the required column `updatedAt` to the `BackgroundJob` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EmagPublicationPath" AS ENUM ('NEW_PRODUCT', 'ATTACH_EXISTING', 'UPDATE_OFFER');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- AlterTable
ALTER TABLE "BackgroundJob" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "deadLetteredAt" TIMESTAMP(3),
ADD COLUMN     "deduplicationKey" TEXT,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "queueName" TEXT NOT NULL DEFAULT 'plm-operations',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "WebsiteApiCredential" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMapping" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "externalCategoryId" TEXT NOT NULL,
    "externalName" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmagCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "externalId" INTEGER NOT NULL,
    "parentExternalId" INTEGER,
    "name" TEXT NOT NULL,
    "isLeaf" BOOLEAN NOT NULL DEFAULT false,
    "isEanMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isWarrantyMandatory" BOOLEAN NOT NULL DEFAULT false,
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmagCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmagCharacteristic" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "emagCategoryId" UUID NOT NULL,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "presentationGroup" TEXT NOT NULL DEFAULT 'OTHER',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isRestrictive" BOOLEAN NOT NULL DEFAULT false,
    "isFilter" BOOLEAN NOT NULL DEFAULT false,
    "allowsMultiple" BOOLEAN NOT NULL DEFAULT false,
    "supportsTags" BOOLEAN NOT NULL DEFAULT false,
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmagCharacteristic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmagCharacteristicValue" (
    "id" UUID NOT NULL,
    "emagCharacteristicId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "displayValue" TEXT,
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "EmagCharacteristicValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmagFamilyType" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "emagCategoryId" UUID,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "characteristics" JSONB NOT NULL DEFAULT '[]',
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmagFamilyType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmagVatRate" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2),
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmagVatRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmagHandlingTime" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "channelAccountId" UUID NOT NULL,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minimumDays" INTEGER,
    "maximumDays" INTEGER,
    "rawMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmagHandlingTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmagListingData" (
    "id" UUID NOT NULL,
    "channelListingId" UUID NOT NULL,
    "publicationPath" "EmagPublicationPath",
    "sellerProductId" INTEGER NOT NULL,
    "partNumberKey" TEXT,
    "salePrice" DECIMAL(12,4),
    "recommendedPrice" DECIMAL(12,4),
    "minimumSalePrice" DECIMAL(12,4),
    "maximumSalePrice" DECIMAL(12,4),
    "vatId" INTEGER,
    "handlingTimeId" INTEGER,
    "warrantyMonths" INTEGER,
    "greenTax" DECIMAL(12,4),
    "stockBuffer" INTEGER NOT NULL DEFAULT 0,
    "sellerFamilyId" INTEGER,
    "familyName" TEXT,
    "familyTypeId" INTEGER,
    "characteristicMappings" JSONB NOT NULL DEFAULT '[]',
    "documentationErrors" JSONB NOT NULL DEFAULT '[]',
    "offerValidationStatus" JSONB NOT NULL DEFAULT '{}',
    "documentationStatus" JSONB NOT NULL DEFAULT '{}',
    "translationStatus" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmagListingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRequestLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "channelAccountId" UUID,
    "operation" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "httpMethod" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "sanitizedRequestPayload" JSONB,
    "sanitizedResponsePayload" JSONB,
    "responseStatus" INTEGER,
    "externalErrors" JSONB NOT NULL DEFAULT '[]',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncAttempt" (
    "id" UUID NOT NULL,
    "backgroundJobId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "requestLogId" UUID,
    "result" JSONB,
    "error" JSONB,

    CONSTRAINT "SyncAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteApiCredential_secretHash_key" ON "WebsiteApiCredential"("secretHash");

-- CreateIndex
CREATE INDEX "WebsiteApiCredential_companyId_keyPrefix_revokedAt_idx" ON "WebsiteApiCredential"("companyId", "keyPrefix", "revokedAt");

-- CreateIndex
CREATE INDEX "WebsiteApiCredential_channelAccountId_revokedAt_expiresAt_idx" ON "WebsiteApiCredential"("channelAccountId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "CategoryMapping_companyId_channelAccountId_idx" ON "CategoryMapping"("companyId", "channelAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMapping_categoryId_channelAccountId_key" ON "CategoryMapping"("categoryId", "channelAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMapping_channelAccountId_externalCategoryId_key" ON "CategoryMapping"("channelAccountId", "externalCategoryId");

-- CreateIndex
CREATE INDEX "EmagCategory_companyId_name_idx" ON "EmagCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "EmagCategory_channelAccountId_parentExternalId_idx" ON "EmagCategory"("channelAccountId", "parentExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "EmagCategory_channelAccountId_externalId_key" ON "EmagCategory"("channelAccountId", "externalId");

-- CreateIndex
CREATE INDEX "EmagCharacteristic_companyId_name_idx" ON "EmagCharacteristic"("companyId", "name");

-- CreateIndex
CREATE INDEX "EmagCharacteristic_emagCategoryId_presentationGroup_isRequi_idx" ON "EmagCharacteristic"("emagCategoryId", "presentationGroup", "isRequired");

-- CreateIndex
CREATE UNIQUE INDEX "EmagCharacteristic_emagCategoryId_externalId_key" ON "EmagCharacteristic"("emagCategoryId", "externalId");

-- CreateIndex
CREATE INDEX "EmagCharacteristicValue_emagCharacteristicId_value_idx" ON "EmagCharacteristicValue"("emagCharacteristicId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "EmagCharacteristicValue_emagCharacteristicId_externalId_key" ON "EmagCharacteristicValue"("emagCharacteristicId", "externalId");

-- CreateIndex
CREATE INDEX "EmagFamilyType_companyId_name_idx" ON "EmagFamilyType"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmagFamilyType_channelAccountId_externalId_key" ON "EmagFamilyType"("channelAccountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EmagVatRate_channelAccountId_externalId_key" ON "EmagVatRate"("channelAccountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EmagHandlingTime_channelAccountId_externalId_key" ON "EmagHandlingTime"("channelAccountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EmagListingData_channelListingId_key" ON "EmagListingData"("channelListingId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationRequestLog_requestId_key" ON "IntegrationRequestLog"("requestId");

-- CreateIndex
CREATE INDEX "IntegrationRequestLog_companyId_createdAt_idx" ON "IntegrationRequestLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationRequestLog_channelAccountId_operation_createdAt_idx" ON "IntegrationRequestLog"("channelAccountId", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationRequestLog_expiresAt_idx" ON "IntegrationRequestLog"("expiresAt");

-- CreateIndex
CREATE INDEX "SyncAttempt_status_startedAt_idx" ON "SyncAttempt"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncAttempt_backgroundJobId_attemptNumber_key" ON "SyncAttempt"("backgroundJobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "Notification_companyId_resolvedAt_createdAt_idx" ON "Notification"("companyId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_severity_createdAt_idx" ON "Notification"("companyId", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_companyId_type_deduplicationKey_idx" ON "BackgroundJob"("companyId", "type", "deduplicationKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_nextRetryAt_idx" ON "BackgroundJob"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "WebsiteApiCredential" ADD CONSTRAINT "WebsiteApiCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteApiCredential" ADD CONSTRAINT "WebsiteApiCredential_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteApiCredential" ADD CONSTRAINT "WebsiteApiCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMapping" ADD CONSTRAINT "CategoryMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMapping" ADD CONSTRAINT "CategoryMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMapping" ADD CONSTRAINT "CategoryMapping_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagCategory" ADD CONSTRAINT "EmagCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagCategory" ADD CONSTRAINT "EmagCategory_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagCharacteristic" ADD CONSTRAINT "EmagCharacteristic_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagCharacteristic" ADD CONSTRAINT "EmagCharacteristic_emagCategoryId_fkey" FOREIGN KEY ("emagCategoryId") REFERENCES "EmagCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagCharacteristicValue" ADD CONSTRAINT "EmagCharacteristicValue_emagCharacteristicId_fkey" FOREIGN KEY ("emagCharacteristicId") REFERENCES "EmagCharacteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagFamilyType" ADD CONSTRAINT "EmagFamilyType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagFamilyType" ADD CONSTRAINT "EmagFamilyType_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagFamilyType" ADD CONSTRAINT "EmagFamilyType_emagCategoryId_fkey" FOREIGN KEY ("emagCategoryId") REFERENCES "EmagCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagVatRate" ADD CONSTRAINT "EmagVatRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagVatRate" ADD CONSTRAINT "EmagVatRate_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagHandlingTime" ADD CONSTRAINT "EmagHandlingTime_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagHandlingTime" ADD CONSTRAINT "EmagHandlingTime_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmagListingData" ADD CONSTRAINT "EmagListingData_channelListingId_fkey" FOREIGN KEY ("channelListingId") REFERENCES "ChannelListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRequestLog" ADD CONSTRAINT "IntegrationRequestLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRequestLog" ADD CONSTRAINT "IntegrationRequestLog_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncAttempt" ADD CONSTRAINT "SyncAttempt_backgroundJobId_fkey" FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
