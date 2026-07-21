import { Controller, Get } from "@nestjs/common";
import { CurrentAuth } from "./common/current-auth.decorator";
import type { RequestAuth } from "./common/request-context";
import { RequirePermissions } from "./access/permissions.decorator";
import { PrismaService } from "./database/prisma.service";

@Controller("workspace")
export class WorkspaceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("context")
  @RequirePermissions("company.read")
  async getContext(@CurrentAuth() auth: RequestAuth) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { id: true, name: true, slug: true, settings: true },
    });
    return {
      company,
      access: {
        visibility: "private",
        publicSignup: false,
        invitationOnly: true,
      },
      capabilities: ["catalog", "inventory", "imports", "channels", "audit"],
      role: auth.roleKey,
      permissions: auth.permissions,
    };
  }

  @Get("summary")
  @RequirePermissions("company.read")
  async getSummary(@CurrentAuth() auth: RequestAuth) {
    const [products, variants, warehouses, balances, jobs, notifications, emagAccounts, company] = await Promise.all([
      this.prisma.product.groupBy({
        by: ["status"],
        where: { companyId: auth.companyId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.productVariant.count({ where: { companyId: auth.companyId, deletedAt: null } }),
      this.prisma.warehouse.count({ where: { companyId: auth.companyId, isActive: true } }),
      this.prisma.stockLevel.findMany({
        where: { warehouse: { companyId: auth.companyId, isActive: true } },
        select: { variantId: true, onHand: true, reserved: true, damaged: true, quarantined: true, safetyStock: true },
      }),
      this.prisma.backgroundJob.findMany({
        where: { companyId: auth.companyId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 8,
        select: { id: true, type: true, queueName: true, status: true, progress: true, createdAt: true, completedAt: true, error: true },
      }),
      this.prisma.notification.findMany({
        where: { companyId: auth.companyId, resolvedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 8,
        select: { id: true, severity: true, title: true, message: true, entityType: true, entityId: true, createdAt: true },
      }),
      this.prisma.channelAccount.findMany({
        where: { companyId: auth.companyId, type: "EMAG" },
        select: { id: true, isActive: true, encryptedCredentials: true, configuration: true },
      }),
      this.prisma.company.findUniqueOrThrow({ where: { id: auth.companyId }, select: { settings: true } }),
    ]);
    const byStatus = Object.fromEntries(products.map((row) => [row.status, row._count._all]));
    const availableUnits = balances.reduce((total, row) => total + Math.max(0, row.onHand - row.reserved - row.damaged - row.quarantined - row.safetyStock), 0);
    const availabilityByVariant = new Map<string, number>();
    for (const row of balances) availabilityByVariant.set(row.variantId, (availabilityByVariant.get(row.variantId) ?? 0) + Math.max(0, row.onHand - row.reserved - row.damaged - row.quarantined - row.safetyStock));
    const settings = company.settings && typeof company.settings === "object" && !Array.isArray(company.settings) ? company.settings as Record<string, unknown> : {};
    const lowStockThreshold = typeof settings.lowStockThreshold === "number" ? settings.lowStockThreshold : 5;
    const lowStockVariants = Math.max(0, variants - availabilityByVariant.size) + [...availabilityByVariant.values()].filter((available) => available <= lowStockThreshold).length;
    const totalProducts = products.reduce((total, row) => total + row._count._all, 0);
    const failingJobs = jobs.filter((job) => ["FAILED", "PARTIALLY_SUCCEEDED"].includes(job.status)).length;
    const activeEmag = emagAccounts.find((account) => account.isActive);
    return {
      catalog: { totalProducts, variants, byStatus, readyForChannels: (byStatus.READY ?? 0) + (byStatus.ACTIVE ?? 0) },
      inventory: { availableUnits, warehouses, lowStockVariants, lowStockThreshold },
      attention: { unresolvedNotifications: notifications.length, failingJobs, total: notifications.length + failingJobs },
      emag: {
        accountCount: emagAccounts.length,
        active: Boolean(activeEmag),
        credentialsConfigured: Boolean(activeEmag?.encryptedCredentials),
        mode: activeEmag && typeof activeEmag.configuration === "object" && activeEmag.configuration && "mode" in activeEmag.configuration
          ? String((activeEmag.configuration as Record<string, unknown>).mode)
          : "mock",
      },
      notifications,
      recentJobs: jobs,
    };
  }
}
