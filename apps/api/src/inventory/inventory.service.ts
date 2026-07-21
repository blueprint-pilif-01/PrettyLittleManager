import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryMovementType,
  Prisma,
  type StockLevel,
} from "@prisma/client";
import type {
  CreateInventoryReservationInput,
  CreateWarehouseInput,
  CreateWarehouseLocationInput,
  InventoryAdjustmentInput,
  InventoryReservationActionInput,
  InventoryStockCountInput,
  InventoryTransferInput,
  ReceiveInventoryInput,
  SetSafetyStockInput,
  UpdateWarehouseInput,
} from "@plm/contracts";
import { randomUUID } from "node:crypto";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";
import { calculateAvailability, type InventoryBalanceValues } from "./inventory.utils";

type BalanceChange = {
  type: InventoryMovementType;
  reason: string;
  idempotencyKey: string;
  locationId?: string;
  physicalDelta?: number;
  reservedDelta?: number;
  incomingDelta?: number;
  damagedDelta?: number;
  quarantinedDelta?: number;
  safetyStock?: number;
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listWarehouses(auth: RequestAuth) {
    return this.prisma.warehouse.findMany({
      where: { companyId: auth.companyId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        locations: { orderBy: [{ isActive: "desc" }, { code: "asc" }] },
        _count: { select: { stockLevels: true } },
      },
    });
  }

  async createWarehouse(auth: RequestAuth, input: CreateWarehouseInput) {
    try {
      const warehouse = await this.prisma.warehouse.create({
        data: { companyId: auth.companyId, code: input.code.toUpperCase(), name: input.name },
      });
      await this.audit(auth, "warehouse.created", "Warehouse", warehouse.id, {
        code: warehouse.code,
        name: warehouse.name,
      });
      return warehouse;
    } catch (error: unknown) {
      this.handleUnique(error, "WAREHOUSE_CODE_EXISTS", "A warehouse with this code already exists");
      throw error;
    }
  }

  async updateWarehouse(
    auth: RequestAuth,
    id: string,
    input: UpdateWarehouseInput,
  ) {
    const before = await this.warehouse(auth.companyId, id);
    try {
      const updated = await this.prisma.warehouse.update({
        where: { id },
        data: {
          code: input.code?.toUpperCase(),
          name: input.name,
          isActive: input.isActive,
        },
      });
      await this.audit(auth, "warehouse.updated", "Warehouse", id, {
        before: { code: before.code, name: before.name, isActive: before.isActive },
        after: { code: updated.code, name: updated.name, isActive: updated.isActive },
      });
      return updated;
    } catch (error: unknown) {
      this.handleUnique(error, "WAREHOUSE_CODE_EXISTS", "A warehouse with this code already exists");
      throw error;
    }
  }

  async createLocation(
    auth: RequestAuth,
    warehouseId: string,
    input: CreateWarehouseLocationInput,
  ) {
    await this.warehouse(auth.companyId, warehouseId);
    try {
      const location = await this.prisma.warehouseLocation.create({
        data: {
          companyId: auth.companyId,
          warehouseId,
          code: input.code.toUpperCase(),
          name: input.name,
          type: input.type,
        },
      });
      await this.audit(auth, "warehouse.location_created", "WarehouseLocation", location.id, {
        warehouseId,
        code: location.code,
        type: location.type,
      });
      return location;
    } catch (error: unknown) {
      this.handleUnique(error, "WAREHOUSE_LOCATION_EXISTS", "A location with this code already exists in the warehouse");
      throw error;
    }
  }

  async balances(auth: RequestAuth, variantId?: string) {
    const balances = await this.prisma.stockLevel.findMany({
      where: {
        variant: { companyId: auth.companyId, deletedAt: null },
        ...(variantId ? { variantId } : {}),
      },
      take: 500,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        warehouse: true,
        variant: {
          select: {
            id: true,
            sku: true,
            gtin: true,
            variantName: true,
            product: { select: { id: true, publicName: true } },
          },
        },
      },
    });
    return balances.map((balance) => ({
      ...balance,
      availability: calculateAvailability(balance),
    }));
  }

  async variantAvailability(auth: RequestAuth, variantId: string, channelBuffer = 0) {
    await this.variant(auth.companyId, variantId);
    const balances = await this.prisma.stockLevel.findMany({ where: { variantId } });
    const total = balances.reduce<InventoryBalanceValues>(
      (sum, balance) => ({
        onHand: sum.onHand + balance.onHand,
        reserved: sum.reserved + balance.reserved,
        incoming: sum.incoming + balance.incoming,
        damaged: sum.damaged + balance.damaged,
        quarantined: sum.quarantined + balance.quarantined,
        safetyStock: sum.safetyStock + balance.safetyStock,
      }),
      { onHand: 0, reserved: 0, incoming: 0, damaged: 0, quarantined: 0, safetyStock: 0 },
    );
    return {
      variantId,
      warehouses: balances.map((balance) => ({
        balanceId: balance.id,
        warehouseId: balance.warehouseId,
        ...calculateAvailability(balance, channelBuffer),
      })),
      total: calculateAvailability(total, channelBuffer),
    };
  }

  receive(auth: RequestAuth, input: ReceiveInventoryInput) {
    return this.mutate(auth, input, {
      type: "RECEIPT",
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
      physicalDelta: input.quantity,
      metadata: { operation: "receipt" },
    });
  }

  adjust(auth: RequestAuth, input: InventoryAdjustmentInput) {
    const change: BalanceChange = {
      type:
        input.bucket === "PHYSICAL"
          ? input.quantityDelta > 0
            ? "MANUAL_INCREASE"
            : "MANUAL_DECREASE"
          : input.bucket === "DAMAGED"
            ? "DAMAGED"
            : input.bucket === "QUARANTINED"
              ? "QUARANTINED"
              : "CORRECTION",
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
      physicalDelta: input.bucket === "PHYSICAL" ? input.quantityDelta : 0,
      incomingDelta: input.bucket === "INCOMING" ? input.quantityDelta : 0,
      damagedDelta: input.bucket === "DAMAGED" ? input.quantityDelta : 0,
      quarantinedDelta: input.bucket === "QUARANTINED" ? input.quantityDelta : 0,
      metadata: { operation: "manual_adjustment", bucket: input.bucket },
    };
    return this.mutate(auth, input, change);
  }

  async setSafetyStock(auth: RequestAuth, input: SetSafetyStockInput) {
    const existing = await this.idempotentMovement(auth, input.idempotencyKey);
    if (existing) return this.idempotentResult(existing);
    await this.assertEntities(auth.companyId, input.variantId, input.warehouseId);
    const balance = await this.ensureBalance(input.variantId, input.warehouseId);
    return this.serializable(async (transaction) => {
      const locked = await this.lockBalance(transaction, balance.id);
      return this.applyOnBalance(transaction, auth, locked, {
        type: "CORRECTION",
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        safetyStock: input.safetyStock,
        metadata: {
          operation: "safety_stock_set",
          previousSafetyStock: locked.safetyStock,
          nextSafetyStock: input.safetyStock,
        },
      });
    });
  }

  async createReservation(auth: RequestAuth, input: CreateInventoryReservationInput) {
    const existing = await this.prisma.inventoryReservation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { variant: true, warehouse: true },
    });
    if (existing) {
      if (existing.companyId !== auth.companyId) throw this.idempotencyConflict();
      return { idempotent: true, reservation: existing };
    }
    if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
      throw new BadRequestException({
        code: "RESERVATION_EXPIRY_INVALID",
        message: "Reservation expiry must be in the future",
      });
    }
    await this.assertEntities(auth.companyId, input.variantId, input.warehouseId, input.locationId);
    const balance = await this.ensureBalance(input.variantId, input.warehouseId);
    try {
      return await this.serializable(async (transaction) => {
        const locked = await this.lockBalance(transaction, balance.id);
        if (calculateAvailability(locked).availableStock < input.quantity) {
          throw new ConflictException({
            code: "INSUFFICIENT_AVAILABLE_STOCK",
            message: "The reservation exceeds current available stock",
            availableStock: calculateAvailability(locked).availableStock,
            requested: input.quantity,
          });
        }
        const reservation = await transaction.inventoryReservation.create({
          data: {
            companyId: auth.companyId,
            variantId: input.variantId,
            warehouseId: input.warehouseId,
            locationId: input.locationId,
            quantity: input.quantity,
            source: input.source,
            externalReference: input.externalReference,
            idempotencyKey: input.idempotencyKey,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
            createdById: auth.userId,
          },
        });
        const result = await this.applyOnBalance(transaction, auth, locked, {
          type: "SALE_RESERVATION",
          reason: `Reservation created by ${input.source}`,
          idempotencyKey: input.idempotencyKey,
          locationId: input.locationId,
          reservedDelta: input.quantity,
          referenceType: "InventoryReservation",
          referenceId: reservation.id,
          metadata: { externalReference: input.externalReference ?? null },
        });
        return { ...result, reservation };
      });
    } catch (error: unknown) {
      this.handleUnique(error, "RESERVATION_DUPLICATE", "This reservation has already been created");
      throw error;
    }
  }

  releaseReservation(
    auth: RequestAuth,
    reservationId: string,
    input: InventoryReservationActionInput,
  ) {
    return this.transitionReservation(auth, reservationId, input, "RELEASED");
  }

  completeReservation(
    auth: RequestAuth,
    reservationId: string,
    input: InventoryReservationActionInput,
  ) {
    return this.transitionReservation(auth, reservationId, input, "COMPLETED");
  }

  async transfer(auth: RequestAuth, input: InventoryTransferInput) {
    const existing = await this.prisma.inventoryTransfer.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.companyId !== auth.companyId) throw this.idempotencyConflict();
      return { idempotent: true, transfer: existing };
    }
    await Promise.all([
      this.assertEntities(auth.companyId, input.variantId, input.sourceWarehouseId),
      this.assertEntities(auth.companyId, input.variantId, input.destinationWarehouseId),
    ]);
    const [source, destination] = await Promise.all([
      this.ensureBalance(input.variantId, input.sourceWarehouseId),
      this.ensureBalance(input.variantId, input.destinationWarehouseId),
    ]);

    return this.serializable(async (transaction) => {
      const locked = await this.lockBalances(transaction, [source.id, destination.id]);
      const sourceBalance = locked.get(source.id);
      const destinationBalance = locked.get(destination.id);
      if (!sourceBalance || !destinationBalance) throw new Error("Locked transfer balances are missing");
      if (calculateAvailability(sourceBalance).availableStock < input.quantity) {
        throw new ConflictException({
          code: "INSUFFICIENT_AVAILABLE_STOCK",
          message: "The transfer exceeds available stock at the source warehouse",
          availableStock: calculateAvailability(sourceBalance).availableStock,
          requested: input.quantity,
        });
      }
      const transfer = await transaction.inventoryTransfer.create({
        data: {
          companyId: auth.companyId,
          variantId: input.variantId,
          sourceWarehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          quantity: input.quantity,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          createdById: auth.userId,
          completedAt: new Date(),
        },
      });
      const sourceResult = await this.applyOnBalance(transaction, auth, sourceBalance, {
        type: "TRANSFER_OUT",
        reason: input.reason,
        idempotencyKey: randomUUID(),
        physicalDelta: -input.quantity,
        referenceType: "InventoryTransfer",
        referenceId: transfer.id,
        metadata: { transferIdempotencyKey: input.idempotencyKey },
      });
      const destinationResult = await this.applyOnBalance(transaction, auth, destinationBalance, {
        type: "TRANSFER_IN",
        reason: input.reason,
        idempotencyKey: randomUUID(),
        physicalDelta: input.quantity,
        referenceType: "InventoryTransfer",
        referenceId: transfer.id,
        metadata: { transferIdempotencyKey: input.idempotencyKey },
      });
      return { transfer, source: sourceResult.balance, destination: destinationResult.balance };
    });
  }

  async stockCount(auth: RequestAuth, input: InventoryStockCountInput) {
    const existing = await this.prisma.inventoryStockCount.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.companyId !== auth.companyId) throw this.idempotencyConflict();
      return { idempotent: true, stockCount: existing };
    }
    await this.assertEntities(auth.companyId, input.variantId, input.warehouseId);
    const balance = await this.ensureBalance(input.variantId, input.warehouseId);
    return this.serializable(async (transaction) => {
      const locked = await this.lockBalance(transaction, balance.id);
      const difference = input.countedPhysical - locked.onHand;
      const stockCount = await transaction.inventoryStockCount.create({
        data: {
          companyId: auth.companyId,
          variantId: input.variantId,
          warehouseId: input.warehouseId,
          expectedPhysical: locked.onHand,
          countedPhysical: input.countedPhysical,
          difference,
          status: "APPLIED",
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          createdById: auth.userId,
          appliedAt: new Date(),
        },
      });
      const result = await this.applyOnBalance(transaction, auth, locked, {
        type: "STOCK_COUNT",
        reason: input.reason ?? "Physical stock count",
        idempotencyKey: input.idempotencyKey,
        physicalDelta: difference,
        referenceType: "InventoryStockCount",
        referenceId: stockCount.id,
        metadata: { expectedPhysical: locked.onHand, countedPhysical: input.countedPhysical },
      });
      return { ...result, stockCount };
    });
  }

  async movements(
    auth: RequestAuth,
    query: { variantId?: string; warehouseId?: string; cursor?: string; limit?: number },
  ) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        companyId: auth.companyId,
        variantId: query.variantId,
        warehouseId: query.warehouseId,
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        variant: { select: { id: true, sku: true, variantName: true } },
        actor: { select: { id: true, displayName: true } },
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      page: { limit, hasMore, nextCursor: hasMore ? items.at(-1)?.id : undefined },
    };
  }

  listReservations(auth: RequestAuth) {
    return this.prisma.inventoryReservation.findMany({
      where: { companyId: auth.companyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      include: {
        variant: { select: { id: true, sku: true, variantName: true, product: { select: { publicName: true } } } },
        warehouse: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
  }

  private async mutate(
    auth: RequestAuth,
    input: Pick<ReceiveInventoryInput, "variantId" | "warehouseId" | "locationId" | "idempotencyKey">,
    change: BalanceChange,
  ) {
    const existing = await this.idempotentMovement(auth, input.idempotencyKey);
    if (existing) return this.idempotentResult(existing);
    await this.assertEntities(auth.companyId, input.variantId, input.warehouseId, input.locationId);
    const balance = await this.ensureBalance(input.variantId, input.warehouseId);
    return this.serializable(async (transaction) => {
      const locked = await this.lockBalance(transaction, balance.id);
      return this.applyOnBalance(transaction, auth, locked, change);
    });
  }

  private async transitionReservation(
    auth: RequestAuth,
    reservationId: string,
    input: InventoryReservationActionInput,
    nextStatus: "RELEASED" | "COMPLETED",
  ) {
    const previousMovement = await this.idempotentMovement(auth, input.idempotencyKey);
    if (previousMovement) {
      const reservation = await this.prisma.inventoryReservation.findFirst({
        where: { id: reservationId, companyId: auth.companyId },
      });
      return { idempotent: true, reservation, movement: previousMovement };
    }
    const reservation = await this.prisma.inventoryReservation.findFirst({
      where: { id: reservationId, companyId: auth.companyId },
    });
    if (!reservation) throw this.reservationNotFound();
    const balance = await this.ensureBalance(reservation.variantId, reservation.warehouseId);

    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "InventoryReservation"
        WHERE "id" = ${reservationId}::uuid
        FOR UPDATE
      `;
      const lockedReservation = await transaction.inventoryReservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      if (lockedReservation.status !== "ACTIVE") {
        throw new ConflictException({
          code: "RESERVATION_NOT_ACTIVE",
          message: `Reservation is already ${lockedReservation.status.toLowerCase()}`,
        });
      }
      const lockedBalance = await this.lockBalance(transaction, balance.id);
      const updatedReservation = await transaction.inventoryReservation.update({
        where: { id: reservationId },
        data:
          nextStatus === "RELEASED"
            ? { status: nextStatus, releasedAt: new Date() }
            : { status: nextStatus, completedAt: new Date() },
      });
      const result = await this.applyOnBalance(transaction, auth, lockedBalance, {
        type: nextStatus === "RELEASED" ? "RESERVATION_RELEASE" : "SALE_COMPLETION",
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        locationId: lockedReservation.locationId ?? undefined,
        reservedDelta: -lockedReservation.quantity,
        physicalDelta: nextStatus === "COMPLETED" ? -lockedReservation.quantity : 0,
        referenceType: "InventoryReservation",
        referenceId: reservationId,
      });
      return { ...result, reservation: updatedReservation };
    });
  }

  private async applyOnBalance(
    transaction: Prisma.TransactionClient,
    auth: RequestAuth,
    current: StockLevel,
    change: BalanceChange,
  ) {
    const next = {
      onHand: current.onHand + (change.physicalDelta ?? 0),
      reserved: current.reserved + (change.reservedDelta ?? 0),
      incoming: current.incoming + (change.incomingDelta ?? 0),
      damaged: current.damaged + (change.damagedDelta ?? 0),
      quarantined: current.quarantined + (change.quarantinedDelta ?? 0),
      safetyStock: change.safetyStock ?? current.safetyStock,
    };
    this.assertValidBalance(next);
    const balance = await transaction.stockLevel.update({
      where: { id: current.id },
      data: { ...next, version: { increment: 1 } },
    });
    const primaryDelta = [
      change.physicalDelta,
      change.reservedDelta,
      change.incomingDelta,
      change.damagedDelta,
      change.quarantinedDelta,
    ].find((value) => value !== undefined && value !== 0) ?? 0;
    const movement = await transaction.inventoryMovement.create({
      data: {
        companyId: auth.companyId,
        variantId: current.variantId,
        warehouseId: current.warehouseId,
        locationId: change.locationId,
        type: change.type,
        quantityDelta: primaryDelta,
        physicalDelta: change.physicalDelta ?? 0,
        reservedDelta: change.reservedDelta ?? 0,
        incomingDelta: change.incomingDelta ?? 0,
        damagedDelta: change.damagedDelta ?? 0,
        quarantinedDelta: change.quarantinedDelta ?? 0,
        reason: change.reason,
        idempotencyKey: change.idempotencyKey,
        referenceType: change.referenceType,
        referenceId: change.referenceId,
        actorId: auth.userId,
        balanceAfter: next,
        metadata: change.metadata ?? {},
      },
    });
    await this.queueStockSynchronization(transaction, auth.companyId, current.variantId);
    return { balance, availability: calculateAvailability(balance), movement, idempotent: false };
  }

  private assertValidBalance(balance: InventoryBalanceValues) {
    if (Object.values(balance).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new ConflictException({
        code: "INVENTORY_BALANCE_NEGATIVE",
        message: "Inventory buckets may not become negative",
      });
    }
    if (calculateAvailability(balance).availableStock < 0) {
      throw new ConflictException({
        code: "INSUFFICIENT_AVAILABLE_STOCK",
        message: "The operation would consume reserved, safety, damaged, or quarantined stock",
        availability: calculateAvailability(balance),
      });
    }
  }

  private async queueStockSynchronization(
    transaction: Prisma.TransactionClient,
    companyId: string,
    variantId: string,
  ) {
    const balances = await transaction.stockLevel.findMany({ where: { variantId } });
    const intended = balances.reduce(
      (total, balance) => total + calculateAvailability(balance).availableStock,
      0,
    );
    await transaction.channelListing.updateMany({
      where: { companyId, variantId, channelAccount: { isActive: true } },
      data: { lastIntendedStock: intended, synchronizationStatus: "QUEUED" },
    });
    const emagListings = await transaction.channelListing.findMany({
      where: { companyId, variantId, channelAccount: { type: "EMAG", isActive: true } },
      select: { id: true, channelAccountId: true },
    });
    const accountIds = [...new Set(emagListings.map((listing) => listing.channelAccountId))];
    for (const accountId of accountIds) {
      const listingIds = emagListings.filter((listing) => listing.channelAccountId === accountId).map((listing) => listing.id);
      const deduplicationKey = `stock:${accountId}:${variantId}`;
      const queued = await transaction.backgroundJob.findFirst({
        where: { companyId, type: "emag.stock", deduplicationKey, status: "QUEUED" },
        select: { id: true },
      });
      if (!queued) {
        await transaction.backgroundJob.create({
          data: {
            companyId,
            type: "emag.stock",
            queueName: "stock-sync",
            deduplicationKey,
            input: { accountId, listingIds, variantId },
          },
        });
      }
    }
  }

  private async assertEntities(
    companyId: string,
    variantId: string,
    warehouseId: string,
    locationId?: string,
  ) {
    const [variant, warehouse, location] = await Promise.all([
      this.variant(companyId, variantId),
      this.warehouse(companyId, warehouseId),
      locationId
        ? this.prisma.warehouseLocation.findFirst({
            where: { id: locationId, companyId, warehouseId, isActive: true },
          })
        : Promise.resolve(undefined),
    ]);
    if (locationId && !location) {
      throw new NotFoundException({
        code: "WAREHOUSE_LOCATION_NOT_FOUND",
        message: "Warehouse location not found in the selected warehouse",
      });
    }
    return { variant, warehouse, location };
  }

  private async ensureBalance(variantId: string, warehouseId: string) {
    return this.prisma.stockLevel.upsert({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      update: {},
      create: { variantId, warehouseId },
    });
  }

  private async lockBalance(transaction: Prisma.TransactionClient, balanceId: string) {
    const rows = await transaction.$queryRaw<StockLevel[]>`
      SELECT * FROM "StockLevel"
      WHERE "id" = ${balanceId}::uuid
      FOR UPDATE
    `;
    const balance = rows[0];
    if (!balance) throw new Error("Inventory balance disappeared while acquiring a lock");
    return balance;
  }

  private async lockBalances(transaction: Prisma.TransactionClient, balanceIds: string[]) {
    const rows = await transaction.$queryRaw<StockLevel[]>`
      SELECT * FROM "StockLevel"
      WHERE "id" IN (${Prisma.join(balanceIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "id"
      FOR UPDATE
    `;
    return new Map(rows.map((balance) => [balance.id, balance]));
  }

  private async idempotentMovement(auth: RequestAuth, idempotencyKey: string) {
    const movement = await this.prisma.inventoryMovement.findUnique({ where: { idempotencyKey } });
    if (movement && movement.companyId !== auth.companyId) throw this.idempotencyConflict();
    return movement;
  }

  private async idempotentResult(movement: { variantId: string; warehouseId: string }) {
    const balance = await this.prisma.stockLevel.findUniqueOrThrow({
      where: { variantId_warehouseId: { variantId: movement.variantId, warehouseId: movement.warehouseId } },
    });
    return { idempotent: true, movement, balance, availability: calculateAvailability(balance) };
  }

  private async serializable<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        });
      } catch (error: unknown) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" ||
            (error.code === "P2010" && error.meta?.code === "40001"));
        if (!retryable || attempt === 3) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 20));
      }
    }
    throw new Error("Serializable inventory transaction retry exhausted");
  }

  private variant(companyId: string, id: string) {
    return this.prisma.productVariant.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, sku: true },
    }).then((variant) => {
      if (!variant) throw new NotFoundException({ code: "VARIANT_NOT_FOUND", message: "Product variant not found" });
      return variant;
    });
  }

  private warehouse(companyId: string, id: string) {
    return this.prisma.warehouse.findFirst({ where: { id, companyId } }).then((warehouse) => {
      if (!warehouse) throw new NotFoundException({ code: "WAREHOUSE_NOT_FOUND", message: "Warehouse not found" });
      return warehouse;
    });
  }

  private audit(
    auth: RequestAuth,
    action: string,
    entityType: string,
    entityId: string,
    after: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: { companyId: auth.companyId, actorId: auth.userId, action, entityType, entityId, after },
    });
  }

  private handleUnique(error: unknown, code: string, message: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException({ code, message });
    }
  }

  private reservationNotFound() {
    return new NotFoundException({ code: "RESERVATION_NOT_FOUND", message: "Inventory reservation not found" });
  }

  private idempotencyConflict() {
    return new ConflictException({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      message: "This idempotency key is already used by another operation",
    });
  }
}
