import { describe, expect, it } from "vitest";
import { permissionKeys, rolePermissionMap } from "./permissions";

describe("role permissions", () => {
  it("defines every permission key once", () => {
    expect(new Set(permissionKeys).size).toBe(permissionKeys.length);
  });

  it("grants all current permissions to owner and admin roles", () => {
    expect(rolePermissionMap.owner).toEqual(permissionKeys);
    expect(rolePermissionMap.admin).toEqual(permissionKeys);
  });

  it("keeps viewer and inventory roles least-privilege", () => {
    expect(rolePermissionMap.viewer).not.toContain("product.update");
    expect(rolePermissionMap.viewer).not.toContain("inventory.adjust");
    expect(rolePermissionMap.inventory_manager).toContain("inventory.adjust");
    expect(rolePermissionMap.inventory_manager).not.toContain("users.manage");
  });
});
