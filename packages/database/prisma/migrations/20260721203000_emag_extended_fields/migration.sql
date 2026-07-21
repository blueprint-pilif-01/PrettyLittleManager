-- AlterTable
ALTER TABLE "BackgroundJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmagListingData" ADD COLUMN     "emagGenius" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "offerStatus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "supplyLeadTime" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "euResponsiblePersonEmail" TEXT,
ADD COLUMN     "manufacturerEmail" TEXT;
