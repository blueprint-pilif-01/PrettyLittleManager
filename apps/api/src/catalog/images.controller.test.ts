import { NotFoundException, StreamableFile } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PublicMediaController } from "./images.controller";
import type { ObjectStorageService } from "./object-storage.service";

describe("PublicMediaController", () => {
  it("serves a non-private object through the configured storage driver", async () => {
    const read = vi.fn().mockResolvedValue(Buffer.from("image"));
    const controller = new PublicMediaController({ read } as unknown as ObjectStorageService);

    const response = await controller.media(["company-id", "image-id", "medium.webp"]);

    expect(read).toHaveBeenCalledWith("company-id/image-id/medium.webp");
    expect(response).toBeInstanceOf(StreamableFile);
  });

  it("never exposes import, export, or report objects", async () => {
    const read = vi.fn();
    const controller = new PublicMediaController({ read } as unknown as ObjectStorageService);

    await expect(controller.media(["private", "exports", "company-id", "products.xlsx"]))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(read).not.toHaveBeenCalled();
  });
});
