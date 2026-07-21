ALTER TABLE "ProductFamily" ADD COLUMN "sellerFamilyId" INTEGER;

CREATE UNIQUE INDEX "ProductFamily_companyId_sellerFamilyId_key"
ON "ProductFamily"("companyId", "sellerFamilyId");

ALTER TABLE "ProductFamily"
ADD CONSTRAINT "ProductFamily_sellerFamilyId_check"
CHECK ("sellerFamilyId" IS NULL OR "sellerFamilyId" > 0);
