import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@plm/contracts";

export const PERMISSIONS_KEY = "plm:permissions";
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
