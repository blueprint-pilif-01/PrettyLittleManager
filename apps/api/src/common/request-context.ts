import type { PermissionKey } from "@plm/contracts";

export type RequestAuth = {
  userId: string;
  sessionId: string;
  membershipId: string;
  companyId: string;
  companySlug: string;
  roleKey: string;
  permissions: readonly PermissionKey[];
};

export type WebsiteRequestAuth = {
  credentialId: string;
  companyId: string;
  channelAccountId: string;
};

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      auth?: RequestAuth;
      websiteAuth?: WebsiteRequestAuth;
    }
  }
}

export type RequestMetadata = {
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
};
