import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

type StoredObject = {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
};

@Injectable()
export class ObjectStorageService {
  readonly driver: "local" | "s3";
  private readonly localRoot: string;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly s3?: S3Client;

  constructor(private readonly config: ConfigService) {
    this.driver = config.get<string>("OBJECT_STORAGE_DRIVER") === "s3" ? "s3" : "local";
    this.localRoot = resolve(config.get<string>("LOCAL_MEDIA_DIR") ?? ".local/media");
    this.bucket = config.get<string>("OBJECT_STORAGE_BUCKET") ?? "plm-media";
    const apiBase = config.get<string>("API_PUBLIC_URL") ?? `http://localhost:${config.get<string>("API_PORT") ?? "3000"}`;
    this.publicBaseUrl = (config.get<string>("OBJECT_STORAGE_PUBLIC_URL") ?? `${apiBase}/api/v1/media`).replace(/\/$/, "");

    if (this.driver === "s3") {
      const accessKeyId = config.get<string>("OBJECT_STORAGE_ACCESS_KEY");
      const secretAccessKey = config.get<string>("OBJECT_STORAGE_SECRET_KEY");
      this.s3 = new S3Client({
        endpoint: config.get<string>("OBJECT_STORAGE_ENDPOINT"),
        region: config.get<string>("OBJECT_STORAGE_REGION") ?? "eu-central-1",
        forcePathStyle: true,
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      });
    }
  }

  async put(object: StoredObject) {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl ?? "public, max-age=31536000, immutable",
      }));
    } else {
      const target = this.localPath(object.key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, object.body);
    }
    return this.publicUrl(object.key);
  }

  async delete(keys: string[]) {
    await Promise.all(keys.map(async (key) => {
      if (this.s3) {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        return;
      }
      try {
        await unlink(this.localPath(key));
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }));
  }

  async readLocal(key: string) {
    if (this.driver !== "local") {
      throw new NotFoundException({ code: "MEDIA_NOT_LOCAL", message: "Media is served by the configured CDN" });
    }
    try {
      return await readFile(this.localPath(key));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException({ code: "MEDIA_NOT_FOUND", message: "Media object not found" });
      }
      throw error;
    }
  }

  async read(key: string) {
    if (!this.s3) return this.readLocal(key);
    const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) {
      throw new NotFoundException({ code: "MEDIA_NOT_FOUND", message: "Stored object not found" });
    }
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async healthcheck() {
    const startedAt = performance.now();
    try {
      if (this.s3) {
        await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } else {
        await mkdir(this.localRoot, { recursive: true });
        await readFile(resolve(this.localRoot, ".plm-healthcheck"))
          .catch(async (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            await writeFile(resolve(this.localRoot, ".plm-healthcheck"), "ok\n");
          });
      }
      return { ok: true, driver: this.driver, latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { ok: false, driver: this.driver, latencyMs: Math.round(performance.now() - startedAt) };
    }
  }

  publicUrl(key: string) {
    return `${this.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private localPath(key: string) {
    if (!key || isAbsolute(key) || key.includes("\0")) {
      throw new Error("Invalid media object key");
    }
    const target = resolve(this.localRoot, key);
    const traversal = relative(this.localRoot, target);
    if (traversal.startsWith(`..${sep}`) || traversal === ".." || isAbsolute(traversal)) {
      throw new Error("Media object key escapes the configured storage directory");
    }
    return target;
  }
}
