import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  createWebsiteApiCredentialSchema,
  createWebsiteChannelSchema,
  updateWebsiteChannelSchema,
  upsertCategoryMappingSchema,
  upsertWebsiteListingSchema,
  websiteCatalogQuerySchema,
  type CreateWebsiteApiCredentialInput,
  type CreateWebsiteChannelInput,
  type UpdateWebsiteChannelInput,
  type UpsertCategoryMappingInput,
  type UpsertWebsiteListingInput,
  type WebsiteCatalogQuery,
} from "@plm/contracts";
import { createHash } from "node:crypto";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import { Public } from "../common/public.decorator";
import type { RequestAuth, WebsiteRequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentWebsiteAuth } from "./website-auth.decorator";
import { WebsiteApiKeyGuard } from "./website-api-key.guard";
import { WebsitesService } from "./websites.service";

@ApiTags("Websites")
@ApiBearerAuth()
@Controller("websites")
export class WebsitesController {
  constructor(private readonly websites: WebsitesService) {}

  @Get()
  @RequirePermissions("integration.read")
  list(@CurrentAuth() auth: RequestAuth) { return this.websites.list(auth); }

  @Post()
  @RequirePermissions("integration.configure")
  create(@CurrentAuth() auth: RequestAuth, @Body(new ZodValidationPipe(createWebsiteChannelSchema)) input: CreateWebsiteChannelInput) { return this.websites.create(auth, input); }

  @Patch(":id")
  @RequirePermissions("integration.configure")
  update(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateWebsiteChannelSchema)) input: UpdateWebsiteChannelInput) { return this.websites.update(auth, id, input); }

  @Get(":id/api-keys")
  @RequirePermissions("integration.configure")
  listCredentials(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.websites.listCredentials(auth, id); }

  @Post(":id/api-keys")
  @RequirePermissions("integration.configure")
  issueCredential(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(createWebsiteApiCredentialSchema)) input: CreateWebsiteApiCredentialInput) { return this.websites.issueCredential(auth, id, input); }

  @Delete(":id/api-keys/:credentialId")
  @RequirePermissions("integration.configure")
  revokeCredential(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Param("credentialId", ParseUUIDPipe) credentialId: string) { return this.websites.revokeCredential(auth, id, credentialId); }

  @Get(":id/category-mappings")
  @RequirePermissions("integration.read")
  listMappings(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.websites.listMappings(auth, id); }

  @Post(":id/category-mappings")
  @RequirePermissions("integration.configure")
  mapCategory(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(upsertCategoryMappingSchema)) input: UpsertCategoryMappingInput) { return this.websites.upsertCategoryMapping(auth, id, input); }

  @Post(":id/listings")
  @RequirePermissions("product.publish")
  upsertListing(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(upsertWebsiteListingSchema)) input: UpsertWebsiteListingInput) { return this.websites.upsertListing(auth, id, input); }
}

@ApiTags("Website catalogue")
@ApiHeader({ name: "X-API-Key", required: true })
@Public()
@UseGuards(WebsiteApiKeyGuard)
@Controller("website-catalog")
export class WebsiteCatalogController {
  constructor(private readonly websites: WebsitesService) {}

  @Get("categories")
  async categories(@CurrentWebsiteAuth() auth: WebsiteRequestAuth, @Headers("if-none-match") currentEtag: string | undefined, @Res({ passthrough: true }) response: Response) {
    return this.cached(response, currentEtag, await this.websites.categories(auth));
  }

  @Get("products")
  async catalog(@CurrentWebsiteAuth() auth: WebsiteRequestAuth, @Query(new ZodValidationPipe(websiteCatalogQuerySchema)) query: WebsiteCatalogQuery, @Headers("if-none-match") currentEtag: string | undefined, @Res({ passthrough: true }) response: Response) {
    return this.cached(response, currentEtag, await this.websites.catalog(auth, query));
  }

  @Get("search")
  async search(@CurrentWebsiteAuth() auth: WebsiteRequestAuth, @Query(new ZodValidationPipe(websiteCatalogQuerySchema)) query: WebsiteCatalogQuery, @Headers("if-none-match") currentEtag: string | undefined, @Res({ passthrough: true }) response: Response) {
    return this.cached(response, currentEtag, await this.websites.catalog(auth, query));
  }

  @Get("products/:slug")
  async detail(@CurrentWebsiteAuth() auth: WebsiteRequestAuth, @Param("slug") slug: string, @Headers("if-none-match") currentEtag: string | undefined, @Res({ passthrough: true }) response: Response) {
    return this.cached(response, currentEtag, await this.websites.detail(auth, slug));
  }

  private cached(response: Response, currentEtag: string | undefined, payload: unknown) {
    const etag = `\"${createHash("sha256").update(JSON.stringify(payload)).digest("base64url")}\"`;
    response.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    response.setHeader("Vary", "X-API-Key");
    response.setHeader("ETag", etag);
    if (currentEtag === etag) { response.status(304); return undefined; }
    return payload;
  }
}
