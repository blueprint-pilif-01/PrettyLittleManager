import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  acceptInvitationSchema, auditLogQuerySchema, createCompanySchema, createInvitationSchema, createRoleSchema, updateCompanySchema, updateMembershipSchema,
  type AcceptInvitationInput, type AuditLogQuery, type CreateCompanyInput, type CreateInvitationInput, type CreateRoleInput, type UpdateCompanyInput, type UpdateMembershipInput,
} from "@plm/contracts";
import { CurrentAuth } from "../common/current-auth.decorator";
import { Public } from "../common/public.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RequirePermissions } from "./permissions.decorator";
import { AccessAdminService } from "./access-admin.service";

@ApiTags("Workspace access")
@ApiBearerAuth()
@Controller()
export class AccessAdminController {
  constructor(private readonly access: AccessAdminService) {}
  @Get("users") @RequirePermissions("users.read") users(@CurrentAuth() auth: RequestAuth) { return this.access.listUsers(auth); }
  @Get("companies") @RequirePermissions("company.read") companies(@CurrentAuth() auth: RequestAuth) { return this.access.listCompanies(auth); }
  @Post("companies") @RequirePermissions("company.update") createCompany(@CurrentAuth() auth: RequestAuth, @Body(new ZodValidationPipe(createCompanySchema)) input: CreateCompanyInput) { return this.access.createCompany(auth, input); }
  @Patch("memberships/:id") @RequirePermissions("users.manage") updateMember(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateMembershipSchema)) input: UpdateMembershipInput) { return this.access.updateMembership(auth, id, input); }
  @Get("roles") @RequirePermissions("roles.read") roles(@CurrentAuth() auth: RequestAuth) { return this.access.listRoles(auth); }
  @Post("roles") @RequirePermissions("roles.manage") createRole(@CurrentAuth() auth: RequestAuth, @Body(new ZodValidationPipe(createRoleSchema)) input: CreateRoleInput) { return this.access.createRole(auth, input); }
  @Get("invitations") @RequirePermissions("users.read") invitations(@CurrentAuth() auth: RequestAuth) { return this.access.listInvitations(auth); }
  @Post("invitations") @RequirePermissions("users.manage") invite(@CurrentAuth() auth: RequestAuth, @Body(new ZodValidationPipe(createInvitationSchema)) input: CreateInvitationInput) { return this.access.createInvitation(auth, input); }
  @Delete("invitations/:id") @RequirePermissions("users.manage") revoke(@CurrentAuth() auth: RequestAuth, @Param("id", ParseUUIDPipe) id: string) { return this.access.revokeInvitation(auth, id); }
  @Public() @Post("auth/invitations/accept") accept(@Body(new ZodValidationPipe(acceptInvitationSchema)) input: AcceptInvitationInput) { return this.access.acceptInvitation(input); }
  @Patch("company") @RequirePermissions("company.update") company(@CurrentAuth() auth: RequestAuth, @Body(new ZodValidationPipe(updateCompanySchema)) input: UpdateCompanyInput) { return this.access.updateCompany(auth, input); }
  @Get("audit-logs") @RequirePermissions("audit.read") audit(@CurrentAuth() auth: RequestAuth, @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery) { return this.access.auditLogs(auth, query); }
}
