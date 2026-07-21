# Production deployment

PrettyLittleManager is prepared for one Linux VPS with a stable public IP. Only Caddy exposes ports `80` and `443`; PostgreSQL, Redis, MinIO, the API, and the worker remain on internal Docker networks.

## Prerequisites

1. Point an `A` record such as `plm.example.ro` to the VPS static public IP.
2. Allow inbound TCP `80` and `443` and UDP `443`; do not expose database, Redis, or MinIO ports.
3. Install Docker Engine with the Compose plugin.
4. Copy the repository to a release directory owned by a non-root deployment user.
5. Copy `.env.production.example` to `.env.production`, replace every placeholder with independently generated secrets, and set file permissions to owner-read/write only. Use URL-safe random values (letters, digits, hyphen, and underscore) for the PostgreSQL and Redis passwords because the deployment composes them into connection URLs.

Caddy obtains and renews the HTTPS certificate automatically after DNS and firewall configuration are correct. The API sets secure refresh cookies in production and accepts state-changing requests only from `https://APP_HOST`.

## First deployment

Validate interpolation before starting anything:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

Build, apply migrations, and start the stack:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migration
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

Open `https://APP_HOST/setup`, create the first Aline administrator with the one-time setup token, then remove `INITIAL_SETUP_TOKEN` from `.env.production` and recreate the API container:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate api
```

Do not run the development seed against production. Every later account must use an administrator-issued invitation.

## Health and operations

- Liveness: `GET https://APP_HOST/api/v1/health`
- Readiness: `GET https://APP_HOST/api/v1/health/readiness`
- API documentation: `https://APP_HOST/api/docs`
- Container state: `docker compose --env-file .env.production -f docker-compose.production.yml ps`
- Structured logs: `docker compose --env-file .env.production -f docker-compose.production.yml logs --since=15m api worker proxy`

Readiness verifies PostgreSQL, Redis, object storage, queues, and the configured eMAG connector. A degraded readiness response must be resolved before switching traffic to a new release. Failed, pending, retried, and dead-letter jobs remain inspectable and retryable in the application.

## Backup and restore

The `backup` service creates one PostgreSQL custom-format dump every 24 hours and removes dumps older than `BACKUP_RETENTION_DAYS`. The named volume must also be copied to off-host encrypted storage. Product originals live in the private object-storage volume and require a separate off-host backup or bucket replication policy. Public image reads pass through the API, which rejects every `private/` object key; import sources, reports, and exports are never exposed by the object store.

List database backups:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml exec backup ls -lh /backups
```

Before a restore, stop API and workers, create a safety dump, and resolve the exact backup filename. Restore into the existing database only during a declared maintenance window:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml stop api worker
docker compose --env-file .env.production -f docker-compose.production.yml exec backup pg_dump --format=custom --no-owner --file=/backups/pre-restore.dump
docker compose --env-file .env.production -f docker-compose.production.yml exec backup sh -ec 'pg_restore --clean --if-exists --no-owner --dbname="$POSTGRES_DB" /backups/EXACT_BACKUP_FILE.dump'
docker compose --env-file .env.production -f docker-compose.production.yml up -d api worker
```

After restore, wait for readiness and verify an authenticated product, inventory, website, and background-job read before ending maintenance.

## Release and rollback

1. Create a database dump and record the current Git revision.
2. Build the candidate images and run the migration service.
3. Start API and worker, wait for readiness, then recreate web/proxy if required.
4. Run the authentication, product, inventory, website projection, and eMAG mock smoke checks.

Application rollback uses the recorded revision and a fresh image build. Database migrations are forward-only; if a release contains an incompatible migration, stop writers and restore the pre-release dump before starting the previous application revision. Never attempt an automatic destructive down-migration.

## Static IP and eMAG live activation

The public IP seen by outbound traffic must be the same stable VPS IP. Send it to eMAG for API whitelisting together with the marketplace account request. Confirm outbound HTTPS access to the official eMAG endpoint and any callback/firewall allowlist they require. Keep `EMAG_MODE=mock` until credentials, API access, and the IP whitelist are confirmed. Then store the credentials through the encrypted administration API and switch the account to live mode; do not put credentials in frontend code or logs.
