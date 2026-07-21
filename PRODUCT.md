# PrettyLittleManager

PrettyLittleManager is Aline's private product, inventory, and marketplace operations workspace. It is the controlled source of truth where the company prepares catalog data, tracks stock, validates channel readiness, and publishes products to connected systems such as eMAG and, later, Garmedi.

## Product purpose

The application replaces fragmented product spreadsheets and channel-specific editing with one auditable workflow. A product should be created and enriched in PrettyLittleManager first, validated against business and channel rules, then synchronized outward.

The first delivery must provide a useful internal workspace even before eMAG API credentials are issued. eMAG integration therefore starts in mock-ready mode with credential, capability, mapping, validation, queue, retry, and audit foundations already in place.

## Users

- Aline administrators who control access, integrations, settings, and permissions.
- Catalog and e-commerce operators who create product families, variants, attributes, categories, media, and channel listings.
- Inventory operators who manage warehouses, stock, reservations, adjustments, and imports.
- Managers who need operational status, synchronization health, exceptions, and audit history.

This is a single-company, private workspace. There is no public registration, customer storefront, multi-tenant marketplace, or access for people outside Aline unless an administrator explicitly creates an account for them.

## Core jobs

1. Maintain a canonical catalog of product families and sellable SKUs.
2. Store the structured fields, identifiers, media, pricing, dimensions, compliance data, and marketplace metadata each product needs.
3. Track stock by warehouse with an immutable movement history and safe adjustments.
4. Import and export product or inventory data with preview, validation, error reporting, and resumable background processing.
5. Prepare, validate, publish, and monitor channel listings, beginning with eMAG.
6. Keep every meaningful change traceable through roles, audit logs, job history, and synchronization events.
7. Expose a stable integration contract that Garmedi can adopt after PrettyLittleManager is functional.

## Product principles

- **One controlled source of truth.** Canonical product and inventory data lives here; channel records are projections with explicit mappings and status.
- **Private by default.** Authentication is mandatory, public signup is absent, permissions are least-privilege, and secrets never enter client code.
- **Validate before publishing.** Operators see missing or invalid fields before a channel job is queued.
- **Every change is explainable.** Stock changes, imports, mapping changes, publishing attempts, and administrative actions are auditable.
- **Safe background work.** Imports, exports, media processing, and channel synchronization are idempotent, retryable, and observable.
- **Useful without external credentials.** Mock adapters and readiness checks let the team configure and test workflows before providers grant API access.
- **Dense but calm.** Frequent operational tasks should be fast to scan and keyboard-friendly without feeling cluttered.

## Experience and brand

The product should feel professional, calm, exact, and trustworthy: an internal operations control room built for daily use. It may be information-dense, but hierarchy, spacing, labels, filters, and status language must remain clear.

Visual anti-references:

- An outdated eMAG administration clone.
- A flashy consumer e-commerce storefront.
- A generic AI dashboard with purple gradients, glassmorphism, oversized cards, or decorative charts.
- A sparse marketing layout that hides operational detail behind excessive whitespace.
- Motion for decoration, especially in tables, forms, and keyboard-heavy workflows.

## Functional scope

- Private authentication, invited users, sessions, role-based access control, and audit logs.
- Dashboard with actionable exceptions, channel readiness, inventory alerts, and recent operations.
- Products, product families, variants, categories, brands, attributes, media, prices, and identifiers.
- Warehouses, stock levels, reservations, stock movements, and inventory adjustments.
- Imports and exports with templates, preview, validation, job progress, and downloadable results.
- Channel accounts, category and attribute mappings, listing validation, publish jobs, retries, and synchronization history.
- eMAG adapter with mock and live modes, credentials stored only on the server, and capability/readiness reporting.
- GS1 and barcode fields and validation foundations.
- Settings, notification preferences, integration health, users, and permissions.
- A documented API and event contract for future Garmedi adaptation.

## Quality bar

- Accessible forms and navigation targeting WCAG 2.2 AA.
- Responsive behavior for desktop operations, tablets, and a focused mobile fallback.
- Fast, filterable, paginated tables that remain usable with large datasets.
- Explicit loading, empty, validation, partial-success, error, and retry states.
- Strong input validation and typed contracts across the web app, API, worker, and integrations.
- Automated tests for permissions, validation, inventory invariants, idempotency, and channel behavior.
- Production-oriented local infrastructure for PostgreSQL, Redis, object storage, and background jobs.

## Delivery sequence

1. Build and verify PrettyLittleManager as a functional private workspace.
2. Stabilize its product and integration contracts.
3. Adapt the existing Garmedi application to provide the required fields and synchronize through those contracts.
4. Enable live eMAG communication when Aline receives credentials and the provider confirms account capabilities.
