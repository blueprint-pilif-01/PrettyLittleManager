# PrettyLittleManager

Private, invitation-only product and inventory workspace for Aline. It is the source of truth for canonical products, variants, families, GTIN/GS1 data, images, inventory, website publications, and eMAG Marketplace publications.

The implementation is a TypeScript modular monolith with a React/Vite administration client, NestJS API, PostgreSQL/Prisma persistence, and BullMQ workers backed by Redis. Website and eMAG concerns are isolated behind channel APIs and adapters; they do not leak into the canonical product domain.

## Local setup

Requirements: Node.js 22+, pnpm 11+, PostgreSQL, and Redis. Object storage can use the local filesystem during development; S3-compatible storage is supported for deployment.

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `SESSION_SECRET`, a 32-byte `ENCRYPTION_KEY`, and a one-time `INITIAL_SETUP_TOKEN` of at least 32 random characters. A token can be generated with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
2. Start PostgreSQL and Redis. `docker compose up -d` is provided when Docker is available.
3. Run `pnpm install`.
4. Run `pnpm db:generate` and `pnpm --filter @plm/database exec prisma migrate deploy`.
5. Start the services with `pnpm dev`, open `http://localhost:5173/setup`, and enter the one-time setup token plus the administrator identity and password. Setup works only while the database has zero companies and permanently disables itself after success.
6. Remove `INITIAL_SETUP_TOKEN` from the runtime environment after bootstrap. All additional users must enter through administrator-issued invitation links.

The seed command is reserved for disposable test or development databases. Do not use its example administrator on the real Aline workspace.

The app is available at `http://localhost:5173`, the API at `http://localhost:3000/api/v1`, Swagger at `http://localhost:3000/api/docs`, and readiness at `http://localhost:3000/api/v1/health/readiness`.

## Security boundaries

- There is no public registration. Users enter through administrator-issued invitations.
- Administrative endpoints require short-lived bearer tokens and permission checks.
- Connected websites use revocable high-entropy API keys. The clear key is returned exactly once; only its SHA-256 digest is stored.
- Website API keys belong in the Garmendi backend, never in browser JavaScript.
- eMAG credentials are encrypted with AES-256-GCM and used only by the API/worker. Authorization headers and passwords are never written to integration logs.
- The repository contains no production credential. Keep `.env` outside version control.

## Garmendi integration

The operational entry flow is Garmendi first: Aline staff create and edit the local storefront product, then the Garmendi backend signs in with an invitation-only, least-privilege PLM service account and upserts the canonical product, variants, images, and optional absolute stock count. PLM stores the remote identifiers, validates the central record, and remains the controlled publication boundary for eMAG. Credentials are server-side only.

The website projection remains available when Garmendi needs to read centrally published catalog data. Create an active website connection under `/api/v1/websites`, issue an API key, configure category mappings and published listings, then let the Garmendi server read:

- `GET /api/v1/website-catalog/categories`
- `GET /api/v1/website-catalog/products`
- `GET /api/v1/website-catalog/search?search=...`
- `GET /api/v1/website-catalog/products/:slug`

Send the key in `X-API-Key`. Responses expose website-specific price, SEO, selected images, and centrally calculated available stock. They include private cache headers, `Vary: X-API-Key`, and ETags. A matching `If-None-Match` returns HTTP 304.

## eMAG activation

The connector is complete in mock mode. To activate live eMAG Romania access, obtain Marketplace API credentials, deploy the backend behind HTTPS on a stable public IP, have that IP whitelisted by eMAG, configure the firewall/callback allowlist where applicable, store the account through the encrypted administration API, and switch the account from `mock` to `live`.

The adapter follows the supplied Marketplace API v4.5.1 contract: server-side Basic Auth, `{ data: [...] }` for writes, top-level read filters, 50-item write batches, separate rate buckets, controlled 429/5xx retry, EAN lookup limits, stock-only PATCH, sanitized 30-day logs, and reconciliation after uncertain documentation responses.

## Production deployment

`docker-compose.yml` remains the local infrastructure stack. The complete VPS stack is `docker-compose.production.yml`: Caddy HTTPS reverse proxy, static web image, NestJS API, BullMQ worker, PostgreSQL, password-protected Redis, MinIO initialization, one-shot migrations, and scheduled retained database backups. Copy `.env.production.example` to an untracked `.env.production` and follow [`docs/deployment.md`](./docs/deployment.md) for first deployment, health checks, backup/restore, rollback, and static-IP/eMAG whitelisting.

## Verification

Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. The opt-in concurrency test additionally needs `INTEGRATION_DATABASE_URL` pointing at a disposable PostgreSQL database.

Architecture and milestone evidence are in [`docs`](./docs).
