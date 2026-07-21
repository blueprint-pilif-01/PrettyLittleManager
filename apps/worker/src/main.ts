import "dotenv/config";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  createEmagClient,
  marketplaceApiUrls,
  type EmagApiResult,
  type EmagConfig,
  type EmagMarketplace,
  type EmagProductOfferSave,
} from "@plm/emag";
import { Job, Queue, Worker } from "bullmq";
import { resolve } from "node:path";

const prisma = new PrismaClient();
const redis = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
  maxRetriesPerRequest: null,
  ...(redis.protocol === "rediss:" ? { tls: {} } : {}),
};
const queueSettings = [
  { name: "marketplace-publication", concurrency: 2 },
  { name: "stock-sync", concurrency: 5 },
  { name: "imports", concurrency: 1 },
  { name: "exports", concurrency: 2 },
  { name: "image-processing", concurrency: 2 },
  { name: "reconciliation", concurrency: 2 },
  { name: "notifications", concurrency: 3 },
] as const;
const queues = new Map(queueSettings.map(({ name }) => [name, new Queue(name, { connection })]));
let outboxRunning = false;
let apiContext: any;

type EmagConfiguration = { marketplace: EmagMarketplace; mode: "mock" | "live"; apiUrl: string; sourceLanguage?: string };
type EmagCredentials = { username: string; password: string };
type JobPayload = { backgroundJobId: string };

async function processDurableJob(queueJob: Job<JobPayload>) {
  const background = await prisma.backgroundJob.findUnique({ where: { id: queueJob.data.backgroundJobId } });
  if (!background) throw new Error(`Background job ${queueJob.data.backgroundJobId} no longer exists`);
  if (background.status === "CANCELLED") return { cancelled: true };
  const attemptNumber = background.attempt + 1;
  const startedAt = new Date();
  await prisma.$transaction([
    prisma.backgroundJob.update({ where: { id: background.id }, data: { status: "RUNNING", attempt: attemptNumber, startedAt: background.startedAt ?? startedAt, progress: 1, nextRetryAt: null } }),
    prisma.syncAttempt.create({ data: { backgroundJobId: background.id, attemptNumber, status: "RUNNING", startedAt } }),
  ]);
  try {
    const result = await dispatch(background.type, asRecord(background.input), background, queueJob);
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.syncAttempt.update({ where: { backgroundJobId_attemptNumber: { backgroundJobId: background.id, attemptNumber } }, data: { status: "SUCCEEDED", result: json(result), completedAt, durationMs: completedAt.getTime() - startedAt.getTime() } }),
      prisma.backgroundJob.update({ where: { id: background.id }, data: { status: "SUCCEEDED", progress: 100, result: json(result), error: Prisma.DbNull, completedAt } }),
    ]);
    return result;
  } catch (error) {
    const completedAt = new Date();
    const serialized = serializeError(error);
    const finalAttempt = attemptNumber >= background.maxAttempts;
    await prisma.$transaction([
      prisma.syncAttempt.update({ where: { backgroundJobId_attemptNumber: { backgroundJobId: background.id, attemptNumber } }, data: { status: "FAILED", error: serialized, completedAt, durationMs: completedAt.getTime() - startedAt.getTime() } }),
      prisma.backgroundJob.update({ where: { id: background.id }, data: { status: finalAttempt ? "FAILED" : "QUEUED", error: serialized, ...(finalAttempt ? { completedAt, deadLetteredAt: completedAt } : { nextRetryAt: new Date(Date.now() + Math.min(30_000, 1_000 * 2 ** attemptNumber)) }) } }),
      ...(finalAttempt ? [prisma.notification.create({ data: { companyId: background.companyId, severity: "ERROR", type: "BACKGROUND_JOB_FAILED", title: "Background operation failed", message: `${background.type} failed after ${attemptNumber} attempts`, entityType: "BackgroundJob", entityId: background.id, metadata: serialized } })] : []),
    ]);
    throw error;
  }
}

async function dispatch(type: string, input: Record<string, unknown>, background: { id: string; companyId: string; correlationId: string | null }, queueJob: Job) {
  switch (type) {
    case "emag.metadata.sync": return syncEmagMetadata(requiredString(input.accountId, "accountId"), background);
    case "emag.ean.lookup": return lookupEans(requiredString(input.accountId, "accountId"), stringArray(input.eans), background);
    case "emag.publish": return publishListings(requiredString(input.accountId, "accountId"), stringArray(input.listingIds), background, queueJob);
    case "emag.documentation": return publishListings(requiredString(input.accountId, "accountId"), stringArray(input.listingIds), background, queueJob);
    case "emag.price": return updateOffers(requiredString(input.accountId, "accountId"), stringArray(input.listingIds), "price", background, queueJob);
    case "emag.status": return updateOffers(requiredString(input.accountId, "accountId"), stringArray(input.listingIds), "status", background, queueJob);
    case "emag.stock": return updateStock(requiredString(input.accountId, "accountId"), stringArray(input.listingIds), background, queueJob);
    case "emag.reconcile": return reconcileListings(requiredString(input.accountId, "accountId"), stringArray(input.listingIds), background, queueJob);
    case "emag.healthcheck": {
      const { client } = await emagClient(requiredString(input.accountId, "accountId"), background.companyId);
      return client.healthcheck();
    }
    case "imports.execute": return executeApiService("import-export/imports.service.js", "ImportsService", "execute", [asRecord(input.actor), requiredString(input.importJobId, "importJobId"), asRecord(input.input)]);
    case "exports.run": return executeApiService("import-export/exports.service.js", "ExportsService", "run", [asRecord(input.actor), asRecord(input.input)]);
    default: throw new Error(`Unsupported job type: ${type}`);
  }
}

async function executeApiService(moduleFile: string, exportName: string, method: string, args: unknown[]) {
  if (!apiContext) {
    require(resolve(__dirname, "../../api/node_modules/reflect-metadata"));
    const { NestFactory } = require(resolve(__dirname, "../../api/node_modules/@nestjs/core"));
    const { AppModule } = require(resolve(__dirname, "../../api/dist/app.module.js"));
    apiContext = await NestFactory.createApplicationContext(AppModule, { logger: false });
  }
  const serviceModule = require(resolve(__dirname, `../../api/dist/${moduleFile}`));
  const ServiceClass = serviceModule[exportName];
  if (!ServiceClass) throw new Error(`API service ${exportName} is unavailable`);
  const service = apiContext.get(ServiceClass, { strict: false });
  return service[method](...args);
}

async function emagClient(accountId: string, companyId: string) {
  const account = await prisma.channelAccount.findFirst({ where: { id: accountId, companyId, type: "EMAG" } });
  if (!account) throw new Error("eMAG account was not found or belongs to another company");
  const configuration = account.configuration as EmagConfiguration;
  let credentials: EmagCredentials | undefined;
  if (configuration.mode === "live") {
    if (!account.encryptedCredentials) throw new Error("Live eMAG account has no credentials");
    credentials = decryptCredentials(account.encryptedCredentials);
  }
  const config: EmagConfig = {
    mode: configuration.mode,
    marketplace: configuration.marketplace,
    apiUrl: configuration.apiUrl ?? marketplaceApiUrls[configuration.marketplace] ?? marketplaceApiUrls.EMAG_RO,
    ...credentials,
  };
  return { account, client: createEmagClient(config) };
}

async function syncEmagMetadata(accountId: string, background: { id: string; companyId: string; correlationId: string | null }) {
  const { client } = await emagClient(accountId, background.companyId);
  const categoryResults: EmagApiResult[] = [];
  for (let currentPage = 1; currentPage <= 1_000; currentPage += 1) {
    const result = await client.listCategories({ currentPage, itemsPerPage: 100, valuesCurrentPage: 1, valuesPerPage: 500 });
    categoryResults.push(result);
    await persistLog(accountId, background, "category.read", "/category/read", "POST", result, { currentPage, itemsPerPage: 100, valuesCurrentPage: 1, valuesPerPage: 500 });
    assertResult(result, "eMAG category synchronization failed");
    if (resultRows(result).length < 100) break;
  }
  const [vatResult, handlingResult] = await Promise.all([client.listVatRates(), client.listHandlingTimes()]);
  await Promise.all([
    persistLog(accountId, background, "vat.read", "/vat/read", "POST", vatResult, {}),
    persistLog(accountId, background, "handling_time.read", "/handling_time/read", "POST", handlingResult, {}),
  ]);
  assertResult(vatResult, "eMAG VAT synchronization failed");
  assertResult(handlingResult, "eMAG handling-time synchronization failed");
  const categoryRows = categoryResults.flatMap((result) => resultRows(result));
  const now = new Date();
  let characteristicCount = 0;
  for (const raw of categoryRows) {
    const externalId = numeric(raw.id);
    if (!externalId) continue;
    const category = await prisma.emagCategory.upsert({
      where: { channelAccountId_externalId: { channelAccountId: accountId, externalId } },
      create: { companyId: background.companyId, channelAccountId: accountId, externalId, parentExternalId: nullableNumeric(raw.parent_id ?? raw.parentId), name: text(raw.name) || `Category ${externalId}`, isLeaf: bool(raw.is_leaf ?? raw.isLeaf), isEanMandatory: bool(raw.is_ean_mandatory), isWarrantyMandatory: bool(raw.is_warranty_mandatory), rawMetadata: json(raw), lastSyncedAt: now },
      update: { parentExternalId: nullableNumeric(raw.parent_id ?? raw.parentId), name: text(raw.name) || `Category ${externalId}`, isLeaf: bool(raw.is_leaf ?? raw.isLeaf), isEanMandatory: bool(raw.is_ean_mandatory), isWarrantyMandatory: bool(raw.is_warranty_mandatory), rawMetadata: json(raw), lastSyncedAt: now },
    });
    const characteristics = recordArray(raw.characteristics);
    for (const characteristicRaw of characteristics) {
      const characteristicId = numeric(characteristicRaw.id);
      if (!characteristicId) continue;
      const characteristic = await prisma.emagCharacteristic.upsert({
        where: { emagCategoryId_externalId: { emagCategoryId: category.id, externalId: characteristicId } },
        create: { companyId: background.companyId, emagCategoryId: category.id, externalId: characteristicId, name: text(characteristicRaw.name) || `Characteristic ${characteristicId}`, type: text(characteristicRaw.type) || null, presentationGroup: characteristicGroup(characteristicRaw), isRequired: bool(characteristicRaw.is_mandatory ?? characteristicRaw.is_required), isRestrictive: bool(characteristicRaw.is_restrictive), isFilter: bool(characteristicRaw.is_filter), allowsMultiple: bool(characteristicRaw.is_multiple ?? characteristicRaw.allows_multiple), supportsTags: bool(characteristicRaw.has_tags ?? characteristicRaw.supports_tags), rawMetadata: json(characteristicRaw), lastSyncedAt: now },
        update: { name: text(characteristicRaw.name) || `Characteristic ${characteristicId}`, type: text(characteristicRaw.type) || null, presentationGroup: characteristicGroup(characteristicRaw), isRequired: bool(characteristicRaw.is_mandatory ?? characteristicRaw.is_required), isRestrictive: bool(characteristicRaw.is_restrictive), isFilter: bool(characteristicRaw.is_filter), allowsMultiple: bool(characteristicRaw.is_multiple ?? characteristicRaw.allows_multiple), supportsTags: bool(characteristicRaw.has_tags ?? characteristicRaw.supports_tags), rawMetadata: json(characteristicRaw), lastSyncedAt: now },
      });
      characteristicCount += 1;
      for (const valueRaw of recordArray(characteristicRaw.values ?? characteristicRaw.characteristic_values)) {
        const externalValueId = text(valueRaw.id ?? valueRaw.value);
        if (!externalValueId) continue;
        await prisma.emagCharacteristicValue.upsert({
          where: { emagCharacteristicId_externalId: { emagCharacteristicId: characteristic.id, externalId: externalValueId } },
          create: { emagCharacteristicId: characteristic.id, externalId: externalValueId, value: text(valueRaw.value ?? valueRaw.name) || externalValueId, displayValue: text(valueRaw.display_value ?? valueRaw.name) || null, rawMetadata: json(valueRaw) },
          update: { value: text(valueRaw.value ?? valueRaw.name) || externalValueId, displayValue: text(valueRaw.display_value ?? valueRaw.name) || null, rawMetadata: json(valueRaw) },
        });
      }
    }
    for (const familyRaw of recordArray(raw.family_types ?? raw.families)) {
      const familyId = numeric(familyRaw.id); if (!familyId) continue;
      await prisma.emagFamilyType.upsert({
        where: { channelAccountId_externalId: { channelAccountId: accountId, externalId: familyId } },
        create: { companyId: background.companyId, channelAccountId: accountId, emagCategoryId: category.id, externalId: familyId, name: text(familyRaw.name) || `Family ${familyId}`, characteristics: json(familyRaw.characteristics ?? []), rawMetadata: json(familyRaw), lastSyncedAt: now },
        update: { emagCategoryId: category.id, name: text(familyRaw.name) || `Family ${familyId}`, characteristics: json(familyRaw.characteristics ?? []), rawMetadata: json(familyRaw), lastSyncedAt: now },
      });
    }
  }
  for (const raw of resultRows(vatResult)) {
    const id = numeric(raw.id); if (!id) continue;
    await prisma.emagVatRate.upsert({ where: { channelAccountId_externalId: { channelAccountId: accountId, externalId: id } }, create: { companyId: background.companyId, channelAccountId: accountId, externalId: id, name: text(raw.name) || `VAT ${id}`, rate: nullableDecimal(raw.value ?? raw.rate), rawMetadata: json(raw), lastSyncedAt: now }, update: { name: text(raw.name) || `VAT ${id}`, rate: nullableDecimal(raw.value ?? raw.rate), rawMetadata: json(raw), lastSyncedAt: now } });
  }
  for (const raw of resultRows(handlingResult)) {
    const id = numeric(raw.id); if (!id) continue;
    await prisma.emagHandlingTime.upsert({ where: { channelAccountId_externalId: { channelAccountId: accountId, externalId: id } }, create: { companyId: background.companyId, channelAccountId: accountId, externalId: id, name: text(raw.name) || `Handling ${id}`, minimumDays: nullableNumeric(raw.min_days ?? raw.minimum_days), maximumDays: nullableNumeric(raw.max_days ?? raw.maximum_days), rawMetadata: json(raw), lastSyncedAt: now }, update: { name: text(raw.name) || `Handling ${id}`, minimumDays: nullableNumeric(raw.min_days ?? raw.minimum_days), maximumDays: nullableNumeric(raw.max_days ?? raw.maximum_days), rawMetadata: json(raw), lastSyncedAt: now } });
  }
  await prisma.channelAccount.update({ where: { id: accountId }, data: { lastHealthCheckAt: now } });
  return { categories: categoryRows.length, characteristics: characteristicCount, vatRates: resultRows(vatResult).length, handlingTimes: resultRows(handlingResult).length };
}

async function lookupEans(accountId: string, eans: string[], background: { id: string; companyId: string; correlationId: string | null }) {
  const { client } = await emagClient(accountId, background.companyId);
  const result = await client.findByEans(eans);
  await persistLog(accountId, background, "documentation.find_by_eans", "/documentation/find_by_eans", "GET", result, { eans });
  assertResult(result, "eMAG EAN lookup failed");
  return { eans, matches: result.body.results ?? [] };
}

async function publishListings(accountId: string, listingIds: string[], background: { id: string; companyId: string; correlationId: string | null }, queueJob: Job) {
  const { client } = await emagClient(accountId, background.companyId);
  const listings = await scopedListings(accountId, background.companyId, listingIds);
  const invalid = listings.filter((listing) => !asRecord(listing.validation).valid || !listing.payloadSnapshot);
  if (invalid.length) throw new Error(`Listings failed local eMAG validation: ${invalid.map((item) => item.id).join(", ")}`);
  await prisma.channelListing.updateMany({ where: { id: { in: listingIds } }, data: { synchronizationStatus: "IN_PROGRESS" } });
  const payloads = listings.map((listing) => listing.payloadSnapshot as unknown as EmagProductOfferSave);
  const results = await client.saveProductOffers(payloads);
  for (const result of results) await persistLog(accountId, background, "product_offer.save", "/product_offer/save", "POST", result, { listingIds });
  const failed = results.some((result) => !result.ok && !result.uncertain);
  const uncertain = results.some((result) => result.uncertain);
  if (failed) {
    await prisma.channelListing.updateMany({ where: { id: { in: listingIds } }, data: { status: "FAILED", synchronizationStatus: "FAILED", lastError: json(results.map((result) => result.body.messages ?? [])) } });
    throw new Error("eMAG rejected one or more product/offer batches");
  }
  const now = new Date();
  await prisma.channelListing.updateMany({ where: { id: { in: listingIds } }, data: { status: uncertain ? "QUEUED" : "PUBLISHED", synchronizationStatus: uncertain ? "RECONCILIATION_REQUIRED" : "SYNCED", lastSuccessfulPayloadHash: hashJson(payloads), lastSyncedAt: now, lastError: uncertain ? json({ code: "EMAG_UNCERTAIN_ACCEPTANCE", message: "Offer may have been accepted despite documentation errors; reconciliation queued" }) : Prisma.DbNull } });
  if (uncertain) await enqueueInternal(background.companyId, "emag.reconcile", "reconciliation", { accountId, listingIds }, `uncertain:${background.id}`);
  await queueJob.updateProgress(100);
  return { processed: listings.length, uncertain, requestIds: results.map((result) => result.requestId) };
}

async function updateOffers(accountId: string, listingIds: string[], operation: "price" | "status", background: { id: string; companyId: string; correlationId: string | null }, queueJob: Job) {
  const { client } = await emagClient(accountId, background.companyId);
  const listings = await scopedListings(accountId, background.companyId, listingIds);
  const items = listings.map((listing) => {
    if (!listing.emagData) throw new Error(`Listing ${listing.id} is missing eMAG data`);
    return operation === "price"
      ? { id: listing.emagData.sellerProductId, sale_price: listing.emagData.salePrice?.toString(), recommended_price: listing.emagData.recommendedPrice?.toString(), min_sale_price: listing.emagData.minimumSalePrice?.toString(), max_sale_price: listing.emagData.maximumSalePrice?.toString(), vat_id: listing.emagData.vatId ?? undefined }
      : { id: listing.emagData.sellerProductId, status: listing.emagData.offerStatus as 0 | 1 | 2 };
  });
  const results = await client.saveOffers(items);
  for (const result of results) await persistLog(accountId, background, "offer.save", "/offer/save", "POST", result, { operation, listingIds });
  if (results.some((result) => !result.ok)) throw new Error(`eMAG ${operation} update failed`);
  await prisma.channelListing.updateMany({ where: { id: { in: listingIds } }, data: { synchronizationStatus: "SYNCED", lastSyncedAt: new Date(), lastError: Prisma.DbNull } });
  await queueJob.updateProgress(100);
  return { processed: listings.length, operation };
}

async function updateStock(accountId: string, listingIds: string[], background: { id: string; companyId: string; correlationId: string | null }, queueJob: Job) {
  const { client } = await emagClient(accountId, background.companyId);
  const listings = await scopedListings(accountId, background.companyId, listingIds);
  let completed = 0;
  for (const listing of listings) {
    if (!listing.emagData) throw new Error(`Listing ${listing.id} is missing eMAG data`);
    const intended = Math.max(0, (listing.lastIntendedStock ?? 0) - listing.emagData.stockBuffer);
    const result = await client.updateOfferStock(listing.emagData.sellerProductId, [{ warehouse_id: 1, value: Math.min(65_535, intended) }]);
    await persistLog(accountId, background, "offer_stock.update", `/offer_stock/${listing.emagData.sellerProductId}`, "PATCH", result, { stock: [{ warehouse_id: 1, value: intended }] }, listing.id);
    if (!result.ok) throw new Error(`eMAG stock update failed for listing ${listing.id}`);
    await prisma.channelListing.update({ where: { id: listing.id }, data: { synchronizationStatus: "SYNCED", lastSuccessfullyPublishedStock: intended, lastStockSyncAt: new Date(), stockRetryCount: 0, lastError: Prisma.DbNull } });
    completed += 1; await queueJob.updateProgress(Math.floor((completed / listings.length) * 100));
  }
  return { processed: completed };
}

async function reconcileListings(accountId: string, listingIds: string[], background: { id: string; companyId: string; correlationId: string | null }, queueJob: Job) {
  const { client } = await emagClient(accountId, background.companyId);
  const listings = await scopedListings(accountId, background.companyId, listingIds);
  const reconciled: string[] = [];
  for (const listing of listings) {
    if (!listing.emagData) continue;
    const result = await client.readProductOffers({ id: listing.emagData.sellerProductId, currentPage: 1, itemsPerPage: 1 });
    await persistLog(accountId, background, "product_offer.read", "/product_offer/read", "POST", result, { id: listing.emagData.sellerProductId }, listing.id);
    if (!result.ok) throw new Error(`Unable to reconcile eMAG listing ${listing.id}`);
    const remote = resultRows(result)[0] ?? {};
    const documentationErrors = remote.documentation_errors ?? remote.errors ?? [];
    const rejected = [5, 6, 8, 10, 12].includes(numeric(remote.validation_status));
    await prisma.$transaction([
      prisma.channelListing.update({ where: { id: listing.id }, data: { status: rejected ? "FAILED" : "PUBLISHED", synchronizationStatus: rejected ? "FAILED" : "SYNCED", externalProductId: text(remote.product_id) || listing.externalProductId, externalOfferId: text(remote.offer_id) || listing.externalOfferId, remoteUrl: text(remote.url) || listing.remoteUrl, lastRemoteStock: nullableNumeric(remote.general_stock), remoteMetadata: json(remote), lastError: rejected ? json(documentationErrors) : Prisma.DbNull, lastSyncedAt: new Date() } }),
      prisma.emagListingData.update({ where: { channelListingId: listing.id }, data: { documentationErrors: json(documentationErrors), offerValidationStatus: json(remote.offer_validation_status ?? {}), documentationStatus: json(remote.validation_status ?? {}), translationStatus: json(remote.translation_validation_status ?? {}) } }),
    ]);
    if (rejected) await prisma.notification.create({ data: { companyId: background.companyId, severity: "ERROR", type: "EMAG_DOCUMENTATION_REJECTED", title: "eMAG documentation rejected", message: `Listing ${listing.id} needs correction`, entityType: "ChannelListing", entityId: listing.id, metadata: json({ documentationErrors }) } });
    reconciled.push(listing.id); await queueJob.updateProgress(Math.floor((reconciled.length / listings.length) * 100));
  }
  return { reconciled };
}

async function scopedListings(accountId: string, companyId: string, listingIds: string[]) {
  const listings = await prisma.channelListing.findMany({ where: { id: { in: listingIds }, companyId, channelAccountId: accountId }, include: { emagData: true } });
  if (listings.length !== listingIds.length) throw new Error("One or more eMAG listings are missing or outside the company scope");
  return listings;
}

async function persistLog(accountId: string, background: { id: string; companyId: string; correlationId: string | null }, operation: string, endpoint: string, method: string, result: EmagApiResult, requestPayload: unknown, entityId?: string) {
  await prisma.integrationRequestLog.create({
    data: {
      companyId: background.companyId, channelAccountId: accountId, operation, endpoint, httpMethod: method, requestId: result.requestId,
      correlationId: background.correlationId, entityType: entityId ? "ChannelListing" : "BackgroundJob", entityId: entityId ?? background.id,
      sanitizedRequestPayload: json(requestPayload), sanitizedResponsePayload: json(result.body), responseStatus: result.status,
      externalErrors: json(result.body.messages ?? []), durationMs: result.durationMs, expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
}

async function enqueueInternal(companyId: string, type: string, queueName: keyof typeof queueMap, input: unknown, deduplicationKey?: string) {
  const existing = deduplicationKey ? await prisma.backgroundJob.findFirst({ where: { companyId, type, deduplicationKey, status: { in: ["QUEUED", "RUNNING"] } } }) : null;
  if (existing) return existing;
  const record = await prisma.backgroundJob.create({ data: { companyId, type, queueName, input: json(input), deduplicationKey } });
  const queueJobId = randomUUID();
  const queue = queueMap[queueName];
  if (!queue) throw new Error(`Unsupported internal queue: ${queueName}`);
  await queue.add(type, { backgroundJobId: record.id }, { jobId: queueJobId, attempts: record.maxAttempts, backoff: { type: "exponential", delay: 1_000 }, removeOnFail: false });
  return prisma.backgroundJob.update({ where: { id: record.id }, data: { queueJobId } });
}

const queueMap = Object.fromEntries([...queues.entries()]) as Record<string, Queue>;

async function dispatchTransactionalOutbox() {
  if (outboxRunning) return;
  outboxRunning = true;
  try {
    const pending = await prisma.backgroundJob.findMany({ where: { status: "QUEUED", queueJobId: null }, take: 100, orderBy: { createdAt: "asc" } });
    for (const record of pending) {
      const queue = queueMap[record.queueName];
      if (!queue) continue;
      const queueJobId = randomUUID();
      const claimed = await prisma.backgroundJob.updateMany({ where: { id: record.id, queueJobId: null, status: "QUEUED" }, data: { queueJobId } });
      if (claimed.count !== 1) continue;
      try {
        await queue.add(record.type, { backgroundJobId: record.id }, { jobId: queueJobId, attempts: record.maxAttempts, backoff: { type: "exponential", delay: 1_000 }, removeOnFail: false });
      } catch (error) {
        await prisma.backgroundJob.updateMany({ where: { id: record.id, queueJobId }, data: { queueJobId: null, error: serializeError(error) } });
      }
    }
  } finally {
    outboxRunning = false;
  }
}
function decryptCredentials(payload: Uint8Array): EmagCredentials {
  const keyRaw = process.env.ENCRYPTION_KEY;
  if (!keyRaw) throw new Error("ENCRYPTION_KEY is required for live eMAG credentials");
  const key = /^[a-f\d]{64}$/i.test(keyRaw) ? Buffer.from(keyRaw, "hex") : Buffer.from(keyRaw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  const bytes = Buffer.from(payload);
  if (bytes.length < 30 || bytes[0] !== 1) throw new Error("Unsupported encrypted credential payload");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(1, 13)); decipher.setAuthTag(bytes.subarray(13, 29));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString("utf8")) as EmagCredentials;
}

function resultRows(result: EmagApiResult): Array<Record<string, unknown>> { return recordArray(result.body.results); }
function recordArray(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []; }
function asRecord(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function requiredString(value: unknown, name: string) { if (typeof value !== "string" || !value) throw new Error(`${name} is required`); return value; }
function stringArray(value: unknown) { if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("Expected an array of strings"); return value as string[]; }
function text(value: unknown) { return value === undefined || value === null ? "" : String(value); }
function numeric(value: unknown) { const result = Number(value); return Number.isFinite(result) ? Math.trunc(result) : 0; }
function nullableNumeric(value: unknown) { const result = Number(value); return Number.isFinite(result) ? Math.trunc(result) : null; }
function nullableDecimal(value: unknown) { const result = String(value ?? ""); return /^-?\d+(\.\d+)?$/.test(result) ? new Prisma.Decimal(result) : null; }
function bool(value: unknown) { return value === true || value === 1 || value === "1" || value === "true"; }
function characteristicGroup(value: Record<string, unknown>) { const raw = text(value.group ?? value.presentation_group).toUpperCase(); return ["BASIC", "STANDARD", "ADVANCED", "OTHER"].includes(raw) ? raw : "OTHER"; }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue; }
function hashJson(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function serializeError(error: unknown): Prisma.InputJsonValue { return { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error), ...(error instanceof Error && error.stack ? { stack: error.stack.slice(0, 4_000) } : {}) }; }
function assertResult(result: EmagApiResult, message: string) { if (!result.ok) throw new Error(`${message} (${result.status})`); }

const workers = queueSettings.map(({ name, concurrency }) => new Worker<JobPayload>(name, processDurableJob, { connection, concurrency, lockDuration: 60_000 }));
const outboxTimer = setInterval(() => void dispatchTransactionalOutbox(), 2_000);
void dispatchTransactionalOutbox();
const retentionTimer = setInterval(() => void prisma.integrationRequestLog.deleteMany({ where: { expiresAt: { lt: new Date() } } }), 3_600_000);
void prisma.integrationRequestLog.deleteMany({ where: { expiresAt: { lt: new Date() } } });
for (const worker of workers) {
  worker.on("completed", (job) => console.info(JSON.stringify({ level: "info", event: "job.completed", queue: worker.name, type: job.name, queueJobId: job.id })));
  worker.on("failed", (job, error) => console.error(JSON.stringify({ level: "error", event: "job.failed", queue: worker.name, type: job?.name, queueJobId: job?.id, error: error.message })));
}

async function shutdown(signal: string) {
  console.info(JSON.stringify({ level: "info", event: "worker.shutdown", signal }));
  clearInterval(outboxTimer);
  clearInterval(retentionTimer);
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  if (apiContext) await apiContext.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
console.info(JSON.stringify({ level: "info", event: "worker.ready", queues: queueSettings.map((queue) => queue.name) }));
