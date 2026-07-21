import { hash, argon2id } from "argon2";
import { PrismaClient } from "@prisma/client";
import { permissionKeys, rolePermissionMap } from "@plm/contracts";

const prisma = new PrismaClient();

const roleNames: Record<keyof typeof rolePermissionMap, string> = {
  owner: "Company Owner",
  admin: "Company Admin",
  product_manager: "Product Manager",
  inventory_manager: "Inventory Manager",
  employee: "Employee",
  viewer: "Viewer",
};

async function seed() {
  const workspaceSlug = process.env.WORKSPACE_SLUG?.trim() || "aline";
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminEmail) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL is required to seed the private workspace");
  }
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters");
  }

  const company = await prisma.company.upsert({
    where: { slug: workspaceSlug },
    update: { name: "Pretty Little Things" },
    create: { name: "Pretty Little Things", slug: workspaceSlug },
  });

  await prisma.permission.createMany({
    data: permissionKeys.map((key) => ({
      key,
      description: key.replaceAll(".", " "),
    })),
    skipDuplicates: true,
  });

  const permissions = await prisma.permission.findMany({
    select: { id: true, key: true },
  });
  const permissionIdByKey = new Map(permissions.map((item) => [item.key, item.id]));

  const roles = new Map<string, string>();
  for (const [key, rolePermissions] of Object.entries(rolePermissionMap)) {
    const role = await prisma.role.upsert({
      where: { companyId_key: { companyId: company.id, key } },
      update: { name: roleNames[key as keyof typeof roleNames], isSystem: true },
      create: {
        companyId: company.id,
        key,
        name: roleNames[key as keyof typeof roleNames],
        isSystem: true,
      },
    });
    roles.set(key, role.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: rolePermissions.map((permissionKey) => {
        const permissionId = permissionIdByKey.get(permissionKey);
        if (!permissionId) throw new Error(`Missing seeded permission: ${permissionKey}`);
        return { roleId: role.id, permissionId };
      }),
      skipDuplicates: true,
    });
  }

  const passwordHash = await hash(adminPassword, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { displayName: "Aline Admin", passwordHash, status: "ACTIVE" },
    create: {
      email: adminEmail,
      displayName: "Aline Admin",
      passwordHash,
      status: "ACTIVE",
    },
  });

  const adminRoleId = roles.get("admin");
  if (!adminRoleId) throw new Error("Company admin role was not seeded");

  await prisma.membership.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    update: { roleId: adminRoleId },
    create: { companyId: company.id, userId: user.id, roleId: adminRoleId },
  });

  console.info(`Seeded private workspace '${workspaceSlug}' for ${adminEmail}`);
}

seed()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unknown seed failure");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
