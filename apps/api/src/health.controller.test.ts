import { describe, expect, it } from "vitest";
import { redisReadinessCommand, redisReadinessResponse } from "./health.controller";

describe("Redis readiness protocol", () => {
  it("sends a plain PING when authentication is not configured", () => {
    expect(redisReadinessCommand(new URL("redis://redis:6379")))
      .toBe("*1\r\n$4\r\nPING\r\n");
  });

  it("authenticates before PING without leaking URL encoding", () => {
    expect(redisReadinessCommand(new URL("redis://:secret%2Dvalue@redis:6379")))
      .toBe("*2\r\n$4\r\nAUTH\r\n$12\r\nsecret-value\r\n*1\r\n$4\r\nPING\r\n");
  });

  it("supports an ACL username and password", () => {
    expect(redisReadinessCommand(new URL("redis://worker:secret@redis:6379")))
      .toContain("$6\r\nworker\r\n$6\r\nsecret\r\n");
  });

  it("waits for fragmented success and fails explicit authentication errors", () => {
    expect(redisReadinessResponse("+OK\r\n")).toBe("pending");
    expect(redisReadinessResponse("+OK\r\n+PONG\r\n")).toBe("ready");
    expect(redisReadinessResponse("-WRONGPASS invalid username-password pair\r\n")).toBe("failed");
  });
});
