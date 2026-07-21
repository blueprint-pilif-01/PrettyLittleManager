import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { rolePermissionMap, type AcceptInvitationInput, type AuditLogQuery, type CreateCompanyInput, type CreateInvitationInput, type CreateRoleInput, type UpdateCompanyInput, type UpdateMembershipInput } from "@plm/contracts";
import { argon2id, hash } from "argon2";
import { createHash, randomBytes } from "node:crypto";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";

const tokenHash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

@Injectable()
export class AccessAdminService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(auth: RequestAuth) {
    return this.prisma.membership.findMany({
      where: { companyId: auth.companyId },
      orderBy: { user: { displayName: "asc" } },
      select: { id: true, createdAt: true, user: { select: { id: true, email: true, displayName: true, status: true, lastLoginAt: true, createdAt: true } }, role: { select: { id: true, key: true, name: true } } },
    });
  }

  listCompanies(auth: RequestAuth) {
    return this.prisma.membership.findMany({ where: { userId: auth.userId, user: { status: "ACTIVE" } }, select: { company: true, role: { select: { id: true, key: true, name: true } } }, orderBy: { company: { name: "asc" } } });
  }

  async createCompany(auth: RequestAuth, input: CreateCompanyInput) {
    const permissions = await this.prisma.permission.findMany();
    const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
    try {
      const company = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.company.create({ data: input });
        let ownerRoleId: string | undefined;
        for (const [key, rolePermissions] of Object.entries(rolePermissionMap)) {
          const role = await transaction.role.create({ data: { companyId: created.id, key, name: key.split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(" "), isSystem: true } });
          if (key === "owner") ownerRoleId = role.id;
          await transaction.rolePermission.createMany({ data: rolePermissions.map((permissionKey) => {
            const permissionId = permissionByKey.get(permissionKey);
            if (!permissionId) throw new Error(`Missing system permission ${permissionKey}`);
            return { roleId: role.id, permissionId };
          }) });
        }
        if (!ownerRoleId) throw new Error("Owner role could not be created");
        await transaction.membership.create({ data: { companyId: created.id, userId: auth.userId, roleId: ownerRoleId } });
        await transaction.auditLog.create({ data: { companyId: created.id, actorId: auth.userId, action: "company.created", entityType: "Company", entityId: created.id, after: { name: created.name, slug: created.slug } } });
        return created;
      });
      return company;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "COMPANY_SLUG_EXISTS", message: "A company with this slug already exists" });
      throw error;
    }
  }

  listRoles(auth: RequestAuth) {
    return this.prisma.role.findMany({ where: { companyId: auth.companyId }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { permissions: { include: { permission: true } }, _count: { select: { memberships: true } } } });
  }

  async createRole(auth: RequestAuth, input: CreateRoleInput) {
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: input.permissions } } });
    if (permissions.length !== new Set(input.permissions).size) throw new ConflictException({ code: "PERMISSION_UNKNOWN", message: "One or more permission keys are invalid" });
    try {
      const role = await this.prisma.role.create({
        data: { companyId: auth.companyId, key: input.key, name: input.name, description: input.description, permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } },
        include: { permissions: { include: { permission: true } } },
      });
      await this.audit(auth, "role.created", "Role", role.id, { key: role.key, permissions: input.permissions });
      return role;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "ROLE_EXISTS", message: "A role with this key already exists" });
      throw error;
    }
  }

  async createInvitation(auth: RequestAuth, input: CreateInvitationInput) {
    const role = await this.prisma.role.findFirst({ where: { id: input.roleId, companyId: auth.companyId } });
    if (!role) throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Role not found" });
    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser?.status === "ACTIVE") throw new ConflictException({ code: "USER_ALREADY_ACTIVE", message: "This email already belongs to an active user" });
    const user = existingUser
      ? await this.prisma.user.update({ where: { id: existingUser.id }, data: { displayName: input.displayName } })
      : await this.prisma.user.create({ data: { email: input.email, displayName: input.displayName, status: "INVITED" } });
    await this.prisma.invitation.updateMany({ where: { companyId: auth.companyId, email: input.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const token = randomBytes(48).toString("base64url");
    const invitation = await this.prisma.invitation.create({
      data: { companyId: auth.companyId, email: input.email, roleId: role.id, tokenHash: tokenHash(token), invitedById: auth.userId, expiresAt: new Date(Date.now() + input.expiresInDays * 86_400_000) },
      select: { id: true, email: true, roleId: true, expiresAt: true, createdAt: true },
    });
    await this.audit(auth, "invitation.created", "Invitation", invitation.id, { email: invitation.email, roleId: role.id });
    return { invitation, token, acceptancePath: "/accept-invitation", warning: "Deliver this token securely. It cannot be retrieved later." };
  }

  listInvitations(auth: RequestAuth) {
    return this.prisma.invitation.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, role: { select: { id: true, key: true, name: true } }, invitedBy: { select: { id: true, displayName: true } } } });
  }

  async revokeInvitation(auth: RequestAuth, id: string) {
    const invitation = await this.prisma.invitation.findFirst({ where: { id, companyId: auth.companyId } });
    if (!invitation) throw new NotFoundException({ code: "INVITATION_NOT_FOUND", message: "Invitation not found" });
    if (invitation.acceptedAt) throw new ConflictException({ code: "INVITATION_ALREADY_ACCEPTED", message: "Accepted invitations cannot be revoked" });
    const updated = await this.prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit(auth, "invitation.revoked", "Invitation", id, { email: invitation.email });
    return { id: updated.id, revokedAt: updated.revokedAt };
  }

  async acceptInvitation(input: AcceptInvitationInput) {
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: tokenHash(input.token) }, include: { role: true } });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) throw new NotFoundException({ code: "INVITATION_INVALID", message: "This invitation is invalid, expired, or already used" });
    const user = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (!user || user.status === "ACTIVE") throw new ConflictException({ code: "INVITATION_USER_STATE_INVALID", message: "This invitation cannot activate the user" });
    const passwordHash = await hash(input.password, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: user.id }, data: { passwordHash, displayName: input.displayName ?? user.displayName, status: "ACTIVE" } });
      await transaction.membership.upsert({ where: { companyId_userId: { companyId: invitation.companyId, userId: user.id } }, create: { companyId: invitation.companyId, userId: user.id, roleId: invitation.roleId }, update: { roleId: invitation.roleId } });
      await transaction.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await transaction.auditLog.create({ data: { companyId: invitation.companyId, actorId: user.id, action: "invitation.accepted", entityType: "Invitation", entityId: invitation.id, after: { roleId: invitation.roleId } } });
    });
    return { accepted: true, email: invitation.email, workspaceLoginRequired: true };
  }

  async updateMembership(auth: RequestAuth, membershipId: string, input: UpdateMembershipInput) {
    const membership = await this.prisma.membership.findFirst({ where: { id: membershipId, companyId: auth.companyId }, include: { user: true, role: true } });
    if (!membership) throw new NotFoundException({ code: "MEMBERSHIP_NOT_FOUND", message: "Workspace member not found" });
    if (membership.userId === auth.userId && input.status === "SUSPENDED") throw new ConflictException({ code: "CANNOT_SUSPEND_SELF", message: "You cannot suspend your own account" });
    const role = input.roleId ? await this.prisma.role.findFirst({ where: { id: input.roleId, companyId: auth.companyId } }) : undefined;
    if (input.roleId && !role) throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Role not found" });
    const currentlyPrivileged = ["owner", "admin"].includes(membership.role.key) && membership.user.status === "ACTIVE";
    const remainsPrivileged = (input.status ?? membership.user.status) === "ACTIVE" && ["owner", "admin"].includes(role?.key ?? membership.role.key);
    if (currentlyPrivileged && !remainsPrivileged) {
      const alternatives = await this.prisma.membership.count({ where: { companyId: auth.companyId, id: { not: membershipId }, user: { status: "ACTIVE" }, role: { key: { in: ["owner", "admin"] } } } });
      if (!alternatives) throw new ConflictException({ code: "LAST_ADMIN_REQUIRED", message: "The workspace must retain at least one active administrator" });
    }
    await this.prisma.$transaction([
      ...(input.roleId ? [this.prisma.membership.update({ where: { id: membershipId }, data: { roleId: input.roleId } })] : []),
      ...(input.status ? [this.prisma.user.update({ where: { id: membership.userId }, data: { status: input.status } })] : []),
      ...(input.status === "SUSPENDED" ? [this.prisma.userSession.updateMany({ where: { userId: membership.userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "user-suspended" } })] : []),
      this.prisma.auditLog.create({ data: { companyId: auth.companyId, actorId: auth.userId, action: "membership.updated", entityType: "Membership", entityId: membershipId, before: { roleId: membership.roleId, status: membership.user.status }, after: { roleId: input.roleId ?? membership.roleId, status: input.status ?? membership.user.status } } }),
    ]);
    return this.prisma.membership.findUnique({ where: { id: membershipId }, include: { user: true, role: true } });
  }

  async updateCompany(auth: RequestAuth, input: UpdateCompanyInput) {
    const existing = await this.prisma.company.findUniqueOrThrow({ where: { id: auth.companyId } });
    const existingSettings = existing.settings && typeof existing.settings === "object" && !Array.isArray(existing.settings)
      ? existing.settings as Record<string, unknown>
      : {};
    const company = await this.prisma.company.update({
      where: { id: auth.companyId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.settings !== undefined ? { settings: { ...existingSettings, ...input.settings } as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit(auth, "company.updated", "Company", company.id, { name: company.name, settings: company.settings });
    return company;
  }

  async auditLogs(auth: RequestAuth, query: AuditLogQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: { companyId: auth.companyId, action: query.action, entityType: query.entityType, actorId: query.actorId },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { actor: { select: { id: true, email: true, displayName: true } } },
    });
    const hasMore = rows.length > query.limit;
    return { data: rows.slice(0, query.limit), pageInfo: { hasMore, nextCursor: hasMore ? rows[query.limit - 1]?.id : null } };
  }

  private audit(auth: RequestAuth, action: string, entityType: string, entityId: string, after: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { companyId: auth.companyId, actorId: auth.userId, action, entityType, entityId, after } });
  }
}
