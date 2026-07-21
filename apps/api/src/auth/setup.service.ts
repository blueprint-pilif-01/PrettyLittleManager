import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { rolePermissionMap, type BootstrapWorkspaceInput } from "@plm/contracts";
import { argon2id, hash } from "argon2";
import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async status() {
    const companies = await this.prisma.company.count();
    return { needsSetup: companies === 0, invitationOnly: true };
  }

  async bootstrap(input: BootstrapWorkspaceInput, suppliedToken: string | undefined) {
    const existing = await this.prisma.company.count();
    if (existing) throw new ConflictException({ code: "SETUP_ALREADY_COMPLETED", message: "Initial workspace setup has already been completed" });
    const configuredToken = process.env.INITIAL_SETUP_TOKEN;
    if (!configuredToken || configuredToken.length < 32) throw new ServiceUnavailableException({ code: "SETUP_TOKEN_NOT_CONFIGURED", message: "Configure INITIAL_SETUP_TOKEN with at least 32 random characters before first-run setup" });
    if (!suppliedToken || !this.equalToken(suppliedToken, configuredToken)) throw new ForbiddenException({ code: "SETUP_TOKEN_INVALID", message: "The one-time setup token is invalid" });
    const passwordHash = await hash(input.password, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    return this.prisma.$transaction(async (transaction) => {
      if (await transaction.company.count()) throw new ConflictException({ code: "SETUP_ALREADY_COMPLETED", message: "Initial workspace setup has already been completed" });
      const company = await transaction.company.create({ data: { name: input.companyName, slug: input.companySlug } });
      for (const permissionKey of Object.values(rolePermissionMap).flat()) {
        await transaction.permission.upsert({ where: { key: permissionKey }, create: { key: permissionKey, description: permissionKey.replaceAll(".", " ") }, update: {} });
      }
      const permissions = await transaction.permission.findMany();
      const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
      let adminRoleId: string | undefined;
      for (const [key, permissionKeys] of Object.entries(rolePermissionMap)) {
        const role = await transaction.role.create({ data: { companyId: company.id, key, name: key.split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(" "), isSystem: true } });
        if (key === "admin") adminRoleId = role.id;
        await transaction.rolePermission.createMany({ data: permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionId: permissionByKey.get(permissionKey)! })) });
      }
      if (!adminRoleId) throw new Error("Administrator role was not created");
      const user = await transaction.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash, status: "ACTIVE" } });
      await transaction.membership.create({ data: { companyId: company.id, userId: user.id, roleId: adminRoleId } });
      await transaction.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: "workspace.bootstrapped", entityType: "Company", entityId: company.id, after: { name: company.name, slug: company.slug } } });
      return { completed: true, company: { id: company.id, name: company.name, slug: company.slug }, admin: { id: user.id, email: user.email, displayName: user.displayName }, loginRequired: true };
    });
  }

  private equalToken(left: string, right: string) {
    const leftHash = createHash("sha256").update(left).digest();
    const rightHash = createHash("sha256").update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
  }
}
