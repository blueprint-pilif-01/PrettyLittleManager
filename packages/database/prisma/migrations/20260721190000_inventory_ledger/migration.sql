/*
  Warnings:

  - Added the required column `companyId` to the `InventoryMovement` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryTransferStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'APPLIED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryMovementType" ADD VALUE 'INITIAL';
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_RESERVATION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'RESERVATION_RELEASE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_COMPLETION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'RETURN_RECEIPT';
ALTER TYPE "InventoryMovementType" ADD VALUE 'MANUAL_INCREASE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'MANUAL_DECREASE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'DAMAGED';
ALTER TYPE "InventoryMovementType" ADD VALUE 'QUARANTINED';
ALTER TYPE "InventoryMovementType" ADD VALUE 'CORRECTION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'STOCK_COUNT';

-- DropIndex
DROP INDEX "InventoryMovement_variantId_occurredAt_idx";

-- DropIndex
DROP INDEX "InventoryMovement_warehouseId_occurredAt_idx";

-- AlterTable
ALTER TABLE "ChannelListing" ADD COLUMN     "lastIntendedStock" INTEGER,
ADD COLUMN     "lastRemoteStock" INTEGER,
ADD COLUMN     "lastStockSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSuccessfullyPublishedStock" INTEGER,
ADD COLUMN     "stockRetryCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "actorId" UUID,
ADD COLUMN     "balanceAfter" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "companyId" UUID,
ADD COLUMN     "damagedDelta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "incomingDelta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locationId" UUID,
ADD COLUMN     "physicalDelta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quarantinedDelta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referenceId" TEXT,
ADD COLUMN     "referenceType" TEXT,
ADD COLUMN     "reservedDelta" INTEGER NOT NULL DEFAULT 0;

-- Backfill tenant ownership for ledgers created before movements carried companyId.
UPDATE "InventoryMovement" AS movement
SET "companyId" = variant."companyId"
FROM "ProductVariant" AS variant
WHERE movement."variantId" = variant."id"
  AND movement."companyId" IS NULL;

ALTER TABLE "InventoryMovement" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockLevel" ADD COLUMN     "damaged" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "incoming" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quarantined" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WarehouseLocation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SELLABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "locationId" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL,
    "externalReference" TEXT,
    "idempotencyKey" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransfer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "sourceWarehouseId" UUID NOT NULL,
    "destinationWarehouseId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryTransferStatus" NOT NULL DEFAULT 'COMPLETED',
    "reason" TEXT NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStockCount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "expectedPhysical" INTEGER NOT NULL,
    "countedPhysical" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "idempotencyKey" UUID NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryStockCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseLocation_companyId_warehouseId_isActive_idx" ON "WarehouseLocation"("companyId", "warehouseId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseLocation_warehouseId_code_key" ON "WarehouseLocation"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_idempotencyKey_key" ON "InventoryReservation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryReservation_companyId_variantId_status_idx" ON "InventoryReservation"("companyId", "variantId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_companyId_warehouseId_status_idx" ON "InventoryReservation"("companyId", "warehouseId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_expiresAt_status_idx" ON "InventoryReservation"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_companyId_source_externalReference_key" ON "InventoryReservation"("companyId", "source", "externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_idempotencyKey_key" ON "InventoryTransfer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryTransfer_companyId_variantId_createdAt_idx" ON "InventoryTransfer"("companyId", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransfer_companyId_sourceWarehouseId_createdAt_idx" ON "InventoryTransfer"("companyId", "sourceWarehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransfer_companyId_destinationWarehouseId_createdA_idx" ON "InventoryTransfer"("companyId", "destinationWarehouseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStockCount_idempotencyKey_key" ON "InventoryStockCount"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryStockCount_companyId_status_createdAt_idx" ON "InventoryStockCount"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryStockCount_companyId_variantId_warehouseId_idx" ON "InventoryStockCount"("companyId", "variantId", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_variantId_occurredAt_idx" ON "InventoryMovement"("companyId", "variantId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_warehouseId_occurredAt_idx" ON "InventoryMovement"("companyId", "warehouseId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockCount" ADD CONSTRAINT "InventoryStockCount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockCount" ADD CONSTRAINT "InventoryStockCount_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockCount" ADD CONSTRAINT "InventoryStockCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockCount" ADD CONSTRAINT "InventoryStockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
