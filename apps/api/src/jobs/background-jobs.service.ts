import { ConflictException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type JobStatus } from "@prisma/client";
import type { JobQuery } from "@plm/contracts";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import type { RequestAuth } from "../common/request-context";
import { PrismaService } from "../database/prisma.service";

export const operationalQueues = [
  "marketplace-publication",
  "stock-sync",
  "imports",
  "exports",
  "image-processing",
  "reconciliation",
  "notifications",
] as const;
export type OperationalQueue = (typeof operationalQueues)[number];

@Injectable()
export class BackgroundJobsService implements OnModuleDestroy {
  private readonly redis = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  private readonly connection = {
    host: this.redis.hostname,
    port: Number(this.redis.port || 6379),
    username: this.redis.username || undefined,
    password: this.redis.password || undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 3_000,
    retryStrategy: (attempt: number) => attempt <= 2 ? attempt * 250 : null,
    ...(this.redis.protocol === "rediss:" ? { tls: {} } : {}),
  };
  private readonly queues = new Map<OperationalQueue, Queue>();

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    companyId: string;
    type: string;
    queueName: OperationalQueue;
    payload: Prisma.InputJsonValue;
    correlationId?: string;
    deduplicationKey?: string;
    maxAttempts?: number;
  }) {
    if (input.deduplicationKey) {
      const existing = await this.prisma.backgroundJob.findFirst({
        where: {
          companyId: input.companyId,
          type: input.type,
          deduplicationKey: input.deduplicationKey,
          status: { in: ["QUEUED", "RUNNING"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return { job: existing, deduplicated: true };
    }
    const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 5, 10));
    const job = await this.prisma.backgroundJob.create({
      data: {
        companyId: input.companyId,
        type: input.type,
        queueName: input.queueName,
        input: input.payload,
        correlationId: input.correlationId,
        deduplicationKey: input.deduplicationKey,
        maxAttempts,
      },
    });
    try {
      const queueJobId = randomUUID();
      await this.queue(input.queueName).add(input.type, { backgroundJobId: job.id }, {
        jobId: queueJobId,
        attempts: maxAttempts,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 7 * 86_400, count: 10_000 },
        removeOnFail: false,
      });
      const persisted = await this.prisma.backgroundJob.update({ where: { id: job.id }, data: { queueJobId } });
      return { job: persisted, deduplicated: false };
    } catch (error) {
      await this.resetQueue(input.queueName);
      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "FAILED", completedAt: new Date(), error: this.serializeError(error), deadLetteredAt: new Date() },
      });
      throw new ServiceUnavailableException({ code: "QUEUE_UNAVAILABLE", message: "The background queue is unavailable. Start Redis and retry." });
    }
  }

  async list(auth: RequestAuth, query: JobQuery) {
    const jobs = await this.prisma.backgroundJob.findMany({
      where: {
        companyId: auth.companyId,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
        ...(query.status ? { status: query.status as JobStatus } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 5 } },
    });
    const hasMore = jobs.length > query.limit;
    return { data: jobs.slice(0, query.limit), pageInfo: { hasMore, nextCursor: hasMore ? jobs[query.limit - 1]?.id : null } };
  }

  async detail(auth: RequestAuth, id: string) {
    const job = await this.prisma.backgroundJob.findFirst({ where: { id, companyId: auth.companyId }, include: { attempts: { orderBy: { attemptNumber: "desc" } } } });
    if (!job) throw new NotFoundException({ code: "JOB_NOT_FOUND", message: "Background job not found" });
    return job;
  }

  async retry(auth: RequestAuth, id: string) {
    const job = await this.detail(auth, id);
    if (!(["FAILED", "PARTIALLY_SUCCEEDED", "CANCELLED"] as JobStatus[]).includes(job.status)) {
      throw new ConflictException({ code: "JOB_NOT_RETRYABLE", message: "Only failed, partial, or cancelled jobs can be retried" });
    }
    const queueName = job.queueName as OperationalQueue;
    if (!operationalQueues.includes(queueName)) throw new ConflictException({ code: "JOB_QUEUE_INVALID", message: "This job has an unsupported queue" });
    const queueJobId = randomUUID();
    try {
      await this.queue(queueName).add(job.type, { backgroundJobId: job.id }, { jobId: queueJobId, attempts: job.maxAttempts, backoff: { type: "exponential", delay: 1_000 }, removeOnFail: false });
    } catch {
      await this.resetQueue(queueName);
      throw new ServiceUnavailableException({ code: "QUEUE_UNAVAILABLE", message: "The background queue is unavailable. Start Redis and retry." });
    }
    return this.prisma.backgroundJob.update({
      where: { id },
      data: { status: "QUEUED", progress: 0, queueJobId, error: Prisma.DbNull, result: Prisma.DbNull, completedAt: null, deadLetteredAt: null, nextRetryAt: null },
    });
  }

  async cancel(auth: RequestAuth, id: string) {
    const job = await this.detail(auth, id);
    if (!(["QUEUED", "RUNNING"] as JobStatus[]).includes(job.status)) throw new ConflictException({ code: "JOB_NOT_CANCELLABLE", message: "This job is already finished" });
    if (job.queueJobId) await this.queue(job.queueName as OperationalQueue).remove(job.queueJobId).catch(() => undefined);
    return this.prisma.backgroundJob.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } });
  }

  async listNotifications(auth: RequestAuth, cursor: string | undefined, limit: number) {
    const rows = await this.prisma.notification.findMany({
      where: { companyId: auth.companyId, ...(cursor ? { id: { lt: cursor } } : {}) },
      take: limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const hasMore = rows.length > limit;
    return { data: rows.slice(0, limit), pageInfo: { hasMore, nextCursor: hasMore ? rows[limit - 1]?.id : null } };
  }

  async resolveNotification(auth: RequestAuth, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, companyId: auth.companyId } });
    if (!notification) throw new NotFoundException({ code: "NOTIFICATION_NOT_FOUND", message: "Notification not found" });
    return this.prisma.notification.update({ where: { id }, data: { resolvedAt: new Date(), readAt: notification.readAt ?? new Date() } });
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  private queue(name: OperationalQueue) {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  private async resetQueue(name: OperationalQueue) {
    const queue = this.queues.get(name);
    this.queues.delete(name);
    await queue?.close().catch(() => undefined);
  }

  private serializeError(error: unknown): Prisma.InputJsonValue {
    return { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) };
  }
}
