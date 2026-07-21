import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { WebsiteRequestAuth } from "../common/request-context";

export const CurrentWebsiteAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WebsiteRequestAuth => {
    const auth = context.switchToHttp().getRequest<Request>().websiteAuth;
    if (!auth) throw new Error("Website authentication context is missing");
    return auth;
  },
);
