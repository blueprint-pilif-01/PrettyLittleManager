import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { verify } from "argon2";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import type { RequestMetadata } from "../common/request-context";
import type { LoginDto } from "./dto/login.dto";
import type { AccessTokenClaims, AuthResult } from "./auth.types";

const ACCESS_TOKEN_SECONDS = 15 * 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRefreshToken() {
  return randomBytes(48).toString("base64url");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(input: LoginDto, metadata: RequestMetadata): Promise<AuthResult> {
    const workspaceSlug =
      input.workspace?.trim().toLowerCase() ||
      this.config.get<string>("WORKSPACE_SLUG") ||
      "aline";
    const email = input.email.trim().toLowerCase();

    const membership = await this.prisma.membership.findFirst({
      where: {
        company: { slug: workspaceSlug },
        user: { email, status: "ACTIVE" },
      },
      include: {
        company: true,
        user: true,
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });

    if (
      !membership?.user.passwordHash ||
      !(await verify(membership.user.passwordHash, input.password))
    ) {
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Email, password, or workspace is incorrect",
      });
    }

    const result = await this.createSession(
      {
        membershipId: membership.id,
        userId: membership.userId,
        companyId: membership.companyId,
      },
      metadata,
    );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: membership.userId },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          companyId: membership.companyId,
          actorId: membership.userId,
          action: "auth.login",
          entityType: "UserSession",
          entityId: result.sessionId,
          metadata: {
            correlationId: metadata.correlationId,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          },
        },
      }),
    ]);

    return {
      accessToken: result.accessToken,
      expiresInSeconds: ACCESS_TOKEN_SECONDS,
      refreshToken: result.refreshToken,
      profile: {
        id: membership.user.id,
        email: membership.user.email,
        displayName: membership.user.displayName,
        company: {
          id: membership.company.id,
          name: membership.company.name,
          slug: membership.company.slug,
        },
        role: { key: membership.role.key, name: membership.role.name },
        permissions: membership.role.permissions.map(
          (item) => item.permission.key,
        ),
      },
    };
  }

  async refresh(rawToken: string | undefined, metadata: RequestMetadata) {
    if (!rawToken) {
      throw new UnauthorizedException({
        code: "REFRESH_TOKEN_REQUIRED",
        message: "The refresh session is missing",
      });
    }

    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: {
        membership: {
          include: {
            company: true,
            user: true,
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: "REFRESH_TOKEN_INVALID",
        message: "The refresh session is invalid or expired",
      });
    }

    if (session.revokedAt) {
      await this.prisma.userSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "refresh-token-reuse" },
      });
      throw new UnauthorizedException({
        code: "REFRESH_TOKEN_REUSED",
        message: "This session family has been revoked",
      });
    }

    if (session.membership.user.status !== "ACTIVE") {
      throw new UnauthorizedException({
        code: "ACCOUNT_INACTIVE",
        message: "This account is not active",
      });
    }

    const rotated = await this.rotateSession(session, metadata);
    return {
      accessToken: rotated.accessToken,
      expiresInSeconds: ACCESS_TOKEN_SECONDS,
      refreshToken: rotated.refreshToken,
      profile: {
        id: session.membership.user.id,
        email: session.membership.user.email,
        displayName: session.membership.user.displayName,
        company: {
          id: session.membership.company.id,
          name: session.membership.company.name,
          slug: session.membership.company.slug,
        },
        role: {
          key: session.membership.role.key,
          name: session.membership.role.name,
        },
        permissions: session.membership.role.permissions.map(
          (item) => item.permission.key,
        ),
      },
    };
  }

  async logout(sessionId: string, metadata: RequestMetadata) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, membership: { select: { companyId: true } } },
    });
    if (!session) return;

    await this.prisma.$transaction([
      this.prisma.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokeReason: "logout" },
      }),
      this.prisma.auditLog.create({
        data: {
          companyId: session.membership.companyId,
          actorId: session.userId,
          action: "auth.logout",
          entityType: "UserSession",
          entityId: session.id,
          metadata: { correlationId: metadata.correlationId },
        },
      }),
    ]);
  }

  private async createSession(
    identity: { userId: string; membershipId: string; companyId: string },
    metadata: RequestMetadata,
  ) {
    const refreshToken = createRefreshToken();
    const refreshDays = this.config.get<number>("REFRESH_TOKEN_TTL_DAYS") ?? 30;
    const expiresAt = new Date(Date.now() + refreshDays * 86_400_000);
    const session = await this.prisma.userSession.create({
      data: {
        userId: identity.userId,
        membershipId: identity.membershipId,
        familyId: randomUUID(),
        refreshTokenHash: hashToken(refreshToken),
        expiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });

    return {
      sessionId: session.id,
      refreshToken,
      accessToken: await this.signAccessToken({
        sub: identity.userId,
        sid: session.id,
        mid: identity.membershipId,
        cid: identity.companyId,
        typ: "access",
      }),
    };
  }

  private async rotateSession(
    session: {
      id: string;
      userId: string;
      membershipId: string;
      familyId: string;
      membership: { companyId: string };
    },
    metadata: RequestMetadata,
  ) {
    const refreshToken = createRefreshToken();
    const refreshDays = this.config.get<number>("REFRESH_TOKEN_TTL_DAYS") ?? 30;
    const nextSessionId = randomUUID();
    const expiresAt = new Date(Date.now() + refreshDays * 86_400_000);

    await this.prisma.$transaction([
      this.prisma.userSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          revokeReason: "rotated",
          replacedById: nextSessionId,
          lastUsedAt: new Date(),
        },
      }),
      this.prisma.userSession.create({
        data: {
          id: nextSessionId,
          userId: session.userId,
          membershipId: session.membershipId,
          familyId: session.familyId,
          refreshTokenHash: hashToken(refreshToken),
          expiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
    ]);

    return {
      refreshToken,
      accessToken: await this.signAccessToken({
        sub: session.userId,
        sid: nextSessionId,
        mid: session.membershipId,
        cid: session.membership.companyId,
        typ: "access",
      }),
    };
  }

  private signAccessToken(claims: AccessTokenClaims) {
    const expiresIn = (this.config.get<string>("ACCESS_TOKEN_TTL") ??
      "15m") as JwtSignOptions["expiresIn"];
    return this.jwt.signAsync(claims, { expiresIn });
  }
}
