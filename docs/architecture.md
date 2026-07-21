# PrettyLittleManager architecture

## Product boundary

PrettyLittleManager is the source of truth for product content, sellable variants, GTIN assignments, price inputs, inventory availability, images, and channel publication state. Websites and marketplaces consume projections from PrettyLittleManager; they do not own the canonical records.

The codebase remains company-scoped so isolation is enforced structurally. The Aline deployment is intentionally private and invitation-only: no public registration, public tenant creation, or self-service billing is exposed.

## Version 1 scope

- Private authentication, sessions, roles, granular permissions, invitations, revocation, password reset foundations, and audit.
- Company-scoped products, variants, families, brands, categories, dynamic attributes, images, descriptions, and validation.
- Manual GS1 workflow and GTIN validation without assuming direct GS1 API access.
- Warehouses, balances, immutable inventory movements, reservations, transfers, availability, and reconciliation.
- Reusable XLS, XLSX, and CSV imports and exports with mappings, row results, progress, and partial success.
- Website channel configuration and optimized read APIs.
- eMAG Romania account configuration, metadata synchronization, EAN lookup, draft/publication paths, lightweight offer updates, retries, reconciliation, and integration logs.
- PostgreSQL, Redis/BullMQ, S3-compatible object storage, Docker, reverse proxy, backup, health, and deployment documentation.

Orders, shipping, returns, invoices, additional marketplaces, AI generation, analytics warehouses, and SaaS billing remain future modules.

## Runtime diagram

```text
Browser
  |
  | HTTPS, access token, refresh cookie
  v
Reverse proxy
  |------------------------------|
  v                              v
React/Vite web                 NestJS API
                                 |
                |----------------|----------------|
                v                v                v
             PostgreSQL        Redis           S3 / R2
           canonical state   cache + queues   media/files
                                 |
                                 v
                            BullMQ workers
                 |---------------|---------------|
                 v               v               v
              eMAG API     file processing   reconciliation
```

The API is a modular monolith. The worker is a separate process using the same domain contracts. External operations do not run inside normal request cycles when they can exceed the API latency target.

The catalog is canonical and channel-neutral. `Product` owns shared commercial and regulatory content; `ProductVariant` is the sellable unit and owns SKU, GTIN, price, stock, and variant overrides. Product families store their axes explicitly and never infer them from names. Attributes remain typed definitions plus JSON values so new category fields do not require schema migrations.

GS1 is a separate manual-first workflow over variants. Website and eMAG adapters consume the assigned GTIN but do not own it. Media is stored once, assigned explicitly to products or variants, and exposed through stable public URLs; variants inherit parent assignments only when no variant-specific images exist.

## Domain modules

| Module | Owns | Does not own |
|---|---|---|
| Identity and access | users, sessions, invitations, memberships, roles, permissions | product rules |
| Company | workspace configuration and tenant context | authentication secrets |
| Catalog | products, variants, families, brands, categories, inheritance | eMAG behavior |
| Attributes | definitions, options, category templates, typed values | universal core fields |
| Media | storage metadata, ordering, assignments, transformations | marketplace publication |
| GS1 | registration workflow, GTIN validation and assignment | arbitrary GTIN generation |
| Inventory | warehouses, ledger, balances, reservations, transfers | channel API calls |
| Pricing | decimal-safe price lists, product prices, VAT inputs | eMAG-only price payloads |
| Imports | uploads, mappings, previews, validation, row results | direct product business logic |
| Exports | canonical export model, mappings, renderers, files | product mutations |
| Channels | generic channel accounts, listings, mappings, sync state | provider-specific calls |
| eMAG integration | eMAG payloads, metadata, EAN lookup, throttling, reconciliation | canonical product ownership |
| Website integration | website configuration, API clients, read projections | administrative mutation APIs |
| Validation | structured information, warning, and blocking results | persistence ownership |
| Jobs | queue state, attempts, retry/dead-letter behavior | business rules inside generic queue code |
| Audit and notifications | trace and actionable incidents | secrets or raw credentials |

## Tenant and privacy model

- Every tenant-owned query is constrained using `companyId` derived from the authenticated membership.
- The API never accepts a frontend `companyId` as authorization evidence.
- Sessions identify a user, membership, and company. Permission data is reloaded from the database so revocation and role changes take effect.
- Jobs carry verified company context; queue identifiers and object-storage keys are tenant-scoped.
- The Aline deployment exposes no public signup or tenant-switching interface.

## Security model

- Argon2id password hashing.
- Short-lived signed access tokens.
- Opaque rotating refresh tokens stored only as SHA-256 hashes.
- HttpOnly, SameSite Strict refresh cookie.
- Token-family revocation when refresh-token reuse is detected.
- Session revocation on logout and account suspension.
- Login and refresh rate limiting.
- Production origin validation for state-changing requests.
- Helmet security headers, restricted CORS, DTO whitelisting, unknown-field rejection, and consistent errors.
- Credentials encrypted at rest and never returned to the web client or logged.
- Correlation IDs on requests, audit events, jobs, and integration calls.

## Permission matrix

| Capability | Owner/Admin | Product manager | Inventory manager | Employee | Viewer |
|---|---:|---:|---:|---:|---:|
| Manage users and roles | Yes | No | No | No | No |
| Create/update products | Yes | Yes | No | Yes | No |
| Publish products | Yes | Yes | No | No | No |
| Manage categories/attributes | Yes | Yes | No | No | No |
| Read inventory | Yes | Yes | Yes | Yes | Yes |
| Adjust/transfer inventory | Yes | No | Yes | No | No |
| Run imports/exports | Yes | Yes | Yes | No | No |
| Configure integrations | Yes | No | No | No | No |
| Trigger integration sync | Yes | No | No | No | No |
| Manage GS1 workflow | Yes | Yes | No | No | No |
| Read audit log | Yes | No | No | No | No |

The source of truth is `packages/contracts/src/permissions.ts`; this table is explanatory.

## API conventions

- Base path: `/api/v1`.
- OpenAPI UI: `/api/docs`.
- Bearer access tokens for administrative APIs; rotating refresh cookie only under `/api/v1/auth`.
- Cursor pagination for large or changing collections.
- Consistent error envelope with code, message, optional details, correlation ID, timestamp, and path.
- Idempotency keys for inventory, imports, exports, channel publication, and callbacks.
- Slow work returns a job identifier and continues in BullMQ.

## Queue boundaries

Separate queues prevent bulk work from starving urgent stock updates:

- `marketplace-publication`
- `stock-sync`
- `imports`
- `exports`
- `image-processing`
- `reconciliation`
- `notifications`

Each queue defines concurrency, rate limit, timeout, capped retries, exponential backoff with jitter, deduplication, and dead-letter behavior.

## Deployment model

The initial production target is one VPS with a static public IP:

```text
TLS reverse proxy
  + web container
  + API container(s)
  + worker container(s)
  + PostgreSQL
  + Redis
  + backup job
  + external S3-compatible storage
```

API and worker processes remain stateless and can scale horizontally. PostgreSQL, Redis, and object storage can move to managed services without changing domain boundaries.

## Performance decisions

- Indexed company-scoped search paths and unique keys.
- Cursor pagination and bounded selection sets.
- Current inventory balance projection plus immutable ledger.
- Database transactions and row locks for inventory consistency.
- Optimized website read models, cache headers, ETags, and optional tenant-scoped Redis caching.
- Streaming or batched imports/exports.
- Route-level frontend code splitting and server-side table filtering.
- External API work handled asynchronously.

## Delivery milestones

1. Platform, PostgreSQL, private identity, permissions, sessions, audit, errors, and OpenAPI.
2. Canonical catalog, variants, families, attributes, categories, descriptions, media, validation, GS1, and GTIN.
3. Warehouses, ledger, balances, reservations, transfers, stock synchronization, and reconciliation.
4. Import and export engines with mappings and background processing.
5. Website channels and read projections.
6. eMAG metadata, mapping, EAN decision flow, publication, offer updates, rate limits, logs, and reconciliation.
7. Complete client integration, end-to-end flows, security/performance verification, deployment, and backups.
8. Professional interface completion and visual QA.
9. Garmedi field and API adaptation after Version 1 is functional.

## Major risks and mitigations

| Risk | Mitigation |
|---|---|
| eMAG API access is not yet available | Mock/contract adapter, capability readiness, live mode disabled until credentials and IP approval exist |
| eMAG responses can be partially successful | Persist attempts and payload hashes; reconcile uncertain responses before retrying |
| Spreadsheet files are hostile or malformed | Content-type checks, no formula/macro execution, bounded streaming, row-level validation |
| Concurrent stock changes cause overselling | Idempotency, row locking, short transactions, immutable ledger, balance projection |
| Channel fields pollute the core model | Adapter-owned mappings and listing projections |
| A private deployment drifts from tenant isolation | Membership-derived tenant context remains mandatory in every query and job |
| Large catalogues cause slow reads | Cursor pagination, targeted indexes, bounded fields, query analysis, optional projections/cache |
| Secrets leak through logs or UI | Encryption, redaction, server-only configuration, sanitized audit/integration logs |

## Confirmed assumptions

- The production workspace is private to Aline and accounts are created by invitation.
- The architecture stays company-scoped, but no public multi-company signup is exposed.
- PrettyLittleManager is built and stabilized before Garmedi is changed.
- Garmedi will later adopt the canonical product fields and integration contract.
- eMAG Romania is the only live marketplace target in Version 1.
- Until API credentials arrive, eMAG operations use mock mode and cannot publish live.
- GS1 Version 1 is a reliable manual registration workflow, not an assumed direct API integration.
