# Milestone 03 — Inventory ledger and availability

Delivered a tenant-scoped, immutable inventory ledger with current balance projections for physical, reserved, incoming, damaged, quarantined, and safety-stock buckets. Receipts, adjustments, reservations, releases, completions, transfers, and physical stock counts are idempotent and audited.

Availability is calculated as `onHand - reserved - damaged - quarantined - safetyStock`, clamped only at the channel boundary. Mutations run in short serializable PostgreSQL transactions with row-level locks and retry serialization conflicts. The concurrent integration test verifies that two simultaneous reservations cannot oversell the same balance.

Every committed availability change updates active channel listing intent in the same transaction. Active eMAG listings also create a transactional outbox job for the dedicated `stock-sync` queue, ensuring stock-only remote updates are neither browser-driven nor silently lost between database commit and Redis publication.
