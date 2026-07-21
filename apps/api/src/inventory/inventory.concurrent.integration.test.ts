import { ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RequestAuth } from "../common/request-context";
import type { PrismaService } from "../database/prisma.service";
import { InventoryService } from "./inventory.service";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

describe.skipIf(!integrationDatabaseUrl)("InventoryService concurrent PostgreSQL integration", () => {
  const prisma = new PrismaClient({ datasourceUrl: integrationDatabaseUrl });
  const inventory = new InventoryService(prisma as unknown as PrismaService);
  let companyId: string;
  let userId: string;
  let variantId: string;
  let warehouseId: string;
  let auth: RequestAuth;

  beforeAll(async () => {
    const suffix = randomUUID();
    const company = await prisma.company.create({ data: { name: "Inventory Integration", slug: `inventory-${suffix}` } });
    const user = await prisma.user.create({
      data: { email: `inventory-${suffix}@example.test`, displayName: "Inventory Test", status: "ACTIVE" },
    });
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        productType: "SIMPLE",
        internalName: "Concurrency product",
        publicName: "Concurrency product",
        slug: `concurrency-${suffix}`,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        companyId: company.id,
        productId: product.id,
        sku: `CONCURRENT-${suffix}`,
        internalNumericId: Math.floor(Math.random() * 1_000_000_000) + 1,
        variantName: "Default",
        variationKey: "default",
        createdById: user.id,
        updatedById: user.id,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: { companyId: company.id, code: "MAIN", name: "Main warehouse" },
    });
    companyId = company.id;
    userId = user.id;
    variantId = variant.id;
    warehouseId = warehouse.id;
    auth = {
      userId,
      companyId,
      sessionId: randomUUID(),
      membershipId: randomUUID(),
      companySlug: company.slug,
      roleKey: "admin",
      permissions: ["inventory.read", "inventory.adjust", "inventory.reserve"],
    };
    await inventory.receive(auth, {
      variantId,
      warehouseId,
      quantity: 100,
      reason: "Concurrent integration setup",
      idempotencyKey: randomUUID(),
    });
    await inventory.setSafetyStock(auth, {
      variantId,
      warehouseId,
      safetyStock: 10,
      reason: "Concurrent integration safety stock",
      idempotencyKey: randomUUID(),
    });
  }, 30_000);

  afterAll(async () => {
    if (companyId) await prisma.company.delete({ where: { id: companyId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("allows only one reservation when two concurrent requests exceed availability together", async () => {
    const attempts = await Promise.allSettled([
      inventory.createReservation(auth, {
        variantId,
        warehouseId,
        quantity: 60,
        source: "integration-test",
        externalReference: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
      inventory.createReservation(auth, {
        variantId,
        warehouseId,
        quantity: 60,
        source: "integration-test",
        externalReference: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const availability = await inventory.variantAvailability(auth, variantId);
    expect(availability.total.reservedStock).toBe(60);
    expect(availability.total.availableStock).toBe(30);
  }, 30_000);
});
