import { randomUUID } from "node:crypto";

export type EmagMode = "mock" | "live";
export type EmagMarketplace =
  | "EMAG_RO"
  | "EMAG_BG"
  | "EMAG_HU"
  | "FASHION_DAYS_RO"
  | "FASHION_DAYS_BG";
export type EmagRateLimitBucket = "orders" | "other" | "ean";

export const marketplaceApiUrls: Record<EmagMarketplace, string> = {
  EMAG_RO: "https://marketplace-api.emag.ro/api-3",
  EMAG_BG: "https://marketplace-api.emag.bg/api-3",
  EMAG_HU: "https://marketplace-api.emag.hu/api-3",
  FASHION_DAYS_RO: "https://marketplace-api.fashiondays.ro/api-3",
  FASHION_DAYS_BG: "https://marketplace-api.fashiondays.bg/api-3",
};

export type EmagConfig = {
  mode: EmagMode;
  marketplace?: EmagMarketplace;
  apiUrl: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export type EmagReadiness = {
  mode: EmagMode;
  credentialsConfigured: boolean;
  canConnect: boolean;
  canPublish: boolean;
  missing: string[];
};

export type EmagApiEnvelope<T = unknown> = {
  isError?: boolean;
  messages?: Array<string | Record<string, unknown>>;
  results?: T;
  [key: string]: unknown;
};

export type EmagApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  requestId: string;
  durationMs: number;
  body: EmagApiEnvelope<T>;
  uncertain: boolean;
};

export type EmagStockItem = { warehouse_id: number; value: number };
export type EmagHandlingTimeItem = { warehouse_id: number; value: number };
export type EmagCharacteristicInput = { id: number; value: string; tag?: string };

export type EmagProductOfferSave = {
  id: number;
  category_id?: number;
  vendor_category_id?: number;
  part_number_key?: string;
  source_language?: string;
  name?: string;
  part_number?: string;
  description?: string;
  brand?: string;
  force_images_download?: 0 | 1;
  images?: Array<{ display_type?: 0 | 1 | 2; url: string }>;
  images_overwrite?: 0 | 1;
  characteristics?: EmagCharacteristicInput[];
  family?: { id: number; name?: string; family_type_id?: number };
  url?: string;
  warranty?: number;
  ean?: string[];
  attachments?: Array<{ id?: number; url: string }>;
  status: 0 | 1 | 2;
  sale_price: string | number;
  recommended_price?: string | number;
  min_sale_price?: string | number;
  max_sale_price?: string | number;
  currency_type?: "EUR" | "PLN";
  stock: EmagStockItem[];
  handling_time: EmagHandlingTimeItem[];
  supply_lead_time?: 2 | 3 | 5 | 7 | 14 | 30 | 60 | 90 | 120;
  start_date?: string;
  vat_id: number;
  emag_club?: 0 | 1;
  safety_information?: string;
  manufacturer?: Array<{ name: string; address: string; email: string }>;
  eu_representative?: Array<{ name: string; address: string; email: string }>;
  green_tax?: string | number;
};

export type EmagOfferSave = Pick<EmagProductOfferSave, "id"> &
  Partial<Pick<EmagProductOfferSave,
    "sale_price" | "recommended_price" | "min_sale_price" | "max_sale_price" |
    "currency_type" | "stock" | "handling_time" | "vat_id" | "status">>;

export type EmagProductOfferReadFilter = {
  currentPage?: number;
  itemsPerPage?: number;
  id?: number;
  status?: 0 | 1;
  part_number?: string;
  part_number_key?: string;
  general_stock?: number;
  estimated_stock?: number;
  offer_validation_status?: 1 | 2;
  validation_status?: number;
  translation_validation_status?: number;
};

export interface EmagClient {
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; requestId: string }>;
  listCategories(filter?: Record<string, unknown>): Promise<EmagApiResult<Array<Record<string, unknown>>>>;
  listVatRates(): Promise<EmagApiResult<Array<Record<string, unknown>>>>;
  listHandlingTimes(): Promise<EmagApiResult<Array<Record<string, unknown>>>>;
  findByEans(eans: string[]): Promise<EmagApiResult<Array<Record<string, unknown>>>>;
  readProductOffers(filter: EmagProductOfferReadFilter): Promise<EmagApiResult<Array<Record<string, unknown>>>>;
  saveProductOffers(items: EmagProductOfferSave[]): Promise<Array<EmagApiResult>>;
  saveOffers(items: EmagOfferSave[]): Promise<Array<EmagApiResult>>;
  updateOfferStock(sellerProductId: number, stock: EmagStockItem[]): Promise<EmagApiResult>;
}

export function readEmagConfig(environment: NodeJS.ProcessEnv = process.env): EmagConfig {
  const mode = environment.EMAG_MODE === "live" ? "live" : "mock";
  const marketplace = (environment.EMAG_MARKETPLACE ?? "EMAG_RO") as EmagMarketplace;
  return {
    mode,
    marketplace,
    apiUrl: environment.EMAG_API_URL ?? marketplaceApiUrls[marketplace] ?? marketplaceApiUrls.EMAG_RO,
    username: environment.EMAG_USERNAME || undefined,
    password: environment.EMAG_PASSWORD || undefined,
    timeoutMs: Number(environment.EMAG_TIMEOUT_MS ?? 15_000),
    maxRetries: Number(environment.EMAG_MAX_RETRIES ?? 4),
  };
}

export function getEmagReadiness(config: EmagConfig): EmagReadiness {
  const missing: string[] = [];
  if (!config.username) missing.push("EMAG_USERNAME");
  if (!config.password) missing.push("EMAG_PASSWORD");
  const credentialsConfigured = missing.length === 0;
  return {
    mode: config.mode,
    credentialsConfigured,
    canConnect: config.mode === "mock" || credentialsConfigured,
    canPublish: config.mode === "live" && credentialsConfigured,
    missing,
  };
}

function mockResult<T>(results: T): EmagApiResult<T> {
  return {
    ok: true,
    status: 200,
    requestId: randomUUID(),
    durationMs: 1,
    body: { isError: false, results },
    uncertain: false,
  };
}

export class MockEmagClient implements EmagClient {
  async healthcheck() {
    return { ok: true, latencyMs: 1, requestId: randomUUID() };
  }
  async listCategories() {
    return mockResult([
      { id: 1001, name: "Demo / Casă și grădină", is_ean_mandatory: 1, is_warranty_mandatory: 0, characteristics: [] },
      { id: 1002, name: "Demo / Sport", is_ean_mandatory: 1, is_warranty_mandatory: 1, characteristics: [] },
    ]);
  }
  async listVatRates() {
    return mockResult([{ id: 1, name: "TVA standard", value: 21 }]);
  }
  async listHandlingTimes() {
    return mockResult([{ id: 1, name: "În aceeași zi", min_days: 0, max_days: 0 }]);
  }
  async findByEans(eans: string[]) {
    return mockResult(eans.map((ean) => ({ ean, products: [] })));
  }
  async readProductOffers(filter: EmagProductOfferReadFilter) {
    return mockResult([{ id: filter.id ?? 1, status: 1, validation_status: 9, general_stock: 0 }]);
  }
  async saveProductOffers(items: EmagProductOfferSave[]) {
    return chunk(items, 50).map((batch) => mockResult(batch.map((item) => ({ id: item.id, status: "accepted" }))));
  }
  async saveOffers(items: EmagOfferSave[]) {
    return chunk(items, 50).map((batch) => mockResult(batch.map((item) => ({ id: item.id, status: "accepted" }))));
  }
  async updateOfferStock(sellerProductId: number, stock: EmagStockItem[]) {
    return mockResult({ id: sellerProductId, stock });
  }
}

type BucketState = { nextAt: number; recentMinute: number[]; recentDay: number[] };

export class LiveEmagClient implements EmagClient {
  private readonly buckets: Record<EmagRateLimitBucket, BucketState> = {
    orders: { nextAt: 0, recentMinute: [], recentDay: [] },
    other: { nextAt: 0, recentMinute: [], recentDay: [] },
    ean: { nextAt: 0, recentMinute: [], recentDay: [] },
  };

  constructor(private readonly config: EmagConfig) {}

  async healthcheck() {
    const result = await this.listCategories({ currentPage: 1, itemsPerPage: 1 });
    return { ok: result.ok, latencyMs: result.durationMs, requestId: result.requestId };
  }
  listCategories(filter: Record<string, unknown> = { currentPage: 1 }) {
    return this.request<Array<Record<string, unknown>>>("POST", "/category/read", filter, "other");
  }
  listVatRates() {
    return this.request<Array<Record<string, unknown>>>("POST", "/vat/read", {}, "other");
  }
  listHandlingTimes() {
    return this.request<Array<Record<string, unknown>>>("POST", "/handling_time/read", {}, "other");
  }
  findByEans(eans: string[]) {
    if (eans.length < 1 || eans.length > 100) throw new Error("eMAG EAN lookup accepts 1 to 100 EANs");
    return this.request<Array<Record<string, unknown>>>("GET", "/documentation/find_by_eans", { "eans[]": eans }, "ean");
  }
  readProductOffers(filter: EmagProductOfferReadFilter) {
    return this.request<Array<Record<string, unknown>>>("POST", "/product_offer/read", filter, "other");
  }
  async saveProductOffers(items: EmagProductOfferSave[]) {
    return this.saveBatches("/product_offer/save", items);
  }
  async saveOffers(items: EmagOfferSave[]) {
    return this.saveBatches("/offer/save", items);
  }
  updateOfferStock(sellerProductId: number, stock: EmagStockItem[]) {
    if (!Number.isInteger(sellerProductId) || sellerProductId < 1) throw new Error("Invalid eMAG seller product id");
    return this.request("PATCH", `/offer_stock/${sellerProductId}`, { data: { stock } }, "other");
  }

  private async saveBatches(path: string, items: Array<EmagProductOfferSave | EmagOfferSave>) {
    if (items.length === 0) throw new Error("At least one eMAG item is required");
    const results: EmagApiResult[] = [];
    for (const batch of chunk(items, 50)) {
      results.push(await this.request("POST", path, { data: batch }, "other", true));
    }
    return results;
  }

  private async throttle(bucket: EmagRateLimitBucket) {
    const state = this.buckets[bucket];
    const now = Date.now();
    const interval = bucket === "orders" ? Math.ceil(1000 / 12) : bucket === "ean" ? 200 : Math.ceil(1000 / 3);
    state.recentMinute = state.recentMinute.filter((at) => at > now - 60_000);
    state.recentDay = state.recentDay.filter((at) => at > now - 86_400_000);
    let waitMs = Math.max(0, state.nextAt - now);
    if (bucket === "ean" && state.recentMinute.length >= 200) waitMs = Math.max(waitMs, state.recentMinute[0]! + 60_000 - now);
    if (bucket === "ean" && state.recentDay.length >= 5_000) waitMs = Math.max(waitMs, state.recentDay[0]! + 86_400_000 - now);
    if (waitMs > 0) await delay(waitMs);
    const sentAt = Date.now();
    state.nextAt = sentAt + interval;
    state.recentMinute.push(sentAt);
    state.recentDay.push(sentAt);
  }

  private async request<T = unknown>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    payload: Record<string, unknown>,
    bucket: EmagRateLimitBucket,
    writeOperation = false,
  ): Promise<EmagApiResult<T>> {
    if (!this.config.username || !this.config.password) throw new Error("eMAG live mode requires server-side credentials");
    const requestId = randomUUID();
    const startedAt = performance.now();
    const authorization = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
    const maxRetries = Math.max(0, this.config.maxRetries ?? 4);
    let response: Response | undefined;
    let body: EmagApiEnvelope<T> = {};

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      await this.throttle(bucket);
      const url = new URL(`${this.config.apiUrl.replace(/\/$/, "")}${path}`);
      if (method === "GET") {
        for (const [key, raw] of Object.entries(payload)) {
          for (const value of Array.isArray(raw) ? raw : [raw]) url.searchParams.append(key, String(value));
        }
      }
      try {
        response = await fetch(url, {
          method,
          headers: {
            Authorization: `Basic ${authorization}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "PrettyLittleManager/0.1",
            "X-Request-ID": requestId,
          },
          ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
        });
        body = await response.json().catch(() => ({} as EmagApiEnvelope<T>));
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) {
        if (attempt >= maxRetries) throw error;
      }
      if (attempt < maxRetries) {
        const retryAfter = Number(response?.headers.get("retry-after") ?? 0) * 1000;
        const backoff = Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await delay(Math.max(retryAfter, backoff));
      }
    }

    const status = response?.status ?? 0;
    const ok = Boolean(response?.ok) && body.isError !== true;
    return {
      ok,
      status,
      requestId,
      durationMs: Math.round(performance.now() - startedAt),
      body,
      uncertain: writeOperation && Boolean(response?.ok) && body.isError === true,
    };
  }
}

export function createEmagClient(config: EmagConfig): EmagClient {
  return config.mode === "live" ? new LiveEmagClient(config) : new MockEmagClient();
}

export function chunk<T>(items: T[], maximumSize: number): T[][] {
  if (!Number.isInteger(maximumSize) || maximumSize < 1) throw new Error("Chunk size must be positive");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += maximumSize) batches.push(items.slice(index, index + maximumSize));
  return batches;
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
