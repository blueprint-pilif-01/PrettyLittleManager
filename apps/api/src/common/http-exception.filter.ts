import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

function normalizeException(exception: unknown): {
  status: number;
  error: ErrorPayload;
} {
  if (!(exception instanceof HttpException)) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    };
  }

  const status = exception.getStatus();
  const response = exception.getResponse();
  if (typeof response === "string") {
    return { status, error: { code: `HTTP_${status}`, message: response } };
  }

  const record = response as Record<string, unknown>;
  const rawMessage = record.message;
  const message = Array.isArray(rawMessage)
    ? "Request validation failed"
    : typeof rawMessage === "string"
      ? rawMessage
      : exception.message;

  const structuredDetails = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => !new Set(["statusCode", "error", "code", "message"]).has(key),
    ),
  );

  return {
    status,
    error: {
      code:
        typeof record.code === "string"
          ? record.code
          : status === HttpStatus.BAD_REQUEST
            ? "VALIDATION_ERROR"
            : `HTTP_${status}`,
      message,
      ...(Array.isArray(rawMessage)
        ? { details: rawMessage }
        : Object.keys(structuredDetails).length
          ? { details: structuredDetails }
          : {}),
    },
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const normalized = normalizeException(exception);

    response.status(normalized.status).json({
      error: normalized.error,
      correlationId: request.correlationId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
