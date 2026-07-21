import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const safeCorrelationId = /^[A-Za-z0-9._:-]{1,100}$/;

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const supplied = request.header("x-correlation-id");
    request.correlationId =
      supplied && safeCorrelationId.test(supplied) ? supplied : randomUUID();
    response.setHeader("x-correlation-id", request.correlationId);
    next();
  }
}
