import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { ObjectStorageService } from "./object-storage.service";

describe("ObjectStorageService healthcheck", () => {
  it("proves the local storage directory is writable", async () => {
    const root = await mkdtemp(join(tmpdir(), "plm-storage-health-"));
    try {
      const values: Record<string, string> = {
        OBJECT_STORAGE_DRIVER: "local",
        LOCAL_MEDIA_DIR: root,
      };
      const config = { get: (key: string) => values[key] } as unknown as ConfigService;
      const storage = new ObjectStorageService(config);

      await expect(storage.healthcheck()).resolves.toMatchObject({ ok: true, driver: "local" });
      await expect(readFile(join(root, ".plm-healthcheck"), "utf8")).resolves.toBe("ok\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
