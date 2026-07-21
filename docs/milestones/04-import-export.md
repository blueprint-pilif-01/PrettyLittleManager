# Milestone 04 — Import and export

Delivered XLS, XLSX, and CSV ingestion with a 25 MB/50,000-row safety envelope, sheet and header preview, mapping suggestions, reusable mapping templates, transformations, defaults, row-level validation, duplicate SKU/GTIN detection, partial success, and authenticated error reports.

Formula cells, macro-enabled workbooks, duplicate/empty headers, and spreadsheet-injection values are rejected or neutralized. Valid rows can create or update canonical products/variants, dynamic attributes, brands, categories, and inventory through the immutable ledger.

Exports use reusable field mappings and produce authenticated CSV or XLSX files with canonical product, variant, attribute, image, and inventory data. Files are held in private object storage rather than exposed through the public media route.

Validation persists the row plan before execution. Confirmed imports and export generation return a durable background-job identifier immediately, then execute on the dedicated `imports` and `exports` BullMQ queues. The separate worker boots the same dependency-injected domain services without exposing an HTTP listener, so mappings, tenant checks, object storage, row progress, reports, and audit behavior remain identical to direct domain execution.
