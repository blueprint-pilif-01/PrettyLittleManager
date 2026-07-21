import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";

export function hashWebsiteApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

@Injectable()
export class WebsiteApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header("x-api-key");
    if (!provided || !/^plm_w_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{32,}$/.test(provided)) {
      throw this.unauthorized();
    }
    const prefix = provided.split("_")[2]!;
    const candidates = await this.prisma.websiteApiCredential.findMany({
      where: {
        keyPrefix: prefix,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        channelAccount: { type: "WEBSITE", isActive: true },
      },
      select: { id: true, companyId: true, channelAccountId: true, secretHash: true },
      take: 5,
    });
    const suppliedHash = Buffer.from(hashWebsiteApiKey(provided), "hex");
    const credential = candidates.find((candidate) => {
      const expected = Buffer.from(candidate.secretHash, "hex");
      return expected.length === suppliedHash.length && timingSafeEqual(expected, suppliedHash);
    });
    if (!credential) throw this.unauthorized();
    request.websiteAuth = {
      credentialId: credential.id,
      companyId: credential.companyId,
      channelAccountId: credential.channelAccountId,
    };
    await this.prisma.websiteApiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
    return true;
  }

  private unauthorized() {
    return new UnauthorizedException({ code: "WEBSITE_API_KEY_INVALID", message: "A valid website API key is required" });
  }
}
