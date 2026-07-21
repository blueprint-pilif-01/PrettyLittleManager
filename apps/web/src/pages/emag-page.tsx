import {
  ArrowsClockwise,
  Barcode,
  Key,
  Plus,
  Storefront,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "../components/page-header";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { api, errorMessage } from "../lib/api";

type Account = {
  id: string;
  name: string;
  isActive: boolean;
  configuration: { marketplace: string; mode: "mock" | "live" };
  readiness: {
    canConnect: boolean;
    canPublish: boolean;
    credentialsConfigured: boolean;
    missing: string[];
  };
  _count: { listings: number; emagCategories: number };
};
type EmagCategory = {
  externalId: number;
  name: string;
  isEanMandatory: boolean;
  isWarrantyMandatory: boolean;
  _count: { characteristics: number };
};
type CategoryDetail = EmagCategory & {
  characteristics: Array<{
    externalId: number;
    name: string;
    isRequired: boolean;
    presentationGroup: string;
    values: Array<{ value: string; displayValue?: string }>;
  }>;
  familyTypes: Array<{ externalId: number; name: string }>;
};
type ProductPage = {
  items: Array<{
    id: string;
    publicName: string;
    variants: Array<{
      id: string;
      sku: string;
      gtin?: string;
      basePrice?: string;
    }>;
  }>;
};
type ValidationIssue = { field: string; code: string; message: string };
type Listing = {
  id: string;
  status: string;
  synchronizationStatus: string;
  lastError?: unknown;
  validation?: { valid: boolean; issues: ValidationIssue[] };
  product: { publicName: string };
  variant: { sku: string; gtin?: string };
  emagData: {
    publicationPath: string;
    sellerProductId: number;
    salePrice?: string;
  };
};
type VatRate = { externalId: number; name: string; rate?: string };
type HandlingTime = {
  externalId: number;
  name: string;
  minimumDays?: number;
  maximumDays?: number;
};
type EnqueuedJob = { job: { id: string }; deduplicated: boolean };
type BackgroundJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  result?: { matches?: Array<Record<string, unknown>> } | null;
  error?: { message?: string } | null;
};

type ListingOperation = "publish" | "price" | "stock" | "status" | "reconcile";
const listingOperations: Array<{ value: ListingOperation; label: string }> = [
  { value: "publish", label: "Publish product + offer" },
  { value: "price", label: "Update price only" },
  { value: "stock", label: "Update stock only" },
  { value: "status", label: "Update status only" },
  { value: "reconcile", label: "Reconcile with eMAG" },
];

function describeError(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    try {
      return JSON.stringify(value).slice(0, 300);
    } catch {
      return "Unreadable error payload";
    }
  }
  return String(value);
}

function matchText(match: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = match[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return "—";
}

export function EmagPage() {
  const client = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState(0);
  const [failure, setFailure] = useState("");
  const [eanInput, setEanInput] = useState("");
  const [eanJobId, setEanJobId] = useState("");
  const [rowOperation, setRowOperation] = useState<
    Record<string, ListingOperation>
  >({});
  const accounts = useQuery({
    queryKey: ["emag-accounts"],
    queryFn: () => api<Account[]>("/integrations/emag/accounts"),
  });
  const selected =
    accounts.data?.find((item) => item.id === accountId) ?? accounts.data?.[0];
  const categories = useQuery({
    queryKey: ["emag-categories", selected?.id],
    queryFn: () =>
      api<EmagCategory[]>(
        `/integrations/emag/accounts/${selected!.id}/categories`,
      ),
    enabled: Boolean(selected),
  });
  const category = useQuery({
    queryKey: ["emag-category", selected?.id, categoryId],
    queryFn: () =>
      api<CategoryDetail>(
        `/integrations/emag/accounts/${selected!.id}/categories/${categoryId}`,
      ),
    enabled: Boolean(selected && categoryId),
  });
  const vatRates = useQuery({
    queryKey: ["emag-vat-rates", selected?.id],
    queryFn: () =>
      api<VatRate[]>(`/integrations/emag/accounts/${selected!.id}/vat-rates`),
    enabled: Boolean(selected),
  });
  const handlingTimes = useQuery({
    queryKey: ["emag-handling-times", selected?.id],
    queryFn: () =>
      api<HandlingTime[]>(
        `/integrations/emag/accounts/${selected!.id}/handling-times`,
      ),
    enabled: Boolean(selected),
  });
  const products = useQuery({
    queryKey: ["products-for-emag"],
    queryFn: () => api<ProductPage>("/products?limit=100"),
    enabled: Boolean(selected),
  });
  const listings = useQuery({
    queryKey: ["emag-listings", selected?.id],
    queryFn: () =>
      api<Listing[]>(`/integrations/emag/accounts/${selected!.id}/listings`),
    enabled: Boolean(selected),
    refetchInterval: 5_000,
  });
  const eanJob = useQuery({
    queryKey: ["emag-ean-job", eanJobId],
    queryFn: () => api<BackgroundJob>(`/sync-jobs/${eanJobId}`),
    enabled: Boolean(eanJobId),
    refetchInterval: (query) =>
      query.state.data &&
      ["QUEUED", "RUNNING"].includes(query.state.data.status)
        ? 2_000
        : false,
  });
  const variants = useMemo(
    () =>
      products.data?.items.flatMap((product) =>
        product.variants.map((variant) => ({
          ...variant,
          productId: product.id,
          productName: product.publicName,
        })),
      ) ?? [],
    [products.data],
  );
  const create = useMutation({
    mutationFn: (input: unknown) =>
      api<Account>("/integrations/emag/accounts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (item) => {
      setAccountId(item.id);
      await client.invalidateQueries({ queryKey: ["emag-accounts"] });
    },
  });
  const sync = useMutation({
    mutationFn: () =>
      api(`/integrations/emag/accounts/${selected!.id}/sync-metadata`, {
        method: "POST",
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["emag-categories", selected?.id] }),
  });
  const save = useMutation({
    mutationFn: (input: unknown) =>
      api(`/integrations/emag/accounts/${selected!.id}/listings`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["emag-listings", selected?.id] }),
  });
  const operation = useMutation({
    mutationFn: (input: { listingIds: string[]; operation: string }) =>
      api(`/integrations/emag/accounts/${selected!.id}/operations`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["emag-listings", selected?.id] }),
  });
  const eanLookup = useMutation({
    mutationFn: (eans: string[]) =>
      api<EnqueuedJob>(`/integrations/emag/accounts/${selected!.id}/ean-lookup`, {
        method: "POST",
        body: JSON.stringify({ eans }),
      }),
    onSuccess: (response) => setEanJobId(response.job.id),
  });
  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const mode = String(data.get("mode"));
    create.mutate({
      name: String(data.get("name")),
      marketplace: "EMAG_RO",
      mode,
      isActive: true,
      ...(mode === "live"
        ? {
            username: String(data.get("username")),
            password: String(data.get("password")),
          }
        : {}),
    });
  }
  function submitEanLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const eans = eanInput
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!eans.length) return;
    eanLookup.mutate(eans);
  }
  function saveListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure("");
    const data = new FormData(event.currentTarget);
    const variant = variants.find((item) => item.id === data.get("variantId"));
    if (!variant || !categoryId) return;
    const mappings =
      category.data?.characteristics
        .filter((item) =>
          String(data.get(`characteristic_${item.externalId}`)).trim(),
        )
        .map((item) => ({
          characteristicId: item.externalId,
          value: String(data.get(`characteristic_${item.externalId}`)),
        })) ?? [];
    save.mutate(
      {
        productId: variant.productId,
        variantId: variant.id,
        externalCategoryId: categoryId,
        publicationPath: String(data.get("publicationPath")),
        sellerProductId: Number(data.get("sellerProductId")),
        partNumberKey: String(data.get("partNumberKey")) || undefined,
        salePrice: String(data.get("salePrice")),
        recommendedPrice: String(data.get("recommendedPrice")) || undefined,
        minimumSalePrice: String(data.get("minimumSalePrice")) || undefined,
        maximumSalePrice: String(data.get("maximumSalePrice")) || undefined,
        vatId: Number(data.get("vatId")),
        handlingTimeId: Number(data.get("handlingTimeId")) || undefined,
        warrantyMonths: Number(data.get("warrantyMonths")) || undefined,
        stockBuffer: Number(data.get("stockBuffer") || 0),
        familyTypeId: Number(data.get("familyTypeId")) || undefined,
        status: "DRAFT",
        characteristicMappings: mappings,
        emagGenius: true,
        offerStatus: 1,
      },
      { onError: (error) => setFailure(errorMessage(error)) },
    );
  }
  const eanMatches = eanJob.data?.result?.matches ?? [];
  const eanPending =
    Boolean(eanJobId) &&
    (eanJob.isLoading ||
      ["QUEUED", "RUNNING"].includes(eanJob.data?.status ?? ""));
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Channels"
        title="eMAG Romania"
        description="Configure the seller account, synchronize marketplace metadata and prepare validated listings."
        actions={
          selected && (
            <Button
              variant="secondary"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
            >
              <ArrowsClockwise size={15} />
              {sync.isPending ? "Queuing…" : "Sync metadata"}
            </Button>
          )
        }
      />
      <div className="integration-status">
        <span className="integration-mark">e</span>
        <div>
          <div className="integration-title">
            <h2>{selected?.name ?? "No eMAG account"}</h2>
            <Badge
              tone={
                selected?.configuration.mode === "live" ? "success" : "info"
              }
            >
              {selected
                ? selected.configuration.mode === "live"
                  ? "Live API"
                  : "Test connection"
                : "Not configured"}
            </Badge>
          </div>
          <p>
            {selected
              ? `${selected._count.emagCategories} categories · ${selected._count.listings} listings`
              : "Use a test connection to prepare the workflow, then add the live credentials received from eMAG."}
          </p>
          {selected?.configuration.mode === "live" &&
            !selected.readiness.canPublish && (
              <p className="field-help">
                Live publishing is blocked until credentials are stored
                {selected.readiness.missing.length
                  ? ` (missing: ${selected.readiness.missing.join(", ")})`
                  : ""}
                , the server IP is whitelisted by eMAG, and API access is
                enabled for the seller account.
              </p>
            )}
        </div>
        {selected && (
          <Badge tone={selected.readiness.canConnect ? "success" : "warning"}>
            {selected.configuration.mode === "live"
              ? selected.readiness.canConnect
                ? "Connected"
                : "Needs credentials"
              : "Testing only"}
          </Badge>
        )}
      </div>
      <div className="channel-grid">
        <Card className="panel">
          <div className="panel-header">
            <div>
              <h2>Accounts</h2>
              <p>Credentials remain encrypted and server-only.</p>
            </div>
            <Storefront size={18} aria-hidden="true" />
          </div>
          <div className="connection-list">
            {accounts.data?.map((account) => (
              <button
                type="button"
                className={
                  selected?.id === account.id
                    ? "connection-row selected"
                    : "connection-row"
                }
                key={account.id}
                onClick={() => setAccountId(account.id)}
              >
                <span>
                  <strong>{account.name}</strong>
                  <small>{account.configuration.marketplace}</small>
                </span>
                <Badge
                  tone={
                    account.configuration.mode === "live" ? "success" : "info"
                  }
                >
                  {account.configuration.mode === "live"
                    ? "Live API"
                    : "Test connection"}
                </Badge>
              </button>
            ))}
          </div>
          <form
            className="form-stack compact-form bordered-form"
            onSubmit={createAccount}
          >
            <h3>Add account</h3>
            <div className="field">
              <label htmlFor="emagAccountName">Name</label>
              <Input
                id="emagAccountName"
                name="name"
                defaultValue="eMAG Romania"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="emagAccountMode">Connection type</label>
              <select
                id="emagAccountMode"
                name="mode"
                className="select-control"
              >
                <option value="mock">Test connection (no credentials)</option>
                <option value="live">Live eMAG API</option>
              </select>
              <p className="field-help">
                Testing lets you prepare mappings and validation without sending
                data to eMAG.
              </p>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="emagAccountUsername">Username (live API)</label>
                <Input id="emagAccountUsername" name="username" />
              </div>
              <div className="field">
                <label htmlFor="emagAccountPassword">Password (live API)</label>
                <Input
                  id="emagAccountPassword"
                  name="password"
                  type="password"
                />
              </div>
            </div>
            {create.error && (
              <p className="form-alert">{errorMessage(create.error)}</p>
            )}
            <Button size="sm" type="submit" disabled={create.isPending}>
              <Plus size={14} /> Add account
            </Button>
          </form>
        </Card>
        <Card className="panel">
          <div className="panel-header">
            <div>
              <h2>eMAG draft</h2>
              <p>
                Publish each sellable product separately; shared family
                metadata reconnects sizes and colors.
              </p>
            </div>
            <Key size={18} aria-hidden="true" />
          </div>
          {selected ? (
            <form className="form-stack compact-form" onSubmit={saveListing}>
              <div className="field">
                <label htmlFor="emagDraftVariant">Sellable product</label>
                <select
                  id="emagDraftVariant"
                  name="variantId"
                  className="select-control"
                  required
                >
                  <option value="">Choose variant</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.sku} · {variant.productName}
                      {variant.gtin ? ` · ${variant.gtin}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="emagDraftCategory">eMAG category</label>
                <select
                  id="emagDraftCategory"
                  className="select-control"
                  value={categoryId || ""}
                  onChange={(event) =>
                    setCategoryId(Number(event.target.value))
                  }
                  required
                >
                  <option value="">Choose synced category</option>
                  {categories.data?.map((item) => (
                    <option key={item.externalId} value={item.externalId}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              {category.data?.familyTypes.length ? (
                <div className="field">
                  <label htmlFor="emagDraftFamilyType">eMAG family type</label>
                  <select
                    id="emagDraftFamilyType"
                    name="familyTypeId"
                    className="select-control"
                    defaultValue=""
                  >
                    <option value="">Standalone product / no family</option>
                    {category.data.familyTypes.map((familyType) => (
                      <option
                        key={familyType.externalId}
                        value={familyType.externalId}
                      >
                        {familyType.name}
                      </option>
                    ))}
                  </select>
                  <p className="field-help">
                    Required for family products. Choose the type matching the
                    family axes, for example Size (visible) – Color (visible).
                  </p>
                </div>
              ) : null}
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="emagDraftPath">Publication path</label>
                  <select
                    id="emagDraftPath"
                    name="publicationPath"
                    className="select-control"
                  >
                    <option value="NEW_PRODUCT">New product</option>
                    <option value="ATTACH_EXISTING">Attach existing</option>
                    <option value="UPDATE_OFFER">Update offer</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="emagDraftSellerId">Seller numeric ID</label>
                  <Input
                    id="emagDraftSellerId"
                    name="sellerProductId"
                    type="number"
                    min={1}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="emagDraftPnk">part_number_key (attachment)</label>
                <Input id="emagDraftPnk" name="partNumberKey" />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="emagDraftSalePrice">Sale price net</label>
                  <Input
                    id="emagDraftSalePrice"
                    name="salePrice"
                    required
                    defaultValue="0.0000"
                  />
                </div>
                <div className="field">
                  <label htmlFor="emagDraftRecommended">Recommended net</label>
                  <Input id="emagDraftRecommended" name="recommendedPrice" />
                </div>
                <div className="field">
                  <label htmlFor="emagDraftMinimum">Minimum net</label>
                  <Input id="emagDraftMinimum" name="minimumSalePrice" />
                </div>
                <div className="field">
                  <label htmlFor="emagDraftMaximum">Maximum net</label>
                  <Input id="emagDraftMaximum" name="maximumSalePrice" />
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="emagDraftVat">VAT ID</label>
                  <Input
                    id="emagDraftVat"
                    name="vatId"
                    type="number"
                    min={1}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="emagDraftHandling">Handling time ID</label>
                  <Input
                    id="emagDraftHandling"
                    name="handlingTimeId"
                    type="number"
                    min={1}
                  />
                </div>
                <div className="field">
                  <label htmlFor="emagDraftWarranty">Warranty months</label>
                  <Input
                    id="emagDraftWarranty"
                    name="warrantyMonths"
                    type="number"
                    min={0}
                  />
                </div>
                <div className="field">
                  <label htmlFor="emagDraftBuffer">Stock buffer</label>
                  <Input
                    id="emagDraftBuffer"
                    name="stockBuffer"
                    type="number"
                    min={0}
                    defaultValue={0}
                  />
                </div>
              </div>
              {category.data?.characteristics.map((item) => (
                <div className="field" key={item.externalId}>
                  <label htmlFor={`characteristic_${item.externalId}`}>
                    {item.name}
                    {item.isRequired ? " *" : ""}
                  </label>
                  {item.values.length ? (
                    <select
                      id={`characteristic_${item.externalId}`}
                      name={`characteristic_${item.externalId}`}
                      className="select-control"
                      required={item.isRequired}
                    >
                      <option value="">Choose value</option>
                      {item.values.map((value) => (
                        <option key={value.value} value={value.value}>
                          {value.displayValue ?? value.value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`characteristic_${item.externalId}`}
                      name={`characteristic_${item.externalId}`}
                      required={item.isRequired}
                    />
                  )}
                </div>
              ))}
              {failure && <p className="form-alert">{failure}</p>}
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Validating…" : "Save validated draft"}
              </Button>
            </form>
          ) : (
            <p className="text-muted">Configure an account first.</p>
          )}
        </Card>
      </div>
      {selected && (
        <Card className="panel">
          <div className="panel-header">
            <div>
              <h2>EAN lookup</h2>
              <p>
                Check whether products already exist in the eMAG catalog before
                choosing between a new product and an offer attachment.
              </p>
            </div>
            <Barcode size={18} aria-hidden="true" />
          </div>
          <form className="form-stack compact-form" onSubmit={submitEanLookup}>
            <div className="field">
              <label htmlFor="emagEanInput">EAN / GTIN codes</label>
              <Input
                id="emagEanInput"
                value={eanInput}
                onChange={(event) => setEanInput(event.target.value)}
                placeholder="5941234123457, 5941234123464"
              />
              <p className="field-help">
                Separate up to 100 codes with commas or spaces. The lookup runs
                in the background and results appear below.
              </p>
            </div>
            {eanLookup.error && (
              <p className="form-alert">{errorMessage(eanLookup.error)}</p>
            )}
            <div>
              <Button
                size="sm"
                type="submit"
                disabled={eanLookup.isPending || eanPending}
              >
                {eanLookup.isPending || eanPending
                  ? "Looking up…"
                  : "Check EANs on eMAG"}
              </Button>
            </div>
          </form>
          {eanJob.data?.status === "FAILED" && (
            <p className="form-alert">
              EAN lookup failed: {describeError(eanJob.data.error)}
            </p>
          )}
          {eanJob.data?.status === "SUCCEEDED" && (
            eanMatches.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>EAN</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>part_number_key</TableHead>
                    <TableHead>Offer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eanMatches.map((match, index) => (
                    <TableRow key={index}>
                      <TableCell>{matchText(match, ["ean", "eans"])}</TableCell>
                      <TableCell>
                        {matchText(match, ["product_name", "name"])}
                      </TableCell>
                      <TableCell>
                        {matchText(match, ["brand_name", "brand"])}
                      </TableCell>
                      <TableCell>
                        {matchText(match, ["part_number_key"])}
                      </TableCell>
                      <TableCell>
                        {match.allow_to_add_offer === undefined ? (
                          <span className="text-muted">
                            No catalog match — publish as new product
                          </span>
                        ) : match.allow_to_add_offer ? (
                          <Badge tone="success">Attachment allowed</Badge>
                        ) : (
                          <Badge tone="warning">Attachment not allowed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted">
                No matches returned. The EANs are not in the eMAG catalog yet,
                so publish them as new products.
              </p>
            )
          )}
        </Card>
      )}
      {selected && (
        <Card className="panel">
          <div className="panel-header">
            <div>
              <h2>Synced commercial metadata</h2>
              <p>Use these platform IDs when configuring a draft above.</p>
            </div>
            <Badge tone={vatRates.data?.length ? "success" : "warning"}>
              {vatRates.data?.length ?? 0} VAT rates
            </Badge>
          </div>
          <div className="metadata-reference">
            <div>
              <strong>VAT IDs</strong>
              <div className="tag-row">
                {vatRates.data?.map((rate) => (
                  <span key={rate.externalId}>
                    {rate.externalId} · {rate.name}
                    {rate.rate ? ` (${rate.rate}%)` : ""}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <strong>Handling time IDs</strong>
              <div className="tag-row">
                {handlingTimes.data?.map((time) => (
                  <span key={time.externalId}>
                    {time.externalId} · {time.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card className="data-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead>Seller ID</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.data?.map((listing) => {
              const issues = listing.validation?.issues ?? [];
              const remoteError = describeError(listing.lastError);
              const selectedOperation = rowOperation[listing.id] ?? "publish";
              return (
                <TableRow key={listing.id}>
                  <TableCell>
                    <strong>{listing.product.publicName}</strong>
                    <small className="block text-muted">
                      {listing.variant.sku}
                    </small>
                  </TableCell>
                  <TableCell>{listing.emagData.publicationPath}</TableCell>
                  <TableCell>
                    <Badge
                      tone={
                        listing.status === "PUBLISHED"
                          ? "success"
                          : listing.status.includes("FAILED")
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {listing.status}
                    </Badge>
                    {issues.length > 0 && (
                      <small className="block text-danger" title={issues
                        .map((issue) => `${issue.field}: ${issue.message}`)
                        .join("\n")}>
                        {issues.length} validation issue
                        {issues.length > 1 ? "s" : ""}: {issues[0]?.message}
                        {issues.length > 1 ? "…" : ""}
                      </small>
                    )}
                    {remoteError && issues.length === 0 && (
                      <small className="block text-danger" title={remoteError}>
                        {remoteError.slice(0, 120)}
                        {remoteError.length > 120 ? "…" : ""}
                      </small>
                    )}
                  </TableCell>
                  <TableCell>{listing.synchronizationStatus}</TableCell>
                  <TableCell>{listing.emagData.sellerProductId}</TableCell>
                  <TableCell>
                    <div className="table-actions">
                      <select
                        className="select-control compact-select"
                        aria-label={`Operation for ${listing.variant.sku}`}
                        value={selectedOperation}
                        onChange={(event) =>
                          setRowOperation((value) => ({
                            ...value,
                            [listing.id]: event.target
                              .value as ListingOperation,
                          }))
                        }
                      >
                        {listingOperations.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={operation.isPending}
                        onClick={() =>
                          operation.mutate({
                            listingIds: [listing.id],
                            operation: selectedOperation,
                          })
                        }
                      >
                        Run
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {operation.error && (
          <p className="form-alert">{errorMessage(operation.error)}</p>
        )}
        {listings.data && listings.data.length === 0 && (
          <div className="empty-state">
            <Storefront size={28} aria-hidden="true" />
            <h2>No eMAG listings yet</h2>
            <p>
              Save a validated draft above; it appears here with its
              publication and synchronization status.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
