# Milestone 05 — Website channels, eMAG, and durable jobs

## Website channel

Multiple website accounts support independent domain, language, currency, stock buffer, category mappings, publication visibility, price, SEO, slug, and image selection. A dedicated `WebsiteListingData` projection keeps frequently read values out of JSON and supports database-side name/price/update sorting.

Website catalogue routes are authenticated with revocable high-entropy API keys. Only the SHA-256 key digest is persisted and the clear key is returned once. Optimized category, product list, search, detail, price, image, and available-stock read models include private cache headers and ETags. Keys are intended for the Garmendi server, not public browser code.

## eMAG

The connector implements the supplied Marketplace API v4.5.1 operations needed for eMAG Romania while retaining marketplace URL/configuration variants for Bulgaria, Hungary, and Fashion Days. Credentials use AES-256-GCM at rest and never enter frontend responses or request logs.

Implemented operations include category/characteristic/value/family synchronization, VAT and handling-time synchronization, EAN lookup, full product-offer save, lightweight offer save, stock-only PATCH, price/status updates, and remote reconciliation. Local draft validation enforces publication-path confirmation, required category characteristics, EAN/warranty requirements, price relationships, and first-publication requirements. Mock mode exercises the same adapter surface while live credentials are unavailable.

## Jobs and observability

Separate BullMQ queues exist for marketplace publication, stock sync, imports, exports, image processing, reconciliation, and notifications. PostgreSQL stores job input/status/progress, attempts, retry timing, correlation IDs, results, errors, and dead-letter timestamps. Manual retry/cancel/list/detail APIs and notification APIs are available.

The worker persists each attempt, uses bounded exponential retry, emits structured logs, writes sanitized integration request/response records with a 30-day expiry, creates failure notifications, and schedules reconciliation when eMAG may have accepted an offer despite documentation errors. A transactional database outbox bridges inventory commits to Redis safely.

Production activation still requires the external eMAG prerequisites: enabled API access, credentials, HTTPS, a stable public IP, eMAG IP whitelisting, and callback/firewall allowlisting where used.
