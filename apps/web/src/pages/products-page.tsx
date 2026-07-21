import { CaretLeft, CaretRight, MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/page-header";
import { StatusBadge } from "../components/status-badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, errorMessage } from "../lib/api";
import { formatCurrency } from "../lib/utils";

type Product = { id: string; publicName: string; status: "DRAFT" | "READY" | "ACTIVE" | "ARCHIVED"; updatedAt: string; category?: { name: string }; variants: Array<{ id: string; sku: string; basePrice?: string; currency: string; status: string; isDefaultVariant: boolean }>; _count: { variants: number } };
type ProductPage = { items: Product[]; page: { hasMore: boolean; nextCursor?: string } };
type Balance = { variantId: string; onHand: number; reserved: number; damaged: number; quarantined: number; safetyStock: number };
const statusLabel = { DRAFT: "Draft", READY: "Ready", ACTIVE: "Active", ARCHIVED: "Needs attention" } as const;

export function ProductsPage() {
  const [search, setSearch] = useState(""); const deferred = useDeferredValue(search); const [status, setStatus] = useState(""); const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]); const cursor = cursors.at(-1);
  const products = useQuery({ queryKey: ["products", deferred, status, cursor], queryFn: () => api<ProductPage>(`/products?limit=25${deferred ? `&search=${encodeURIComponent(deferred)}` : ""}${status ? `&status=${status}` : ""}${cursor ? `&cursor=${cursor}` : ""}`), placeholderData: keepPreviousData });
  const balances = useQuery({ queryKey: ["inventory-balances"], queryFn: () => api<Balance[]>("/inventory/balances") });
  const stock = new Map<string, number>(); for (const balance of balances.data ?? []) stock.set(balance.variantId, (stock.get(balance.variantId) ?? 0) + Math.max(0, balance.onHand - balance.reserved - balance.damaged - balance.quarantined - balance.safetyStock));
  return <div className="page-stack">
    <PageHeader eyebrow="Catalog" title="Products" description="Canonical products and sellable variants shared by websites, GS1, and marketplaces." actions={<Button asChild><Link to="/products/new"><Plus size={16} weight="bold" /> Add product</Link></Button>} />
    <Card className="data-card"><div className="data-toolbar"><div className="search-control"><MagnifyingGlass size={16} /><Input value={search} onChange={(event) => { setSearch(event.target.value); setCursors([undefined]); }} placeholder="Search name, SKU, GTIN, or brand" /></div><div className="toolbar-actions"><select className="select-control compact-select" value={status} onChange={(event) => { setStatus(event.target.value); setCursors([undefined]); }}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="READY">Ready</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></div></div>
      {products.isError ? <div className="empty-state"><WarningCircle size={28} /><h2>Products could not be loaded</h2><p>{errorMessage(products.error)}</p><Button variant="secondary" onClick={() => void products.refetch()}>Try again</Button></div> : products.isLoading ? <div className="loading-panel">Loading products…</div> : products.data?.items.length ? <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Status</TableHead><TableHead>Variants</TableHead><TableHead>Available</TableHead><TableHead>Base price</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader><TableBody>{products.data.items.map((product) => { const variant = product.variants.find((item) => item.isDefaultVariant) ?? product.variants[0]; return <TableRow key={product.id}><TableCell><Link className="product-cell product-link" to={`/products/${product.id}`}><span className="product-thumb">{product.publicName[0]}</span><span><strong>{product.publicName}</strong><small>{variant?.sku ?? "No SKU"} · {product.category?.name ?? "Uncategorized"}</small></span></Link></TableCell><TableCell><StatusBadge status={statusLabel[product.status]} /></TableCell><TableCell>{product._count.variants}</TableCell><TableCell className="font-semibold">{variant ? stock.get(variant.id) ?? 0 : "Not set"}</TableCell><TableCell>{variant?.basePrice ? formatCurrency(Number(variant.basePrice), variant.currency) : "Not set"}</TableCell><TableCell className="text-muted whitespace-nowrap">{new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(new Date(product.updatedAt))}</TableCell></TableRow>; })}</TableBody></Table> : <div className="empty-state"><MagnifyingGlass size={28} /><h2>No products found</h2><p>Create the first product or clear the current filters.</p></div>}
      <div className="table-footer"><span>{products.data?.items.length ?? 0} products on this page</span><div><Button variant="secondary" size="icon" disabled={cursors.length === 1} onClick={() => setCursors((value) => value.slice(0, -1))}><CaretLeft size={15} /></Button><span>Page {cursors.length}</span><Button variant="secondary" size="icon" disabled={!products.data?.page.hasMore} onClick={() => setCursors((value) => [...value, products.data?.page.nextCursor])}><CaretRight size={15} /></Button></div></div>
    </Card>
  </div>;
}
