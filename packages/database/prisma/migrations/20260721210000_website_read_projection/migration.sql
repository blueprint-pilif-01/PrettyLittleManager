-- CreateTable
CREATE TABLE "WebsiteListingData" (
    "id" UUID NOT NULL,
    "channelListingId" UUID NOT NULL,
    "price" DECIMAL(12,4),
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "stockBuffer" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "slug" TEXT,
    "imageAssignmentIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteListingData_pkey" PRIMARY KEY ("id")
);

-- Backfill any website listings created before the dedicated read projection existed.
INSERT INTO "WebsiteListingData" (
    "id", "channelListingId", "price", "currency", "stockBuffer",
    "seoTitle", "seoDescription", "slug", "imageAssignmentIds", "createdAt", "updatedAt"
)
SELECT
    md5(cl."id"::text || ':website-listing')::uuid,
    cl."id",
    CASE WHEN (cl."remoteMetadata"->>'price') ~ '^\d+(\.\d+)?$'
        THEN (cl."remoteMetadata"->>'price')::DECIMAL(12,4) ELSE NULL END,
    COALESCE(NULLIF(cl."remoteMetadata"->>'currency', ''), 'RON'),
    CASE WHEN (cl."remoteMetadata"->>'stockBuffer') ~ '^\d+$'
        THEN (cl."remoteMetadata"->>'stockBuffer')::INTEGER ELSE 0 END,
    cl."remoteMetadata"->>'seoTitle',
    cl."remoteMetadata"->>'seoDescription',
    cl."remoteMetadata"->>'slug',
    COALESCE(cl."remoteMetadata"->'imageAssignmentIds', '[]'::jsonb),
    cl."createdAt",
    CURRENT_TIMESTAMP
FROM "ChannelListing" cl
JOIN "ChannelAccount" ca ON ca."id" = cl."channelAccountId"
WHERE ca."type" = 'WEBSITE';

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteListingData_channelListingId_key" ON "WebsiteListingData"("channelListingId");

-- CreateIndex
CREATE INDEX "WebsiteListingData_currency_price_idx" ON "WebsiteListingData"("currency", "price");

-- CreateIndex
CREATE INDEX "WebsiteListingData_slug_idx" ON "WebsiteListingData"("slug");

-- AddForeignKey
ALTER TABLE "WebsiteListingData" ADD CONSTRAINT "WebsiteListingData_channelListingId_fkey" FOREIGN KEY ("channelListingId") REFERENCES "ChannelListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
