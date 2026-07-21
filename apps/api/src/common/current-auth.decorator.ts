import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { RequestAuth } from "./request-context";

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestAuth => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth) throw new Error("Authenticated request context is missing");
    return request.auth;
  },
);
