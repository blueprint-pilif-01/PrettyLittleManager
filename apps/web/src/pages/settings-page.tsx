import {
  ArrowRight,
  Buildings,
  CheckCircle,
  FloppyDisk,
  LockKey,
  PlugsConnected,
  Pulse,
  SlidersHorizontal,
  Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { PageHeader } from "../components/page-header";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, errorMessage } from "../lib/api";

type CompanySettings = {
  defaultLanguage?: string;
  defaultCurrency?: string;
  defaultVatRate?: string;
  defaultWeightUnit?: string;
  defaultDimensionUnit?: string;
  lowStockThreshold?: number;
};

type WorkspaceContext = {
  company: { id: string; name: string; slug: string; settings?: CompanySettings };
  access: { visibility: string; publicSignup: boolean; invitationOnly: boolean };
  role: string;
  permissions: string[];
};

type HealthCheck = { ok: boolean; detail?: string; driver?: string; mode?: string; latencyMs?: number };
type Health = { status: "ready" | "degraded"; checks: Record<string, HealthCheck>; timestamp: string };
type EmagAccount = { id: string; name: string; isActive: boolean; configuration: { mode: "mock" | "live" }; readiness: { canConnect: boolean } };
type Website = { id: string; name: string; isActive: boolean; configuration: { domain: string } };
type SettingsTab = "workspace" | "catalog" | "access" | "integrations" | "system";

const tabs: Array<{ id: SettingsTab; label: string; description: string; icon: typeof Buildings }> = [
  { id: "workspace", label: "Workspace", description: "Name and identity", icon: Buildings },
  { id: "catalog", label: "Catalog defaults", description: "Values used by new products", icon: SlidersHorizontal },
  { id: "access", label: "Access & security", description: "Private access and permissions", icon: LockKey },
  { id: "integrations", label: "Integrations", description: "Websites and marketplaces", icon: PlugsConnected },
  { id: "system", label: "System", description: "Service diagnostics", icon: Pulse },
];

const fallbackSettings: Required<CompanySettings> = {
  defaultLanguage: "ro",
  defaultCurrency: "RON",
  defaultVatRate: "19",
  defaultWeightUnit: "kg",
  defaultDimensionUnit: "cm",
  lowStockThreshold: 5,
};

export function SettingsPage() {
  const auth = useAuth();
  const client = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>("workspace");
  const [notice, setNotice] = useState("");
  const context = useQuery({ queryKey: ["workspace-context"], queryFn: () => api<WorkspaceContext>("/workspace/context") });
  const health = useQuery({ queryKey: ["readiness"], queryFn: () => api<Health>("/health/readiness"), enabled: tab === "system", refetchInterval: tab === "system" ? 30_000 : false });
  const emag = useQuery({ queryKey: ["emag-accounts"], queryFn: () => api<EmagAccount[]>("/integrations/emag/accounts"), enabled: tab === "integrations" });
  const websites = useQuery({ queryKey: ["websites"], queryFn: () => api<Website[]>("/websites"), enabled: tab === "integrations" });
  const settings = { ...fallbackSettings, ...(context.data?.company.settings ?? {}) };

  const save = useMutation({
    mutationFn: (input: unknown) => api<WorkspaceContext["company"]>("/company", { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async (company) => {
      setNotice("Settings saved.");
      auth.updateCompanyProfile({ name: company.name });
      await client.invalidateQueries({ queryKey: ["workspace-context"] });
    },
  });

  function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(""); const data = new FormData(event.currentTarget);
    save.mutate({ name: String(data.get("name")) });
  }

  function saveCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(""); const data = new FormData(event.currentTarget);
    save.mutate({ settings: {
      defaultLanguage: String(data.get("defaultLanguage")),
      defaultCurrency: String(data.get("defaultCurrency")).toUpperCase(),
      defaultVatRate: String(data.get("defaultVatRate")),
      defaultWeightUnit: String(data.get("defaultWeightUnit")),
      defaultDimensionUnit: String(data.get("defaultDimensionUnit")),
      lowStockThreshold: Number(data.get("lowStockThreshold")),
    } });
  }

  if (context.isLoading) return <div className="settings-skeleton" aria-label="Loading settings"><span /><span /><span /></div>;
  if (context.isError || !context.data) return <div className="inline-empty"><Warning size={24} /><h2>Settings could not be loaded</h2><p>{errorMessage(context.error)}</p><Button variant="secondary" onClick={() => void context.refetch()}>Try again</Button></div>;

  const workspace = context.data;
  const activeEmag = emag.data?.find((account) => account.isActive);

  return <div className="page-stack settings-page">
    <PageHeader title="Settings" description="Configure defaults and access for Pretty Little Things. Technical diagnostics are kept in their own section." />
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {tabs.map(({ id, label, description, icon: Icon }) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => { setTab(id); setNotice(""); }} aria-current={tab === id ? "page" : undefined}><Icon size={17} /><span><strong>{label}</strong><small>{description}</small></span><ArrowRight size={14} /></button>)}
      </nav>

      <div className="settings-content">
        {notice && <p className="success-alert" role="status">{notice}</p>}
        {save.error && <p className="form-alert" role="alert">{errorMessage(save.error)}</p>}

        {tab === "workspace" && <section className="settings-section">
          <div className="settings-section-heading"><h2>Workspace identity</h2><p>This name appears in navigation, reports and audit context.</p></div>
          <form className="settings-form" onSubmit={saveWorkspace}>
            <div className="setting-row"><div><label htmlFor="workspaceName">Workspace name</label><p>Visible to every internal user.</p></div><Input id="workspaceName" name="name" defaultValue={workspace.company.name} required minLength={2} /></div>
            <div className="setting-row"><div><label htmlFor="workspaceSlug">Workspace key</label><p>Used by login and integrations. It stays fixed to avoid breaking connections.</p></div><Input id="workspaceSlug" value={workspace.company.slug} readOnly aria-readonly="true" /></div>
            <div className="settings-actions"><Button type="submit" disabled={save.isPending}><FloppyDisk size={15} />{save.isPending ? "Saving..." : "Save workspace"}</Button></div>
          </form>
        </section>}

        {tab === "catalog" && <section className="settings-section">
          <div className="settings-section-heading"><h2>New product defaults</h2><p>These values are inserted automatically in the full product editor and remain editable per product.</p></div>
          <form className="settings-form" onSubmit={saveCatalog} key={JSON.stringify(settings)}>
            <div className="setting-row"><div><label htmlFor="defaultLanguage">Default language</label><p>Language code for product content.</p></div><select id="defaultLanguage" name="defaultLanguage" className="select-control" defaultValue={settings.defaultLanguage}><option value="ro">Romanian</option><option value="en">English</option></select></div>
            <div className="setting-row"><div><label htmlFor="defaultCurrency">Default currency</label><p>Used for product and channel prices.</p></div><select id="defaultCurrency" name="defaultCurrency" className="select-control" defaultValue={settings.defaultCurrency}><option value="RON">RON</option><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="HUF">HUF</option></select></div>
            <div className="setting-row"><div><label htmlFor="defaultVatRate">Default VAT rate</label><p>Stored as a percentage and applied to new products.</p></div><Input id="defaultVatRate" name="defaultVatRate" inputMode="decimal" defaultValue={settings.defaultVatRate} required /></div>
            <div className="setting-row"><div><label htmlFor="defaultWeightUnit">Weight unit</label><p>Default physical unit for logistics.</p></div><select id="defaultWeightUnit" name="defaultWeightUnit" className="select-control" defaultValue={settings.defaultWeightUnit}><option value="kg">kg</option><option value="g">g</option></select></div>
            <div className="setting-row"><div><label htmlFor="defaultDimensionUnit">Dimension unit</label><p>Used for length, width and height.</p></div><select id="defaultDimensionUnit" name="defaultDimensionUnit" className="select-control" defaultValue={settings.defaultDimensionUnit}><option value="cm">cm</option><option value="mm">mm</option><option value="m">m</option></select></div>
            <div className="setting-row"><div><label htmlFor="lowStockThreshold">Low stock threshold</label><p>Defines when a sellable SKU needs attention.</p></div><Input id="lowStockThreshold" name="lowStockThreshold" type="number" min={0} defaultValue={settings.lowStockThreshold} required /></div>
            <div className="settings-actions"><Button type="submit" disabled={save.isPending}><FloppyDisk size={15} />{save.isPending ? "Saving..." : "Save defaults"}</Button></div>
          </form>
        </section>}

        {tab === "access" && <section className="settings-section">
          <div className="settings-section-heading"><h2>Access & security</h2><p>This is a private, invitation-only workspace. Public registration is disabled.</p></div>
          <div className="settings-list">
            <div><span><LockKey size={17} /><strong>Workspace visibility</strong></span><span><Badge tone="success">Private</Badge><small>Only invited users can sign in</small></span></div>
            <div><span><CheckCircle size={17} /><strong>Your role</strong></span><span><strong>{workspace.role}</strong><small>{workspace.permissions.length} granted permissions</small></span></div>
          </div>
          <div className="settings-link-row"><Button asChild variant="secondary"><Link to="/users">Manage users and roles <ArrowRight size={14} /></Link></Button><Button asChild variant="secondary"><Link to="/audit">Review audit log <ArrowRight size={14} /></Link></Button></div>
        </section>}

        {tab === "integrations" && <section className="settings-section">
          <div className="settings-section-heading"><h2>Connected sales channels</h2><p>Manage credentials, mappings and listing behavior in each dedicated channel page.</p></div>
          <div className="settings-list">
            <div><span><PlugsConnected size={17} /><strong>eMAG Romania</strong></span><span><Badge tone={activeEmag?.readiness.canConnect ? "success" : "warning"}>{activeEmag?.readiness.canConnect ? "Connected" : "Not connected"}</Badge><small>{activeEmag ? activeEmag.name : "API credentials have not been configured"}</small><Button asChild size="sm" variant="ghost"><Link to="/channels/emag">Manage <ArrowRight size={13} /></Link></Button></span></div>
            <div><span><Buildings size={17} /><strong>Websites</strong></span><span><strong>{websites.data?.filter((website) => website.isActive).length ?? 0} active</strong><small>{websites.data?.map((website) => website.name).join(", ") || "No website connection"}</small><Button asChild size="sm" variant="ghost"><Link to="/channels/websites">Manage <ArrowRight size={13} /></Link></Button></span></div>
          </div>
        </section>}

        {tab === "system" && <section className="settings-section">
          <div className="settings-section-heading"><h2>System diagnostics</h2><p>Use this only when imports, exports or synchronization do not run as expected.</p></div>
          {health.isLoading ? <div className="settings-skeleton"><span /><span /><span /></div> : health.isError ? <p className="form-alert">{errorMessage(health.error)}</p> : <div className="service-table">
            <div className="service-table-head"><span>Service</span><span>Status</span><span>What it affects</span></div>
            {Object.entries(health.data?.checks ?? {}).map(([name, check]) => <div className="service-row" key={name}><strong>{name === "redis" ? "Redis" : name === "emag" ? "eMAG API" : name[0]!.toUpperCase() + name.slice(1)}</strong><span className={check.ok ? "service-ok" : "service-warning"}>{check.ok ? <CheckCircle size={15} /> : <Warning size={15} />}{check.ok ? "Ready" : "Needs attention"}</span><small>{check.detail ?? (name === "database" ? `Product and inventory data${check.latencyMs !== undefined ? `, ${check.latencyMs} ms` : ""}` : name === "redis" || name === "queues" ? "Imports, exports and synchronization jobs" : name === "storage" ? "Product images and generated files" : name === "emag" ? "Marketplace metadata and publishing" : check.driver ?? check.mode ?? "Service availability")}</small></div>)}
          </div>}
          <p className="settings-help">A Redis warning does not affect manual catalog editing, but queued imports, exports and channel synchronization need Redis running.</p>
        </section>}
      </div>
    </div>
  </div>;
}
