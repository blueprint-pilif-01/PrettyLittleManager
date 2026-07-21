import { Controller, Get } from "@nestjs/common";
import { connect } from "node:net";
import { getEmagReadiness, readEmagConfig } from "@plm/emag";
import { ObjectStorageService } from "./catalog/object-storage.service";
import { Public } from "./common/public.decorator";
import { PrismaService } from "./database/prisma.service";

export function redisReadinessCommand(redis: URL) {
  const username = decodeURIComponent(redis.username);
  const password = decodeURIComponent(redis.password);
  const commands = password
    ? [username ? ["AUTH", username, password] : ["AUTH", password], ["PING"]]
    : [["PING"]];
  return commands.map((parts) => {
    const values = parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("");
    return `*${parts.length}\r\n${values}`;
  }).join("");
}

export function redisReadinessResponse(response: string) {
  if (/^-(?:ERR|NOAUTH|WRONGPASS)/m.test(response)) return "failed" as const;
  if (response.includes("+PONG\r\n")) return "ready" as const;
  return "pending" as const;
}

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  @Public()
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "pretty-little-manager-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get("readiness")
  async getReadiness() {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);
    const emag = getEmagReadiness(readEmagConfig());
    const ready = database.ok && redis.ok && storage.ok && emag.canConnect;
    return {
      status: ready ? "ready" : "degraded",
      checks: {
        database,
        redis,
        storage,
        queues: { ok: redis.ok, detail: redis.ok ? "Redis-backed queues available" : "Queues unavailable until Redis starts" },
        emag: { ok: emag.canConnect, mode: emag.mode, credentialsConfigured: emag.credentialsConfigured },
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase() {
    const startedAt = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - startedAt) };
    }
  }

  private async checkStorage() {
    return this.storage.healthcheck();
  }

  private checkRedis(): Promise<{ ok: boolean; latencyMs: number }> {
    const redis = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
    const startedAt = performance.now();
    return new Promise((resolveResult) => {
      const socket = connect({ host: redis.hostname, port: Number(redis.port || 6379), timeout: 1_500 });
      let settled = false;
      let response = "";
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolveResult({ ok, latencyMs: Math.round(performance.now() - startedAt) });
      };
      socket.once("connect", () => socket.write(redisReadinessCommand(redis)));
      socket.on("data", (data) => {
        response += data.toString("utf8");
        const state = redisReadinessResponse(response);
        if (state === "ready") finish(true);
        if (state === "failed") finish(false);
      });
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.once("end", () => finish(false));
    });
  }
}
