import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

@Injectable()
export class EncryptionService {
  encrypt(value: unknown): Uint8Array<ArrayBuffer> {
    const key = this.readKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return new Uint8Array(Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]));
  }

  decrypt<T>(payload: Uint8Array): T {
    const bytes = Buffer.from(payload);
    if (bytes.length < 30 || bytes[0] !== 1) throw new Error("Unsupported encrypted credential payload");
    const decipher = createDecipheriv("aes-256-gcm", this.readKey(), bytes.subarray(1, 13));
    decipher.setAuthTag(bytes.subarray(13, 29));
    const clear = Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]);
    return JSON.parse(clear.toString("utf8")) as T;
  }

  private readKey() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new ServiceUnavailableException({
        code: "ENCRYPTION_KEY_REQUIRED",
        message: "Configure a 32-byte ENCRYPTION_KEY before storing live integration credentials",
      });
    }
    const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new ServiceUnavailableException({
        code: "ENCRYPTION_KEY_INVALID",
        message: "ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hexadecimal characters",
      });
    }
    return key;
  }
}
