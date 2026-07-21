import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { PermissionKey } from "@plm/contracts";
import { PERMISSIONS_KEY } from "./permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const granted = new Set(request.auth?.permissions ?? []);
    const missing = required.filter((permission) => !granted.has(permission));
    if (missing.length) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "You do not have permission to perform this action",
        missingPermissions: missing,
      });
    }
    return true;
  }
}
