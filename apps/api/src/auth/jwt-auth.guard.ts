import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { PermissionKey } from "@plm/contracts";
import { PrismaService } from "../database/prisma.service";
import { IS_PUBLIC_KEY } from "../common/public.decorator";
import type { AccessTokenClaims } from "./auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.readBearerToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: "ACCESS_TOKEN_REQUIRED",
        message: "Authentication is required",
      });
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    } catch {
      throw new UnauthorizedException({
        code: "ACCESS_TOKEN_INVALID",
        message: "The access token is invalid or expired",
      });
    }

    if (claims.typ !== "access") {
      throw new UnauthorizedException({
        code: "ACCESS_TOKEN_INVALID",
        message: "The token type is not accepted",
      });
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        membershipId: claims.mid,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        membership: { companyId: claims.cid, user: { status: "ACTIVE" } },
      },
      include: {
        membership: {
          include: {
            company: true,
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException({
        code: "SESSION_REVOKED",
        message: "This session is no longer active",
      });
    }

    request.auth = {
      userId: claims.sub,
      sessionId: session.id,
      membershipId: session.membershipId,
      companyId: session.membership.companyId,
      companySlug: session.membership.company.slug,
      roleKey: session.membership.role.key,
      permissions: session.membership.role.permissions.map(
        (item) => item.permission.key as PermissionKey,
      ),
    };
    return true;
  }

  private readBearerToken(request: Request) {
    const authorization = request.header("authorization");
    if (!authorization) return undefined;
    const [scheme, token] = authorization.split(" ");
    return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
  }
}
