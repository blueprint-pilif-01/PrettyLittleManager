import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  createEmagAccountSchema, emagEanLookupSchema, enqueueEmagOperationSchema, updateEmagAccountSchema, upsertCategoryMappingSchema, upsertEmagListingSchema,
  type CreateEmagAccountInput, type EmagEanLookupInput, type EnqueueEmagOperationInput, type UpdateEmagAccountInput, type UpsertCategoryMappingInput, type UpsertEmagListingInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EmagService } from "./emag.service";

@ApiTags("eMAG integration")
@ApiBearerAuth()
@Controller("integrations/emag")
export class EmagController {
  constructor(private readonly emag: EmagService) {}
  @Get("accounts") @RequirePermissions("integration.read") listAccounts(@CurrentAuth() auth: RequestAuth) { return this.emag.listAccounts(auth); }
  @Post("accounts") @RequirePermissions("integration.configure") createAccount(@CurrentAuth() auth: RequestAuth, @Body(new ZodValidationPipe(createEmagAccountSchema)) input: CreateEmagAccountInput) { return this.emag.createAccount(auth, input); }
  @Patch("accounts/:id") @RequirePermissions("integration.configure") updateAccount(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateEmagAccountSchema)) input: UpdateEmagAccountInput) { return this.emag.updateAccount(auth, id, input); }
  @Get("accounts/:id/readiness") @RequirePermissions("integration.read") readiness(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.emag.readinessForAccount(auth, id); }
  @Post("accounts/:id/sync-metadata") @RequirePermissions("integration.sync") syncMetadata(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Req() request: Request) { return this.emag.enqueueMetadataSync(auth, id, request.correlationId); }
  @Post("accounts/:id/ean-lookup") @RequirePermissions("integration.sync") eanLookup(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(emagEanLookupSchema)) input: EmagEanLookupInput, @Req() request: Request) { return this.emag.enqueueEanLookup(auth, id, input, request.correlationId); }
  @Post("accounts/:id/operations") @RequirePermissions("integration.sync") operation(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(enqueueEmagOperationSchema)) input: EnqueueEmagOperationInput, @Req() request: Request) { return this.emag.enqueueOperation(auth, id, input, request.correlationId); }
  @Get("accounts/:id/categories") @RequirePermissions("integration.read") categories(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Query("search") search?: string) { return this.emag.listCategories(auth, id, search); }
  @Get("accounts/:id/categories/:externalId") @RequirePermissions("integration.read") category(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Param("externalId", ParseIntPipe) externalId: number) { return this.emag.category(auth, id, externalId); }
  @Get("accounts/:id/vat-rates") @RequirePermissions("integration.read") vatRates(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.emag.listVatRates(auth, id); }
  @Get("accounts/:id/handling-times") @RequirePermissions("integration.read") handlingTimes(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.emag.listHandlingTimes(auth, id); }
  @Get("accounts/:id/family-types") @RequirePermissions("integration.read") familyTypes(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.emag.listFamilyTypes(auth, id); }
  @Post("accounts/:id/category-mappings") @RequirePermissions("integration.configure") mapCategory(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(upsertCategoryMappingSchema)) input: UpsertCategoryMappingInput) { return this.emag.upsertCategoryMapping(auth, id, input); }
  @Get("accounts/:id/listings") @RequirePermissions("integration.read") listings(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.emag.listListings(auth, id); }
  @Post("accounts/:id/listings") @RequirePermissions("product.publish") saveListing(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(upsertEmagListingSchema)) input: UpsertEmagListingInput) { return this.emag.upsertListing(auth, id, input); }
  @Get("accounts/:id/listings/:listingId") @RequirePermissions("integration.read") listing(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Param("listingId", ParseUUIDPipe) listingId: string) { return this.emag.getListing(auth, id, listingId); }
  @Get("accounts/:id/logs") @RequirePermissions("integration.read") logs(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.emag.listLogs(auth, id); }
}
