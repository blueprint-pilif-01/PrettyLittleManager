# Milestone 1: platform and private security foundation

Status: verified locally on 2026-07-21.

## Delivered

- pnpm monorepo with web, API, worker, contracts, database, and eMAG adapter packages.
- PostgreSQL Prisma schema and initial migration.
- Aline workspace seed with roles, granular permissions, and one environment-provided administrator.
- Invitation-only login with Argon2id password verification.
- Short-lived access tokens and opaque rotating refresh tokens.
- Refresh-token hashes only in PostgreSQL.
- Token-family revocation on reuse, logout revocation, and inactive-user rejection.
- Company and membership context derived from the authenticated session.
- Global permission guard and reusable permission decorators.
- HttpOnly SameSite Strict refresh cookie.
- Production CSRF origin validation and restricted CORS.
- Login/refresh throttling and global request limits.
- Correlation IDs and a consistent JSON error envelope.
- Helmet security headers, strict DTO whitelist, and unknown-property rejection.
- Audit entries for login and logout.
- Health endpoint and Swagger/OpenAPI UI.
- eMAG mock/live readiness adapter with server-only credentials.

## Files created or changed

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260721183000_initial_platform/migration.sql`
- `packages/database/prisma/seed.ts`
- `packages/contracts/src/permissions.ts`
- `apps/api/src/auth/*`
- `apps/api/src/access/*`
- `apps/api/src/common/*`
- `apps/api/src/database/*`
- `apps/api/src/audit/*`
- root package, environment, Docker Compose, and TypeScript configuration

## Environment variables

- `DATABASE_URL`
- `SESSION_SECRET`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL_DAYS`
- `WORKSPACE_SLUG`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `WEB_ORIGIN`
- `API_PORT`

## Commands

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm --filter @plm/database seed
pnpm dev:api
pnpm typecheck
pnpm test
```

## Automated verification

- Permission-key uniqueness and least-privilege role tests.
- Permission guard allow/deny tests.
- CSRF origin allow/deny tests.
- eMAG readiness tests.
- Full monorepo typecheck.

## Manual verification performed

The migration and seed were applied to an isolated PostgreSQL 18 cluster on loopback port 55432. The following sequence passed:

1. Protected workspace context without a token returned 401.
2. The seeded Aline administrator logged in successfully.
3. The session resolved the Aline company and 30 permissions.
4. Refresh returned a different access token and rotated the refresh session.
5. Logout returned 204.
6. Reusing the post-refresh access token after logout returned 401.

## Remaining limitations

- Invitation issuing, one-time acceptance, revocation, expiry, role assignment, and the administration interface were completed in the access-management milestone. Automatic email delivery remains an optional transport; the secure invitation link is deliberately shown once to an administrator for private delivery.
- Password-reset delivery remains a schema foundation; administrators can suspend access and issue a fresh invitation where appropriate.
- No tenant-facing company creation endpoint is exposed because this deployment is private; bootstrap is administrative.
- Docker Desktop was not running during the original milestone verification, so an isolated local PostgreSQL cluster was used. The later production milestone adds the complete Docker deployment stack and operational guide.
- Catalog, inventory, import/export, website, and publication endpoints were delivered in milestones 02–05.
