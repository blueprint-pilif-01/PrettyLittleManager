import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { PermissionsGuard } from "./permissions.guard";

function createContext(permissions: string[]) {
  const request = { auth: { permissions } };
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  it("allows a request with every required permission", () => {
    const reflector = {
      getAllAndOverride: () => ["product.read", "product.update"],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(createContext(["product.read", "product.update"])),
    ).toBe(true);
  });

  it("rejects a request when one permission is missing", () => {
    const reflector = {
      getAllAndOverride: () => ["product.read", "product.update"],
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(createContext(["product.read"]))).toThrow(
      ForbiddenException,
    );
  });
});
