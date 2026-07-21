# Milestone 02 — Canonical catalog, GS1, and media

Status: completed and integration-tested on 2026-07-21.

## Delivered

- Company-scoped categories, brands, canonical products, and sellable variants.
- Cursor pagination and search across names, SKU, GTIN, and brand.
- Backend-sanitized rich descriptions and safety content.
- Company-unique SKU and numeric IDs, globally unique GTINs, and normalized variant-combination keys.
- Typed dynamic attributes with product/variant scope, options, category templates, range, regex, unit, select, URL, email, measurement, and rich-text validation.
- Explicit product families with a parent product, stored axes, ordered members, status, channel metadata, and rejection of incomplete or duplicate variation combinations.
- Manual-first GS1 workflow with a connector abstraction, structured validation results, human-readable summaries, CSV export, manual-submission tracking, GTIN check-digit/type validation, duplicate protection, assignment audit, and channel reconciliation marking.
- Product and variant images with JPEG/PNG/WebP/AVIF content validation, 20 MB and dimension limits, SHA-256 deduplication, original preservation, WebP derivatives, explicit main/secondary ordering, alt text, parent-image inheritance, variant overrides, deletion, local development storage, and S3-compatible production storage.
- Public unguessable media URLs for website and marketplace consumption.
- Audit entries for all material catalog, family, GS1, GTIN, and image changes.

## Primary API surfaces

- `GET/POST/PATCH/DELETE /api/v1/products`
- `POST /api/v1/products/:id/variants`
- `GET/POST/PATCH /api/v1/categories` and `/api/v1/brands`
- `GET/POST /api/v1/attributes`
- `PUT /api/v1/products/:id/attributes` and `/api/v1/variants/:id/attributes`
- `GET/POST/PATCH /api/v1/product-families`
- `POST /api/v1/product-families/:id/members`
- `GET/PUT /api/v1/variants/:id/gs1`
- `POST /api/v1/variants/:id/gs1/validate`
- `GET /api/v1/variants/:id/gs1/summary` and `/export.csv`
- `POST /api/v1/variants/:id/gs1/submit-manually` and `/gtin`
- `POST /api/v1/images/upload`, image assignment/order/delete endpoints, and public local-media reads.

## Verification evidence

The monorepo unit suite passed with 21 tests at the milestone boundary. A real API/PostgreSQL integration run verified:

- Invitation-only login and permission-bearing access token.
- Parent product plus two variants and an explicit two-member family.
- Duplicate variation combination rejected with HTTP 409.
- Complete GS1 draft validated successfully.
- Invalid GTIN rejected with HTTP 400.
- Manual submission transitioned to `SUBMITTED_MANUALLY`.
- Valid EAN-13 assignment transitioned to `GTIN_ASSIGNED`.
- Image upload transitioned to `READY` and generated both derivatives.
- Parent image inheritance and variant-specific override.
- Binary deduplication, main-image reorder, public media HTTP 200, and physical/record deletion flow.

All demonstration records and media used the isolated workspace-local test database and storage. The company database received migrations only.

## Deliberate boundaries

- Direct GS1 API calls remain disabled until official access and documentation exist; the manual connector is production-usable and replaceable.
- Heavy asynchronous image processing can move behind BullMQ without changing the media domain contract; the current synchronous path is functional and deterministic.
- Channel-specific category and characteristic mapping is implemented in the next integration milestone.
