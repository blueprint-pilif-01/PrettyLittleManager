import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CsrfOriginMiddleware } from "./csrf-origin.middleware";

const originalEnvironment = process.env.NODE_ENV;
const originalOrigin = process.env.WEB_ORIGIN;

afterEach(() => {
  process.env.NODE_ENV = originalEnvironment;
  process.env.WEB_ORIGIN = originalOrigin;
});

function request(method: string, origin?: string) {
  return {
    method,
    header: (name: string) => (name === "origin" ? origin : undefined),
  } as unknown as Request;
}

describe("CsrfOriginMiddleware", () => {
  it("allows safe methods", () => {
    process.env.NODE_ENV = "production";
    const next = vi.fn() as unknown as NextFunction;
    new CsrfOriginMiddleware().use(
      request("GET"),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows a production write only from the configured web origin", () => {
    process.env.NODE_ENV = "production";
    process.env.WEB_ORIGIN = "https://manager.aline.example";
    const next = vi.fn() as unknown as NextFunction;
    const middleware = new CsrfOriginMiddleware();

    middleware.use(
      request("POST", "https://manager.aline.example"),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(() =>
      middleware.use(
        request("POST", "https://attacker.example"),
        {} as Response,
        next,
      ),
    ).toThrow("The request origin is not allowed");
  });
});
