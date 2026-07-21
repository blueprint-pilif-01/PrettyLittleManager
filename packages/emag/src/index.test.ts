import { describe, expect, it } from "vitest";
import { chunk, getEmagReadiness, MockEmagClient, readEmagConfig } from "./index.js";

describe("eMAG readiness", () => {
  it("is safely usable in mock mode before credentials arrive", () => {
    const readiness = getEmagReadiness(readEmagConfig({ EMAG_MODE: "mock" }));
    expect(readiness.canConnect).toBe(true);
    expect(readiness.canPublish).toBe(false);
    expect(readiness.missing).toEqual(["EMAG_USERNAME", "EMAG_PASSWORD"]);
  });

  it("allows publication only in credentialed live mode", () => {
    const readiness = getEmagReadiness(
      readEmagConfig({
        EMAG_MODE: "live",
        EMAG_USERNAME: "seller",
        EMAG_PASSWORD: "secret",
      }),
    );
    expect(readiness.canPublish).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  it("splits eMAG write payloads at the documented maximum of 50", () => {
    expect(chunk(Array.from({ length: 101 }, (_, index) => index), 50).map((batch) => batch.length)).toEqual([50, 50, 1]);
  });

  it("keeps all integration operations available in mock mode", async () => {
    const client = new MockEmagClient();
    expect((await client.listCategories()).ok).toBe(true);
    expect((await client.findByEans(["5941234123457"])).body.results).toHaveLength(1);
    expect(await client.updateOfferStock(42, [{ warehouse_id: 1, value: 3 }])).toMatchObject({ ok: true });
  });
});
