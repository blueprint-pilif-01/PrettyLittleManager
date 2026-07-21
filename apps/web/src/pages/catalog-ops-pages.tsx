import {
  Barcode,
  DownloadSimple,
  FileArrowUp,
  Play,
  Plus,
  Repeat,
  SlidersHorizontal,
  Stack,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
import { api, downloadApiFile, errorMessage } from "../lib/api";

type ImportJob = {
  id: string;
  status: string;
  originalFileName: string;
  format: string;
  sheetName?: string;
  headerRow: number;
  mappingSnapshot: any[];
  rowCount: number;
  successfulRows: number;
  failedRows: number;
  validationSummary?: any;
  reportUrl?: string;
};
export function ImportsPage() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<ImportJob>();
  const [failure, setFailure] = useState("");
  const jobs = useQuery({
    queryKey: ["imports"],
    queryFn: () => api<ImportJob[]>("/imports"),
    refetchInterval: 5_000,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api<ImportJob>("/imports/upload", { method: "POST", body });
    },
    onSuccess: (job) => {
      setSelected(job);
      void client.invalidateQueries({ queryKey: ["imports"] });
    },
  });
  async function prepare() {
    if (!selected) return;
    setFailure("");
    try {
      const configured = await api<ImportJob>(
        `/imports/${selected.id}/configuration`,
        {
          method: "PUT",
          body: JSON.stringify({
            sheetName: selected.sheetName,
            headerRow: selected.headerRow,
            mappings: selected.mappingSnapshot,
            defaults: {},
          }),
        },
      );
      const validated = await api<ImportJob>(
        `/imports/${selected.id}/validate`,
        { method: "POST" },
      );
      setSelected({ ...configured, ...validated });
      await client.invalidateQueries({ queryKey: ["imports"] });
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }
  async function execute() {
    if (!selected) return;
    setFailure("");
    try {
      await api(`/imports/${selected.id}/execute`, {
        method: "POST",
        body: JSON.stringify({ confirm: true, mode: "UPSERT_BY_SKU" }),
      });
      await client.invalidateQueries({ queryKey: ["imports"] });
      setSelected(undefined);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Imports"
        description="Upload, preview, map, validate, then execute CSV/XLSX product changes on the background import queue."
      />
      <Card className="panel upload-panel">
        <FileArrowUp size={30} weight="duotone" />
        <div>
          <h2>Upload spreadsheet</h2>
          <p>CSV, XLS, or XLSX · maximum 25 MB and 50,000 rows.</p>
        </div>
        <label className="button-file">
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
          {upload.isPending ? "Inspecting…" : "Choose file"}
        </label>
      </Card>
      {selected && (
        <Card className="panel">
          <div className="panel-header">
            <div>
              <h2>{selected.originalFileName}</h2>
              <p>
                {selected.rowCount} rows · {selected.sheetName}
              </p>
            </div>
            <Badge tone={selected.status === "VALIDATED" ? "success" : "info"}>
              {selected.status}
            </Badge>
          </div>
          <div className="mapping-preview">
            {selected.mappingSnapshot.map((mapping: any) => (
              <span key={mapping.sourceColumn}>
                <code>{mapping.sourceColumn}</code> → {mapping.destinationField}
              </span>
            ))}
          </div>
          {failure && <p className="form-alert">{failure}</p>}
          <div className="page-actions">
            {selected.status === "UPLOADED" && (
              <Button onClick={() => void prepare()}>
                Configure and validate
              </Button>
            )}
            {selected.status === "VALIDATED" && (
              <Button onClick={() => void execute()}>
                <Play size={15} /> Queue import
              </Button>
            )}
          </div>
        </Card>
      )}
      <Card className="data-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Successful</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Report</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.data?.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-semibold">
                  {job.originalFileName}
                </TableCell>
                <TableCell>
                  <Badge
                    tone={
                      job.status.includes("FAILED")
                        ? "danger"
                        : job.status.includes("SUCCEEDED")
                          ? "success"
                          : "neutral"
                    }
                  >
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell>{job.rowCount}</TableCell>
                <TableCell>{job.successfulRows}</TableCell>
                <TableCell>{job.failedRows}</TableCell>
                <TableCell>
                  {job.reportUrl && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void downloadApiFile(
                          `/imports/${job.id}/report`,
                          `import-${job.id}-report.csv`,
                        )
                      }
                    >
                      Download
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

type ExportTemplate = {
  id: string;
  name: string;
  format: string;
  description?: string;
};
type ExportJob = {
  id: string;
  status: string;
  format: string;
  rowCount: number;
  outputUrl?: string;
  createdAt: string;
  exportTemplate?: { name: string };
};
export function ExportsPage() {
  const client = useQueryClient();
  const templates = useQuery({
    queryKey: ["export-templates"],
    queryFn: () => api<ExportTemplate[]>("/export-templates"),
  });
  const jobs = useQuery({
    queryKey: ["exports"],
    queryFn: () => api<ExportJob[]>("/exports"),
    refetchInterval: 5_000,
  });
  const preset = useMutation({
    mutationFn: () => api("/export-templates/emag-preset", { method: "POST" }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["export-templates"] }),
  });
  const run = useMutation({
    mutationFn: (templateId: string) =>
      api("/exports", {
        method: "POST",
        body: JSON.stringify({ templateId, filters: {} }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["exports"] }),
  });
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Exports"
        description="Reusable channel-ready files are generated in private object storage by a background worker."
        actions={
          <Button onClick={() => preset.mutate()} disabled={preset.isPending}>
            <Plus size={15} /> Install eMAG preset
          </Button>
        }
      />
      <div className="card-grid">
        {templates.data?.map((template) => (
          <Card className="panel" key={template.id}>
            <div className="panel-header">
              <div>
                <h2>{template.name}</h2>
                <p>{template.description ?? "Reusable export mapping"}</p>
              </div>
              <Badge tone="info">{template.format}</Badge>
            </div>
            <Button
              size="sm"
              onClick={() => run.mutate(template.id)}
              disabled={run.isPending}
            >
              <Play size={14} /> Generate
            </Button>
          </Card>
        ))}
      </div>
      <Card className="data-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.data?.map((job) => (
              <TableRow key={job.id}>
                <TableCell>{job.exportTemplate?.name ?? "Export"}</TableCell>
                <TableCell>
                  <Badge
                    tone={
                      job.status === "SUCCEEDED"
                        ? "success"
                        : job.status === "FAILED"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell>{job.format}</TableCell>
                <TableCell>{job.rowCount}</TableCell>
                <TableCell>
                  {new Date(job.createdAt).toLocaleString("ro-RO")}
                </TableCell>
                <TableCell>
                  {job.status === "SUCCEEDED" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void downloadApiFile(
                          `/exports/${job.id}/download`,
                          `products-${job.id}.${job.format.toLowerCase()}`,
                        )
                      }
                    >
                      <DownloadSimple size={14} /> Download
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

type BackgroundJob = {
  id: string;
  type: string;
  queueName: string;
  status: string;
  progress: number;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  error?: { message?: string };
};
export function SynchronizationPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["sync-jobs"],
    queryFn: () => api<{ data: BackgroundJob[] }>("/sync-jobs?limit=100"),
    refetchInterval: 3_000,
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      api(`/sync-jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["sync-jobs"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/sync-jobs/${id}/cancel`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["sync-jobs"] }),
  });
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Channels"
        title="Synchronization"
        description="Durable jobs, attempt counts, progress, retry state, and dead-letter failures."
        actions={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            <Repeat size={15} /> Refresh
          </Button>
        }
      />
      {(retry.error || cancel.error) && (
        <p className="form-alert">
          {errorMessage(retry.error ?? cancel.error)}
        </p>
      )}
      <Card className="data-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operation</TableHead>
              <TableHead>Queue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Error</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data?.data.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <strong>{job.type}</strong>
                  <small className="block text-muted">
                    {new Date(job.createdAt).toLocaleString("ro-RO")}
                  </small>
                </TableCell>
                <TableCell>{job.queueName}</TableCell>
                <TableCell>
                  <Badge
                    tone={
                      job.status === "SUCCEEDED"
                        ? "success"
                        : job.status === "FAILED"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell>{job.progress}%</TableCell>
                <TableCell>
                  {job.attempt}/{job.maxAttempts}
                </TableCell>
                <TableCell className="text-danger">
                  {job.error?.message ?? "No error"}
                </TableCell>
                <TableCell>
                  <div className="table-actions">
                    {["QUEUED", "RUNNING"].includes(job.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancel.mutate(job.id)}
                        disabled={cancel.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                    {["FAILED", "PARTIALLY_SUCCEEDED", "CANCELLED"].includes(
                      job.status,
                    ) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => retry.mutate(job.id)}
                        disabled={retry.isPending}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {query.data?.data.length === 0 && (
          <div className="inline-empty compact">
            <span>No synchronization jobs yet.</span>
          </div>
        )}
      </Card>
    </div>
  );
}

type Attribute = {
  id: string;
  key: string;
  displayName: string;
  dataType: string;
  scope: string;
  isRequired: boolean;
  _count?: { productValues: number; variantValues: number };
};
export function AttributesPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["attributes"],
    queryFn: () => api<Attribute[]>("/attributes"),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/categories"),
  });
  const create = useMutation({
    mutationFn: (input: unknown) =>
      api("/attributes", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["attributes"] }),
  });
  const assign = useMutation({
    mutationFn: ({
      categoryId,
      input,
    }: {
      categoryId: string;
      input: unknown;
    }) =>
      api(`/categories/${categoryId}/attributes`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      key: String(data.get("key")),
      displayName: String(data.get("displayName")),
      dataType: String(data.get("dataType")),
      scope: String(data.get("scope")),
      isRequired: false,
      isSearchable: false,
      isFilterable: false,
      isComparable: false,
      isInheritable: true,
      displayOrder: 0,
      visibility: "INTERNAL",
      options: [],
    });
  }
  function assignCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    assign.mutate({
      categoryId: String(data.get("categoryId")),
      input: {
        attributeDefinitionId: String(data.get("attributeDefinitionId")),
        isRequiredOverride: data.get("required") === "on",
        displayOrder: Number(data.get("displayOrder") || 0),
      },
    });
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Catalog"
        title="Attributes"
        description="Typed reusable fields for products and variants."
      />
      <Card className="panel">
        <div className="panel-header">
          <div>
            <h2>Category template</h2>
            <p>
              Attach an attribute to an internal category and optionally require
              it.
            </p>
          </div>
        </div>
        <form
          className="inline-form attribute-assignment"
          onSubmit={assignCategory}
        >
          <div className="field">
            <label>Category</label>
            <select className="select-control" name="categoryId" required>
              <option value="">Choose category</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Attribute</label>
            <select
              className="select-control"
              name="attributeDefinitionId"
              required
            >
              <option value="">Choose attribute</option>
              {query.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Display order</label>
            <Input name="displayOrder" type="number" min={0} defaultValue={0} />
          </div>
          <label className="inline-check assignment-check">
            <input type="checkbox" name="required" /> Required
          </label>
          <Button type="submit" disabled={assign.isPending}>
            Assign
          </Button>
        </form>
        {assign.error && (
          <p className="form-alert">{errorMessage(assign.error)}</p>
        )}
        {assign.isSuccess && (
          <p className="success-alert">Category template updated.</p>
        )}
      </Card>
      <div className="two-column">
        <Card className="panel">
          <div className="panel-header">
            <div>
              <h2>New attribute</h2>
              <p>Use a stable machine key.</p>
            </div>
            <SlidersHorizontal size={18} />
          </div>
          <form className="form-stack compact-form" onSubmit={submit}>
            <div className="field">
              <label>Key</label>
              <Input name="key" pattern="[a-z][a-z0-9_]*" required />
            </div>
            <div className="field">
              <label>Display name</label>
              <Input name="displayName" required />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Type</label>
                <select className="select-control" name="dataType">
                  <option>SHORT_TEXT</option>
                  <option>LONG_TEXT</option>
                  <option>DECIMAL</option>
                  <option>INTEGER</option>
                  <option>BOOLEAN</option>
                  <option>SINGLE_SELECT</option>
                  <option>MULTI_SELECT</option>
                  <option>COLOR</option>
                  <option>MEASUREMENT</option>
                  <option>URL</option>
                  <option>EMAIL</option>
                  <option>JSON</option>
                </select>
              </div>
              <div className="field">
                <label>Scope</label>
                <select className="select-control" name="scope">
                  <option>PRODUCT</option>
                  <option>VARIANT</option>
                </select>
              </div>
            </div>
            {create.error && (
              <p className="form-alert">{errorMessage(create.error)}</p>
            )}
            <Button type="submit">Create attribute</Button>
          </form>
        </Card>
        <Card className="data-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attribute</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-semibold">
                    {item.displayName}
                  </TableCell>
                  <TableCell>
                    <code>{item.key}</code>
                  </TableCell>
                  <TableCell>{item.dataType}</TableCell>
                  <TableCell>{item.scope}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

type Family = {
  id: string;
  sellerFamilyId?: number;
  code: string;
  name: string;
  status: string;
  product: { publicName: string };
  _count: { members: number };
  variationAxes: Array<{ label: string }>;
};
type FamilyParentPage = {
  items: Array<{ id: string; publicName: string; productType: string }>;
};
type FamilyParent = {
  id: string;
  publicName: string;
  variants: Array<{
    id: string;
    sku: string;
    variantName: string;
    variationValues: Record<string, string>;
  }>;
};
type FamilyAttribute = {
  id: string;
  key: string;
  displayName: string;
  scope: string;
};
export function FamiliesPage() {
  const client = useQueryClient();
  const [parentId, setParentId] = useState("");
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["families"],
    queryFn: () => api<Family[]>("/product-families"),
  });
  const parents = useQuery({
    queryKey: ["family-parents"],
    queryFn: () => api<FamilyParentPage>("/products?limit=100"),
  });
  const parent = useQuery({
    queryKey: ["family-parent", parentId],
    queryFn: () => api<FamilyParent>(`/products/${parentId}`),
    enabled: Boolean(parentId),
  });
  const attributes = useQuery({
    queryKey: ["attributes"],
    queryFn: () => api<FamilyAttribute[]>("/attributes"),
  });
  const create = useMutation({
    mutationFn: (input: unknown) =>
      api("/product-families", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async () => {
      setParentId("");
      setVariantIds([]);
      await client.invalidateQueries({ queryKey: ["families"] });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const definition = attributes.data?.find(
      (item) => item.id === data.get("attributeDefinitionId"),
    );
    if (!definition) return;
    create.mutate({
      productId: parentId,
      sellerFamilyId: Number(data.get("sellerFamilyId")),
      code: String(data.get("code")),
      name: String(data.get("name")),
      description: String(data.get("description")) || undefined,
      variationAxes: [
        { attributeDefinitionId: definition.id, label: definition.displayName },
      ],
      variantIds,
    });
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Catalog"
        title="Product families"
        description="Separate sellable products connected by shared customer choices and eMAG family metadata."
        actions={<Stack size={20} />}
      />
      <div className="two-column">
        <Card className="panel">
          <div className="panel-header">
            <div>
              <h2>Create family</h2>
              <p>
                Select the first product. Every other size or color is added
                later as another product.
              </p>
            </div>
            <Plus size={18} />
          </div>
          <form className="form-stack compact-form" onSubmit={submit}>
            <div className="field">
              <label>First product</label>
              <select
                className="select-control"
                value={parentId}
                onChange={(event) => {
                  setParentId(event.target.value);
                  setVariantIds([]);
                }}
                required
              >
                <option value="">Choose product</option>
                {parents.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.publicName}
                  </option>
                ))}
              </select>
              <small className="field-help">
                The selected product contributes its one sellable SKU to this
                family.
              </small>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Family code</label>
                <Input
                  name="code"
                  placeholder="LIA-SCRUB-SET"
                  required
                  pattern="[A-Za-z0-9._-]+"
                />
                <small className="field-help">
                  Stable internal code shared by all products.
                </small>
              </div>
              <div className="field">
                <label>Seller family ID</label>
                <Input
                  name="sellerFamilyId"
                  type="number"
                  min={1}
                  placeholder="120"
                  required
                />
                <small className="field-help">
                  Numeric ID sent unchanged to eMAG for every member.
                </small>
              </div>
              <div className="field">
                <label>Name</label>
                <Input
                  name="name"
                  placeholder="Lia medical scrub set"
                  required
                />
                <small className="field-help">
                  Shared name without size or color.
                </small>
              </div>
            </div>
            <div className="field">
              <label>Variation axis</label>
              <select
                className="select-control"
                name="attributeDefinitionId"
                required
              >
                <option value="">Choose family choice</option>
                {attributes.data
                  ?.filter((item) => item.scope === "VARIANT")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName} ({item.key})
                    </option>
                  ))}
              </select>
              <small className="field-help">
                Example: Size or Color. Its value must already exist on the
                selected SKU.
              </small>
            </div>
            <div className="field">
              <label>First member SKU</label>
              <div className="check-options">
                {parent.data?.variants.map((variant) => (
                  <label key={variant.id}>
                    <input
                      type="checkbox"
                      checked={variantIds.includes(variant.id)}
                      onChange={(event) =>
                        setVariantIds(event.target.checked ? [variant.id] : [])
                      }
                    />
                    <span>
                      <strong>{variant.sku}</strong>
                      <small>
                        {Object.entries(variant.variationValues)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(" · ") || "No family value yet"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Internal note</label>
              <Input
                name="description"
                placeholder="Same model and material; differs by size"
              />
              <small className="field-help">
                Not published as the product description.
              </small>
            </div>
            {create.error && (
              <p className="form-alert">{errorMessage(create.error)}</p>
            )}
            <Button
              type="submit"
              disabled={
                create.isPending || !parentId || variantIds.length !== 1
              }
            >
              Create family
            </Button>
          </form>
        </Card>
        <div>
          <div className="card-grid family-grid">
            {query.data?.map((family) => (
              <Card className="panel" key={family.id}>
                <div className="panel-header">
                  <div>
                    <h2>{family.name}</h2>
                    <p>
                      Seller ID {family.sellerFamilyId ?? "missing"} ·{" "}
                      {family.code}
                    </p>
                  </div>
                  <Badge tone="neutral">{family.status}</Badge>
                </div>
                <div className="tag-row">
                  {family.variationAxes.map((axis) => (
                    <span key={axis.label}>{axis.label}</span>
                  ))}
                </div>
                <small className="text-muted">
                  {family._count.members} separate products
                </small>
              </Card>
            ))}
          </div>
          {query.data?.length === 0 && (
            <Card className="empty-state">
              <Stack size={30} />
              <h2>No product families yet</h2>
              <p>
                Create the first sellable product, then start its family here or
                directly from the product editor.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

type ProductPage = {
  items: Array<{
    id: string;
    publicName: string;
    variants: Array<{ id: string; sku: string; gtin?: string }>;
  }>;
};
export function Gs1Page() {
  const products = useQuery({
    queryKey: ["products-for-gs1"],
    queryFn: () => api<ProductPage>("/products?limit=100"),
  });
  const [variantId, setVariantId] = useState("");
  const registration = useQuery({
    queryKey: ["gs1", variantId],
    queryFn: () => api<any>(`/variants/${variantId}/gs1`),
    enabled: Boolean(variantId),
  });
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (input: unknown) =>
      api(`/variants/${variantId}/gs1`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["gs1", variantId] }),
  });
  const assign = useMutation({
    mutationFn: (gtin: string) =>
      api(`/variants/${variantId}/gs1/gtin`, {
        method: "POST",
        body: JSON.stringify({ gtin, source: "MANUAL_GS1" }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["gs1", variantId] }),
  });
  function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    save.mutate({
      productName: String(data.get("productName")),
      shortProductName: String(data.get("shortProductName")),
      labelDescription: String(data.get("labelDescription")),
      activityDomain: String(data.get("activityDomain")),
      brand: String(data.get("brand")),
      internalCode: String(data.get("internalCode")),
      responsibilityConfirmed: true,
    });
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Governance"
        title="GS1 & barcodes"
        description="Prepare registration data, validate completeness, then assign a valid GTIN received from GS1."
        actions={<Barcode size={20} />}
      />
      <Card className="panel">
        <div className="field">
          <label>Select variant</label>
          <select
            className="select-control"
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
          >
            <option value="">Choose product variant</option>
            {products.data?.items.flatMap((product) =>
              product.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.sku} · {product.publicName}
                </option>
              )),
            )}
          </select>
        </div>
      </Card>
      {variantId && (
        <div className="two-column">
          <Card className="panel">
            <div className="panel-header">
              <div>
                <h2>Registration draft</h2>
                <p>Status: {registration.data?.status ?? "NOT_STARTED"}</p>
              </div>
            </div>
            <form className="form-stack compact-form" onSubmit={saveForm}>
              <div className="field">
                <label>Product name</label>
                <Input
                  name="productName"
                  defaultValue={registration.data?.productName ?? ""}
                  required
                />
              </div>
              <div className="field">
                <label>Short name</label>
                <Input
                  name="shortProductName"
                  defaultValue={registration.data?.shortProductName ?? ""}
                  required
                />
              </div>
              <div className="field">
                <label>Label description</label>
                <Input
                  name="labelDescription"
                  defaultValue={registration.data?.labelDescription ?? ""}
                  required
                />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Activity domain</label>
                  <Input
                    name="activityDomain"
                    defaultValue={registration.data?.activityDomain ?? "Retail"}
                  />
                </div>
                <div className="field">
                  <label>Brand</label>
                  <Input
                    name="brand"
                    defaultValue={registration.data?.brand ?? ""}
                  />
                </div>
              </div>
              <div className="field">
                <label>Internal code</label>
                <Input
                  name="internalCode"
                  defaultValue={registration.data?.internalCode ?? ""}
                />
              </div>
              <Button type="submit" disabled={save.isPending}>
                Save GS1 draft
              </Button>
            </form>
          </Card>
          <Card className="panel">
            <h2>Assign GTIN</h2>
            <p className="text-muted">
              Only enter the identifier after GS1 has allocated it.
            </p>
            <form
              className="form-stack compact-form"
              onSubmit={(event) => {
                event.preventDefault();
                assign.mutate(
                  String(new FormData(event.currentTarget).get("gtin")),
                );
              }}
            >
              <div className="field">
                <label>GTIN</label>
                <Input name="gtin" inputMode="numeric" required />
              </div>
              {assign.error && (
                <p className="form-alert">{errorMessage(assign.error)}</p>
              )}
              <Button type="submit">Validate and assign</Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
