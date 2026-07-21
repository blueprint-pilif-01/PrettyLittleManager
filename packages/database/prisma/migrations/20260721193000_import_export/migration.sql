-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('XLS', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'MAPPING', 'VALIDATED', 'QUEUED', 'RUNNING', 'PARTIALLY_SUCCEEDED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'WARNING', 'BLOCKED', 'IMPORTED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ImportMappingTemplate" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL DEFAULT 'PRODUCT_VARIANT',
    "format" "FileFormat",
    "sheetName" TEXT,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "mappings" JSONB NOT NULL,
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportMappingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "mappingTemplateId" UUID,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "format" "FileFormat" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sheetName" TEXT,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "detectedSheets" JSONB NOT NULL DEFAULT '[]',
    "detectedHeaders" JSONB NOT NULL DEFAULT '[]',
    "previewRows" JSONB NOT NULL DEFAULT '[]',
    "mappingSnapshot" JSONB NOT NULL DEFAULT '[]',
    "defaultsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "validationSummary" JSONB NOT NULL DEFAULT '{}',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successfulRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "reportObjectKey" TEXT,
    "reportUrl" TEXT,
    "error" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowResult" (
    "id" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "sourceData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "productId" UUID,
    "variantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRowResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportTemplate" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL DEFAULT 'PRODUCT_VARIANT',
    "format" "FileFormat" NOT NULL DEFAULT 'XLSX',
    "mappings" JSONB NOT NULL,
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "exportTemplateId" UUID,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "format" "FileFormat" NOT NULL,
    "mappingSnapshot" JSONB NOT NULL,
    "filtersSnapshot" JSONB NOT NULL DEFAULT '{}',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "outputObjectKey" TEXT,
    "outputUrl" TEXT,
    "error" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportMappingTemplate_companyId_isActive_updatedAt_idx" ON "ImportMappingTemplate"("companyId", "isActive", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMappingTemplate_companyId_name_key" ON "ImportMappingTemplate"("companyId", "name");

-- CreateIndex
CREATE INDEX "ImportJob_companyId_status_createdAt_idx" ON "ImportJob"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_companyId_sha256_idx" ON "ImportJob"("companyId", "sha256");

-- CreateIndex
CREATE INDEX "ImportRowResult_importJobId_status_rowNumber_idx" ON "ImportRowResult"("importJobId", "status", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRowResult_importJobId_rowNumber_key" ON "ImportRowResult"("importJobId", "rowNumber");

-- CreateIndex
CREATE INDEX "ExportTemplate_companyId_isActive_updatedAt_idx" ON "ExportTemplate"("companyId", "isActive", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExportTemplate_companyId_name_key" ON "ExportTemplate"("companyId", "name");

-- CreateIndex
CREATE INDEX "ExportJob_companyId_status_createdAt_idx" ON "ExportJob"("companyId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ImportMappingTemplate" ADD CONSTRAINT "ImportMappingTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMappingTemplate" ADD CONSTRAINT "ImportMappingTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_mappingTemplateId_fkey" FOREIGN KEY ("mappingTemplateId") REFERENCES "ImportMappingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowResult" ADD CONSTRAINT "ImportRowResult_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportTemplate" ADD CONSTRAINT "ExportTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportTemplate" ADD CONSTRAINT "ExportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_exportTemplateId_fkey" FOREIGN KEY ("exportTemplateId") REFERENCES "ExportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
