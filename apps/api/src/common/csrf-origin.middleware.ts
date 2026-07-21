import {
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfOriginMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    if (safeMethods.has(request.method) || process.env.NODE_ENV !== "production") {
      next();
      return;
    }

    const origin = request.header("origin");
    const allowedOrigins = (process.env.WEB_ORIGIN ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!origin || !allowedOrigins.includes(origin)) {
      throw new ForbiddenException({
        code: "CSRF_ORIGIN_REJECTED",
        message: "The request origin is not allowed",
      });
    }
    next();
  }
}
