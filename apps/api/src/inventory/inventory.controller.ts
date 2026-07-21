import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createInventoryReservationSchema,
  createWarehouseLocationSchema,
  createWarehouseSchema,
  inventoryAdjustmentSchema,
  inventoryReservationActionSchema,
  inventoryStockCountSchema,
  inventoryTransferSchema,
  receiveInventorySchema,
  setSafetyStockSchema,
  updateWarehouseSchema,
  type CreateInventoryReservationInput,
  type CreateWarehouseInput,
  type CreateWarehouseLocationInput,
  type InventoryAdjustmentInput,
  type InventoryReservationActionInput,
  type InventoryStockCountInput,
  type InventoryTransferInput,
  type ReceiveInventoryInput,
  type SetSafetyStockInput,
  type UpdateWarehouseInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InventoryMovementQueryDto } from "./dto/inventory-movement-query.dto";
import { InventoryService } from "./inventory.service";

@ApiTags("Inventory")
@ApiBearerAuth()
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("warehouses")
  @RequirePermissions("inventory.read")
  warehouses(@CurrentAuth() auth: RequestAuth) {
    return this.inventory.listWarehouses(auth);
  }

  @Post("warehouses")
  @RequirePermissions("inventory.adjust")
  createWarehouse(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createWarehouseSchema)) input: CreateWarehouseInput,
  ) {
    return this.inventory.createWarehouse(auth, input);
  }

  @Patch("warehouses/:id")
  @RequirePermissions("inventory.adjust")
  updateWarehouse(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) input: UpdateWarehouseInput,
  ) {
    return this.inventory.updateWarehouse(auth, id, input);
  }

  @Post("warehouses/:id/locations")
  @RequirePermissions("inventory.adjust")
  createLocation(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createWarehouseLocationSchema))
    input: CreateWarehouseLocationInput,
  ) {
    return this.inventory.createLocation(auth, id, input);
  }

  @Get("inventory/balances")
  @RequirePermissions("inventory.read")
  balances(
    @CurrentAuth() auth: RequestAuth,
    @Query("variantId") variantId?: string,
  ) {
    return this.inventory.balances(auth, variantId);
  }

  @Get("inventory/variants/:variantId/availability")
  @RequirePermissions("inventory.read")
  availability(
    @CurrentAuth() auth: RequestAuth,
    @Param("variantId", ParseUUIDPipe) variantId: string,
    @Query("channelBuffer") rawChannelBuffer?: string,
  ) {
    const parsed = Number(rawChannelBuffer ?? 0);
    const channelBuffer = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    return this.inventory.variantAvailability(auth, variantId, channelBuffer);
  }

  @Get("inventory/movements")
  @RequirePermissions("inventory.read")
  movements(
    @CurrentAuth() auth: RequestAuth,
    @Query() query: InventoryMovementQueryDto,
  ) {
    return this.inventory.movements(auth, query);
  }

  @Get("inventory/reservations")
  @RequirePermissions("inventory.read")
  reservations(@CurrentAuth() auth: RequestAuth) {
    return this.inventory.listReservations(auth);
  }

  @Post("inventory/receipts")
  @RequirePermissions("inventory.adjust")
  receive(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(receiveInventorySchema)) input: ReceiveInventoryInput,
  ) {
    return this.inventory.receive(auth, input);
  }

  @Post("inventory/adjustments")
  @RequirePermissions("inventory.adjust")
  adjust(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(inventoryAdjustmentSchema)) input: InventoryAdjustmentInput,
  ) {
    return this.inventory.adjust(auth, input);
  }

  @Put("inventory/safety-stock")
  @RequirePermissions("inventory.adjust")
  setSafetyStock(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(setSafetyStockSchema)) input: SetSafetyStockInput,
  ) {
    return this.inventory.setSafetyStock(auth, input);
  }

  @Post("inventory/reservations")
  @RequirePermissions("inventory.reserve")
  reserve(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(createInventoryReservationSchema))
    input: CreateInventoryReservationInput,
  ) {
    return this.inventory.createReservation(auth, input);
  }

  @Post("inventory/reservations/:id/release")
  @RequirePermissions("inventory.reserve")
  release(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inventoryReservationActionSchema))
    input: InventoryReservationActionInput,
  ) {
    return this.inventory.releaseReservation(auth, id, input);
  }

  @Post("inventory/reservations/:id/complete")
  @RequirePermissions("inventory.reserve")
  complete(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inventoryReservationActionSchema))
    input: InventoryReservationActionInput,
  ) {
    return this.inventory.completeReservation(auth, id, input);
  }

  @Post("inventory/transfers")
  @RequirePermissions("inventory.transfer")
  transfer(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(inventoryTransferSchema)) input: InventoryTransferInput,
  ) {
    return this.inventory.transfer(auth, input);
  }

  @Post("inventory/stock-counts")
  @RequirePermissions("inventory.adjust")
  stockCount(
    @CurrentAuth() auth: RequestAuth,
    @Body(new ZodValidationPipe(inventoryStockCountSchema)) input: InventoryStockCountInput,
  ) {
    return this.inventory.stockCount(auth, input);
  }
}
