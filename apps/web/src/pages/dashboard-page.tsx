import {
  ArrowRight,
  CheckCircle,
  Package,
  Plus,
  Stack,
  Storefront,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { PageHeader } from "../components/page-header";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, errorMessage } from "../lib/api";
import { formatNumber } from "../lib/utils";

type Summary = {
  catalog: { totalProducts: number; variants: number; byStatus: Record<string, number>; readyForChannels: number };
  inventory: { availableUnits: number; warehouses: number; lowStockVariants: number; lowStockThreshold: number };
  attention: { unresolvedNotifications: number; failingJobs: number; total: number };
  emag: { accountCount: number; active: boolean; credentialsConfigured: boolean; mode: string };
  notifications: Array<{ id: string; severity: string; title: string; message: string; entityType?: string; entityId?: string; createdAt: string }>;
  recentJobs: Array<{ id: string; type: string; queueName: string; status: string; progress: number; createdAt: string; completedAt?: string; error?: { message?: string } }>;
};

function jobTone(status: string): "success" | "danger" | "warning" | "neutral" {
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PARTIALLY_SUCCEEDED") return "warning";
  return "neutral";
}

function readableJobType(value: string) {
  return value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function DashboardPage() {
  const { profile } = useAuth();
  const summary = useQuery({ queryKey: ["workspace-summary"], queryFn: () => api<Summary>("/workspace/summary"), refetchInterval: 30_000 });
  const data = summary.data;

  if (summary.isError) return <div className="inline-empty"><Warning size={28} /><h2>Dashboard could not be loaded</h2><p>{errorMessage(summary.error)}</p><Button onClick={() => void summary.refetch()}>Try again</Button></div>;

  const stats = [
    { label: "Products", value: data?.catalog.totalProducts ?? 0, detail: `${data?.catalog.variants ?? 0} sellable variants` },
    { label: "Ready for channels", value: data?.catalog.readyForChannels ?? 0, detail: `${data?.catalog.byStatus.DRAFT ?? 0} drafts` },
    { label: "Available stock", value: data?.inventory.availableUnits ?? 0, detail: `${data?.inventory.lowStockVariants ?? 0} SKUs at or below ${data?.inventory.lowStockThreshold ?? 5}` },
    { label: "Needs attention", value: data?.attention.total ?? 0, detail: `${data?.attention.failingJobs ?? 0} failed operations`, attention: Boolean(data?.attention.total) },
  ];

  return <div className="page-stack operations-dashboard">
    <PageHeader
      title="Operations"
      description={`Catalog, stock and publishing activity for ${profile?.company.name ?? "Pretty Little Things"}.`}
      actions={<><Button asChild variant="secondary"><Link to="/imports"><UploadSimple size={15} /> Import</Link></Button><Button asChild><Link to="/products/new"><Plus size={15} /> Add product</Link></Button></>}
    />

    <section className="operations-strip" aria-label="Workspace summary">
      {stats.map((stat) => <div key={stat.label} className={stat.attention ? "attention" : ""}><span>{stat.label}</span><strong>{summary.isLoading ? "..." : formatNumber(stat.value)}</strong><small>{stat.detail}</small></div>)}
    </section>

    <div className="operations-grid">
      <section className="operations-panel">
        <div className="section-heading"><div><h2>What needs attention</h2><p>Issues created by imports, stock and connected channels.</p></div><Badge tone={data?.notifications.length ? "warning" : "success"}>{data?.notifications.length ?? 0} open</Badge></div>
        <div className="attention-list operational-list">
          {data?.notifications.map((item) => <Link className="attention-item" key={item.id} to={item.entityType === "Product" && item.entityId ? `/products/${item.entityId}` : "/synchronization"}><span className={`attention-dot attention-dot-${item.severity === "ERROR" ? "danger" : item.severity === "WARNING" ? "warning" : "info"}`} /><span><strong>{item.title}</strong><small>{item.message}</small></span><ArrowRight size={16} /></Link>)}
          {data && !data.notifications.length && <div className="inline-success"><CheckCircle size={20} /><span><strong>No open issues</strong><small>Products, stock and channel operations have no unresolved notifications.</small></span></div>}
        </div>
      </section>

      <aside className="operations-side">
        <section className="channel-summary">
          <div className="channel-summary-icon"><Storefront size={19} /></div>
          <div><span>eMAG Romania</span><strong>{data?.emag.credentialsConfigured ? "Connected" : "Not connected"}</strong><p>{data?.emag.credentialsConfigured ? "Credentials are stored and the connector can be configured for publishing." : "Add the seller API credentials when eMAG provides them."}</p></div>
          <Button asChild variant="secondary" size="sm"><Link to="/channels/emag">Manage <ArrowRight size={13} /></Link></Button>
        </section>
        <nav className="quick-actions" aria-label="Quick actions">
          <h2>Quick actions</h2>
          <Link to="/products/new"><Package size={17} /><span><strong>Create a product</strong><small>Open the complete editor</small></span><ArrowRight size={14} /></Link>
          <Link to="/inventory"><Stack size={17} /><span><strong>Adjust inventory</strong><small>Receive, reserve or correct stock</small></span><ArrowRight size={14} /></Link>
          <Link to="/channels/websites"><Storefront size={17} /><span><strong>Publish to a website</strong><small>Manage Garmendi and other stores</small></span><ArrowRight size={14} /></Link>
        </nav>
      </aside>
    </div>

    <section className="operations-panel recent-operations">
      <div className="section-heading"><div><h2>Recent operations</h2><p>Imports, exports and synchronization jobs recorded by the system.</p></div><Button asChild variant="ghost" size="sm"><Link to="/synchronization">View all <ArrowRight size={14} /></Link></Button></div>
      <Table><TableHeader><TableRow><TableHead>Operation</TableHead><TableHead>Queue</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Started</TableHead></TableRow></TableHeader><TableBody>{data?.recentJobs.map((job) => <TableRow key={job.id}><TableCell className="font-medium">{readableJobType(job.type)}</TableCell><TableCell className="text-muted">{readableJobType(job.queueName)}</TableCell><TableCell>{job.progress}%</TableCell><TableCell><Badge tone={jobTone(job.status)}>{readableJobType(job.status)}</Badge></TableCell><TableCell className="text-right text-muted">{new Date(job.createdAt).toLocaleString("ro-RO")}</TableCell></TableRow>)}</TableBody></Table>
      {data && !data.recentJobs.length && <div className="inline-empty compact"><span>No background operations yet. Imports, exports and synchronization jobs will appear here.</span></div>}
    </section>
  </div>;
}
