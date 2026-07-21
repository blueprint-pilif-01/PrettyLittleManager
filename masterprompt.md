You are a Senior Software Architect, Senior Full-Stack Engineer, Database Architect,
DevOps Engineer and E-commerce Integration Specialist.

Your task is to design and incrementally build a production-ready web application
for Product Information Management, inventory management and multi-channel
e-commerce synchronization.

The application must act as the central source of truth for all product information,
product variants, GTIN/EAN codes, prices, stock, images and marketplace listings.

This application is not merely an inventory dashboard.

It is a reusable, multi-company and multi-channel PIM and inventory platform that
must initially support:

1. Central product management
2. Product variants and families
3. GS1 product registration data
4. Multiple client websites
5. eMAG Marketplace integration
6. XLS and CSV import/export
7. Centralized stock synchronization

The architecture must also be prepared for later implementation of:

- Order aggregation
- Shipping and AWB management
- Direct courier integrations
- Returns
- Invoices
- Additional marketplaces
- Analytics
- AI-assisted product content
- SaaS billing

Do not implement future modules prematurely. Build clear interfaces and abstractions
that allow them to be added later without rewriting the product, inventory or
integration modules.

==================================================
1. GENERAL PRODUCT VISION
==================================================

A product must be created only once in the central application.

The central application owns the product data.

Connected websites and marketplaces must consume or receive data from this
application.

The intended workflow is:

Create product
    ↓
Create product variants
    ↓
Complete shared product data
    ↓
Complete GS1-specific data
    ↓
Assign or import GTIN/EAN codes
    ↓
Publish product to one or more websites
    ↓
Check whether the EAN already exists on eMAG
    ↓
Attach an offer to an existing eMAG catalogue product
or
Create a new eMAG product
    ↓
Synchronize stock, price and publication status

The user must not manually recreate the same product separately on each website or
marketplace.

==================================================
2. IMPLEMENTATION STRATEGY
==================================================

Do not generate the complete codebase blindly.

Work in the following order:

1. Analyze all requirements.
2. Identify ambiguities and document assumptions.
3. Define the current version scope.
4. Define future modules separately.
5. Design the architecture.
6. Design the domain model.
7. Design the database schema.
8. Design API contracts.
9. Design external integration interfaces.
10. Design the frontend routes and user flows.
11. Design the permissions model.
12. Define validation rules.
13. Define synchronization and retry behavior.
14. Define testing and deployment strategy.
15. Implement the system in small, verifiable milestones.

Before implementation, produce:

- Architecture overview
- Domain boundaries
- Database entity list
- Entity relationship diagram
- API endpoint list
- Folder structure
- Permission matrix
- External integration design
- Current-version milestone plan
- Future feature roadmap
- Risk analysis

Do not combine unrelated modules into large services.

Do not put marketplace-specific logic inside the core Product or Inventory services.

==================================================
3. MANDATORY TECHNOLOGY STACK
==================================================

Use the following stack unless an existing repository already contains an equivalent
and technically justified stack.

Frontend:

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- shadcn/ui
- A secure rich text editor
- A drag-and-drop library for image and variant ordering

Do not use React and Vue together.

Backend:

- Node.js
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ or an equivalent Redis-backed queue
- Swagger / OpenAPI documentation

Storage:

- Cloudflare R2 or an S3-compatible object storage provider
- Public CDN URLs for marketplace images
- Private storage for confidential documents when required

Infrastructure:

- Docker
- Docker Compose for local development
- Production-ready container configuration
- VPS-compatible deployment
- Reverse proxy
- HTTPS
- Static public IP for eMAG API access
- Automated PostgreSQL backups

Testing:

- Vitest or Jest
- React Testing Library
- API integration tests
- End-to-end tests for critical workflows
- External connector contract tests using mocked sandbox responses

==================================================
4. REPOSITORY STRUCTURE
==================================================

Use a monorepo.

Recommended structure:

apps/
  web/
  api/
  worker/

packages/
  ui/
  types/
  validation/
  api-client/
  config/
  eslint-config/
  integrations/
  testing/

The API application handles:

- Authentication
- User-facing REST APIs
- Product management
- Inventory transactions
- Integration configuration
- Webhook and callback endpoints

The worker application handles:

- eMAG publishing
- Stock synchronization
- Import processing
- Export generation
- Image processing
- Periodic reconciliation
- Retry queues
- Future order synchronization

External API calls must not block normal frontend requests unnecessarily.

==================================================
5. MULTI-TENANT ARCHITECTURE
==================================================

The system must support multiple companies.

Each company may have:

- Multiple users
- Multiple websites
- Multiple warehouses
- Multiple marketplace accounts
- Multiple brands
- Multiple product catalogues
- Different pricing rules
- Different field templates
- Different API credentials

Every tenant-owned record must contain a companyId or equivalent tenant identifier.

Tenant separation must be enforced in:

- Database queries
- API guards
- Background jobs
- Audit logs
- Storage paths
- Integration credentials
- Export files
- Search indexes

Never trust a companyId supplied directly by the frontend.

Resolve tenant access from the authenticated session and verified membership.

The first release does not require SaaS subscriptions or self-service billing, but
the architecture must not prevent their later addition.

==================================================
6. AUTHENTICATION AND AUTHORIZATION
==================================================

Implement secure authentication.

Use:

- Short-lived access tokens
- Rotating refresh tokens
- HttpOnly secure cookies where appropriate
- Password hashing using Argon2 or an equivalent secure algorithm
- Session revocation
- Login attempt rate limiting
- Password reset flow
- Optional email verification
- Optional future two-factor authentication

Roles:

- Platform Super Admin
- Company Owner
- Company Admin
- Product Manager
- Inventory Manager
- Order Manager
- Employee
- Viewer

Do not rely only on broad roles.

Implement granular permissions such as:

- product.read
- product.create
- product.update
- product.delete
- product.publish
- product.export
- inventory.read
- inventory.adjust
- inventory.transfer
- integration.read
- integration.configure
- integration.sync
- orders.read
- orders.process
- shipping.create_awb
- returns.process
- users.manage
- audit.read

Support per-company membership and permissions.

==================================================
7. CENTRAL PRODUCT MODEL
==================================================

The central product model must be independent from eMAG, GS1 and any individual
website.

Support:

- Simple products
- Parent products
- Product variants
- Product families
- Draft products
- Archived products
- Future product bundles

A parent product contains shared information.

A product variant represents a commercially distinct sellable item.

Example:

Parent product:
Medical Scrub Set, Classic Model

Variants:
- Burgundy / S
- Burgundy / M
- Burgundy / L
- Burgundy / XL
- Burgundy / 2XL
- Navy / S
- Navy / M

Each variant may have its own:

- SKU
- GTIN/EAN
- Stock
- Price
- Cost
- Images
- Weight
- Dimensions
- Status
- Channel listing status

Shared parent data may include:

- Product name
- Brand
- Main description
- Short description
- Material information
- Composition
- Manufacturer
- Safety information
- SEO information
- Shared images
- Internal category

Implement controlled inheritance.

A variant may inherit a field from the parent or override it.

The UI must clearly show whether a value is:

- Inherited
- Overridden
- Empty
- Required by a channel

==================================================
8. CORE PRODUCT FIELDS
==================================================

Core fields should be implemented as typed database fields where they are universal
and frequently queried.

Core product fields:

- id
- companyId
- parentProductId
- productType
- status
- internalName
- publicName
- shortName
- slug
- brandId
- internalCategoryId
- description
- shortDescription
- safetyInformation
- manufacturerPartNumber
- defaultLanguage
- taxClass
- defaultVatRate
- defaultCurrency
- weight
- weightUnit
- length
- width
- height
- diameter
- dimensionUnit
- createdBy
- updatedBy
- createdAt
- updatedAt
- deletedAt

Core variant fields:

- id
- companyId
- parentProductId
- sku
- internalNumericId
- gtin
- gtinType
- variantName
- status
- basePrice
- costPrice
- currency
- weight override
- dimension overrides
- isDefaultVariant
- createdAt
- updatedAt

Use UUIDs for internal primary keys.

Some external systems such as eMAG require seller-controlled numeric identifiers.
Create a separate company-scoped numeric identifier for those integrations rather
than replacing internal UUIDs.

==================================================
9. HYBRID DYNAMIC ATTRIBUTE SYSTEM
==================================================

Do not hardcode every possible product field.

Do not make every field untyped and dynamic either.

Use a hybrid model:

- Typed core fields
- Configurable dynamic attributes
- Category templates
- Channel-specific mappings

Administrators must be able to create attributes without deploying new code.

Supported attribute types:

- Short text
- Long text
- Rich text
- Integer
- Decimal
- Boolean
- Date
- Date and time
- Single select
- Multi-select
- Color
- Measurement
- File
- Image
- URL
- Email
- JSON for strictly controlled advanced use

Each attribute definition must support:

- Internal key
- Display name
- Description
- Data type
- Scope: product or variant
- Required flag
- Default value
- Allowed values
- Minimum and maximum
- Regex validation
- Unit type
- Searchable flag
- Filterable flag
- Comparable flag
- Inheritable flag
- Display order
- Visibility
- Localization
- Active status

Category templates determine which fields are shown for a product category.

Example:

Medical uniforms template:

- Intended gender
- Medical industry
- Product type
- Size
- Color
- Material
- Composition
- Number of pockets
- Closure type
- Package contents
- Fit
- Sleeve type

==================================================
10. CATEGORY SYSTEM
==================================================

Keep these classifications separate:

- Internal product category
- Website category
- eMAG category
- GS1 GPC classification
- Future marketplace categories

Never assume that the same category identifier is valid across different systems.

Implement category mappings.

A central product category may map to:

- One category on Website A
- A different category on Website B
- One eMAG category
- One GS1 GPC code
- Future categories on other marketplaces

Mappings must be configurable per company and per channel.

==================================================
11. PRODUCT IMAGE MANAGEMENT
==================================================

Implement:

- Multiple image upload
- Drag-and-drop upload
- Image preview
- Main image selection
- Secondary image ordering
- Variant-specific images
- Parent image inheritance
- Image deletion
- Image replacement
- Image metadata
- Alt text
- Image processing status
- File size validation
- Dimension validation
- MIME type validation
- Duplicate detection
- Public CDN URL generation
- Optional automatic compression
- Optional WebP generation for websites
- Original file preservation when required

Store image order explicitly.

For eMAG API publishing, generate public URLs and map images to the expected
display type.

Support:

- Main image
- Secondary image
- Other image
- Image overwrite behavior

The marketplace connector must perform marketplace-specific validation before
publishing.

==================================================
12. PRODUCT DESCRIPTION AND SAFETY
==================================================

Provide separate fields for:

- Long e-commerce description
- Short description
- GS1 label description
- Safety warnings
- Manufacturer information
- EU responsible person information
- SEO title
- SEO description

Do not reuse one text field for all purposes.

Rich text must be sanitized on the backend.

Allow only a safe HTML subset.

Prevent:

- Script injection
- Embedded unsafe iframes
- Malicious links
- Unsupported marketplace HTML

Create channel-specific content transformations.

==================================================
13. PRODUCT FAMILY AND VARIATION MODEL
==================================================

Support product families.

A family must include:

- Internal family ID
- Family name
- Parent product
- Variation axes
- Variants
- Family status
- Channel-specific family metadata

Example variation axes:

- Size
- Color

Each variant must have a unique combination of variation values.

Prevent duplicate combinations.

Each variant may have:

- Unique SKU
- Unique GTIN
- Unique stock
- Unique price
- Unique images
- Unique publication state

Support eMAG-specific family data:

- Seller family ID
- Family name
- eMAG family type ID
- Variation characteristic mappings

Do not derive family data only from product names.

==================================================
14. GS1 MODULE
==================================================

Implement a dedicated GS1 registration module.

Do not assume that a direct GS1 API is available.

The initial implementation must support a reliable manual GS1 workflow.

Create a GS1 connector abstraction so direct API integration can be added later if
official API documentation, access and credentials become available.

GS1 fields identified for the current workflow:

- GTIN type
- Assigned GTIN
- Activity domain
- Product name
- Short product name
- Label description
- Promotional product flag
- Brand
- Internal code
- Packaging material
- Packaging type
- Net quantity
- Net quantity unit of measure
- Target markets
- Product status
- Product presentation URL
- Product image URL
- Height
- Height unit
- Width
- Width unit
- Length
- Length unit
- Diameter
- Diameter unit
- Romanian distribution networks
- Other distribution networks
- GPC code
- Responsibility confirmation
- Submission status
- Submission timestamp

Initial GTIN type:

- GTIN-13 / EAN-13

Prepare the model for later support of:

- GTIN-8
- GTIN-12
- GTIN-13
- GTIN-14
- Consumer units
- Inner packs
- Cases
- Pallets

Important rules:

- Net quantity is not inventory stock.
- GS1 GPC is not an eMAG category.
- GS1 label description is not the long marketplace description.
- Every commercially distinct variant must support a separate GTIN.
- Do not generate arbitrary GTIN values.
- Only allocate GTINs from company-owned GS1 ranges.
- Existing GTINs may be imported.
- GTIN uniqueness must be enforced per platform and globally within the application
  where appropriate.

Implement GTIN validation:

- Numeric validation
- Allowed length validation
- Check digit calculation
- Check digit verification
- Duplicate detection
- Unique database constraints
- Variant-level assignment
- Audit history

GS1 workflow statuses:

- NOT_STARTED
- DRAFT
- READY_FOR_REGISTRATION
- SUBMITTED_MANUALLY
- GTIN_ASSIGNED
- VALIDATION_FAILED
- ACTIVE
- INACTIVE

Manual GS1 workflow:

1. Complete central product information.
2. Complete GS1-specific information.
3. Validate all mandatory fields.
4. Generate a human-readable registration summary.
5. Optionally generate an export file.
6. Mark the product as submitted manually.
7. Allow the user to enter the assigned GTIN.
8. Validate the GTIN.
9. Save the GTIN on the correct variant.
10. Propagate the GTIN to website and marketplace listings.

==================================================
15. SALES CHANNEL ARCHITECTURE
==================================================

Create a generic channel system.

Channel types:

- WEBSITE
- EMAG
- FASHION_DAYS
- SHOPIFY
- WOOCOMMERCE
- AMAZON
- EBAY
- CUSTOM_API
- CUSTOM_EXPORT

Only WEBSITE and EMAG are required in the first implementation.

Create channel adapters.

Example:

interface SalesChannelAdapter {
  validateProduct(...)
  publishProduct(...)
  updateProduct(...)
  updatePrice(...)
  updateStock(...)
  updateStatus(...)
  readPublicationStatus(...)
  reconcile(...)
}

Do not place eMAG-specific behavior inside ProductService.

Each channel listing must store:

- companyId
- channelId
- productId or variantId
- externalProductId
- externalOfferId
- externalCategoryId
- publication status
- validation status
- synchronization status
- last synchronized timestamp
- last successful payload hash
- last error
- remote URL
- remote metadata

==================================================
16. WEBSITE CHANNELS
==================================================

Each company may connect multiple websites.

Each website may have:

- Different domain
- Different category structure
- Different product visibility
- Different price
- Different stock buffer
- Different currency
- Different language
- Different SEO information
- Different image selection
- Different publication status

The central application remains the source of truth.

Provide secure APIs for websites:

- Read products
- Read product variants
- Read categories
- Search products
- Read prices
- Read available stock
- Read product details
- Read website-specific SEO data
- Submit orders in a future phase
- Submit order cancellations in a future phase

Use API keys, signed requests or OAuth-style client credentials for website
integrations.

Do not expose administrative APIs publicly without authentication.

Support cache headers and optional webhooks for website cache invalidation.

==================================================
17. EMAG INTEGRATION
==================================================

Implement an eMAG Marketplace adapter based on the provided eMAG and Fashion Days
Marketplace API specification.

All eMAG communication must be performed by the backend or worker.

Never expose eMAG credentials in the frontend.

Use server-side Basic Authentication as required by the eMAG API.

Store credentials encrypted at rest.

The production eMAG integration requires:

- API access enabled for the seller account
- A backend server with a stable public IP
- The server IP whitelisted by eMAG
- HTTPS
- Secure callback endpoints where used
- Firewall configuration for approved eMAG callback source IPs

Create separate configuration for:

- eMAG Romania
- eMAG Bulgaria
- eMAG Hungary
- Fashion Days Romania
- Fashion Days Bulgaria

The first implementation only needs eMAG Romania, but the connector architecture
must support the others.

==================================================
18. EMAG CATEGORY AND CHARACTERISTIC SYNC
==================================================

Use eMAG category APIs to retrieve:

- Categories
- Characteristics
- Accepted characteristic values
- Family types
- EAN requirements
- Warranty requirements
- VAT identifiers
- Handling time values

Do not hardcode eMAG category characteristics.

After selecting an eMAG category, dynamically render the required product form.

Store the eMAG characteristic ID, not only the display name.

Each synced characteristic should store:

- eMAG characteristic ID
- eMAG category ID
- Name
- Type
- Accepted values
- Required status
- Restrictive status
- Filter status
- Multiple-value support
- Optional tag behavior
- Last synchronization timestamp
- Raw source metadata

The UI must separate characteristics into logical groups such as:

- Basic characteristics
- Standard characteristics
- Advanced characteristics
- Other characteristics

The exact grouping may be based on API metadata or local presentation rules.

==================================================
19. EMAG PRODUCT AND OFFER FIELDS
==================================================

Support all relevant eMAG product and offer fields.

Product documentation fields:

- Seller internal numeric product ID
- eMAG category ID
- Seller category ID
- Product name
- Brand
- Manufacturer part number
- part_number_key
- Source language
- Description
- Images
- Characteristics
- Product URL
- Warranty
- EAN list
- Attachments
- Family data
- Safety information
- Manufacturer details
- EU responsible person details

Offer fields:

- Status
- Sale price
- Recommended price / PRP
- Minimum sale price
- Maximum sale price
- Currency
- VAT ID
- Stock
- Handling time
- Supply lead time
- Start date
- eMAG Genius eligibility
- Green tax where supported

Volumetric fields:

- Length
- Width
- Height
- Weight

Publication metadata:

- eMAG offer ID
- eMAG product ID
- part_number_key
- Validation status
- Offer validation status
- Translation validation status
- Documentation errors
- Remote product URL
- Last request
- Last response
- Last synchronization
- Retry count

==================================================
20. EMAG PRICE RULES
==================================================

Store all money values using decimal-safe database types.

Never use floating-point arithmetic for business calculations.

Clearly distinguish:

- Price excluding VAT
- Price including VAT
- VAT rate
- VAT identifier required by eMAG
- Recommended price
- Minimum accepted price
- Maximum accepted price
- Promotional price
- Website-specific price
- Marketplace-specific price

For eMAG:

- sale_price is sent without VAT
- recommended_price is sent without VAT
- min_sale_price is sent without VAT
- max_sale_price is sent without VAT
- VAT is sent separately using vat_id
- recommended_price must be greater than sale_price when supplied
- max_sale_price must be greater than min_sale_price

The interface should show both net and gross amounts.

Do not silently change user-entered pricing.

Display validation errors before publication.

==================================================
21. EMAG EAN LOOKUP AND OFFER ATTACHMENT
==================================================

Before creating a new eMAG catalogue product, check whether the EAN already exists.

Use the eMAG EAN lookup flow.

For each EAN, display:

- Existing product name
- Brand
- Category
- Product image
- eMAG product URL
- part_number_key
- Whether a new offer may be added
- Whether the seller already has an offer

If the product exists and the seller may add an offer:

- Allow attachment to the existing product
- Use part_number_key
- Do not submit duplicate product documentation unnecessarily

If no matching product exists:

- Allow creation of a new product
- Require all necessary documentation
- Validate category requirements

Make the user explicitly confirm the chosen publication path.

==================================================
22. EMAG PUBLISHING OPERATIONS
==================================================

Support these operations:

- Save eMAG draft
- Publish new product and offer
- Attach offer to existing product
- Update existing offer
- Update price only
- Update stock only
- Update status only
- Update handling time
- Update warranty where supported
- Update product documentation
- Read product and offer status
- Read documentation errors
- Retry failed synchronization
- Batch publish
- Reconcile local and remote state

Treat product publication and offer update as different operations.

Do not resend complete documentation for simple stock changes.

Support the eMAG request conventions:

- Save and write operations wrap payloads in a data key
- Read and count operations use top-level filters
- API parameter names are key-sensitive
- Bulk save requests must be split into supported batch sizes
- Rate limits must be enforced centrally
- HTTP 429 must trigger controlled backoff
- Invalid requests also consume rate limits

Implement separate rate-limit buckets for:

- Order resources
- Other eMAG resources
- EAN lookup resources

Use:

- Queue throttling
- Exponential backoff
- Jitter
- Retry limits
- Dead-letter queues
- Manual retry
- Idempotency
- Payload hashing

Important eMAG behavior:

A product save may return an error related to documentation while the offer was still
accepted for processing.

Do not assume that isError alone always means nothing was created.

After uncertain responses, schedule a read/reconciliation operation.

==================================================
23. EMAG API LIMITS AND LOGGING
==================================================

Respect the documented limits, including:

- Maximum supported bulk sizes
- Maximum request element limits
- Separate order and non-order rate limits
- EAN lookup limits
- Pagination rules

Never process thousands of products in one request.

Create an IntegrationRequestLog model containing:

- companyId
- integrationId
- operation
- endpoint
- HTTP method
- request ID
- correlation ID
- entity type
- entity ID
- sanitized request payload
- sanitized response payload
- response status
- external error messages
- retry count
- duration
- createdAt
- expiresAt

Never log passwords or authorization headers.

Retain eMAG request and response logs for at least 30 days unless company policy
requires longer retention.

Provide alerts for:

- Repeated authentication failures
- Rate-limit failures
- Product publishing failures
- Stock synchronization failures
- Callback verification failures
- Long-running synchronization jobs

==================================================
24. XLS AND CSV IMPORT
==================================================

Implement a reusable import engine.

Supported initial formats:

- XLS
- XLSX
- CSV

Import workflow:

1. Upload file.
2. Validate file type and size.
3. Select workbook sheet.
4. Select the row containing column headers.
5. Preview rows.
6. Automatically suggest mappings.
7. Allow manual column mapping.
8. Save mapping template.
9. Configure file-level defaults.
10. Validate all products.
11. Display warnings and blocking errors.
12. Import valid rows.
13. Generate an import report.

Support fields such as:

- Product name
- Brand
- SKU
- Internal product ID
- EAN
- Price
- VAT
- Stock
- Status
- Category
- Description
- Images
- Dynamic attributes

Mapping templates must be reusable.

Example saved mappings:

- eMAG product import
- Client legacy inventory
- GS1 export format
- Website A import
- Supplier inventory import

Detect and reject or warn about:

- Duplicate SKU
- Duplicate GTIN
- Missing required columns
- Invalid numeric formats
- Invalid VAT
- Invalid currency
- Invalid image URLs
- Formula cells
- External spreadsheet references
- Unsupported macros
- Empty header names
- Duplicate header names

Do not execute spreadsheet formulas or macros.

==================================================
25. EXPORT ENGINE
==================================================

Implement a configurable export engine.

Initial exports:

- eMAG-compatible XLS or XLSX
- eMAG-compatible CSV where applicable
- Generic product XLSX
- Generic product CSV
- GS1 registration summary
- Website product export
- Custom mapped export

The export engine must use mappings.

Do not embed export-specific logic directly inside ProductService.

Recommended flow:

Central product
    ↓
Canonical export model
    ↓
Channel mapping
    ↓
Template renderer
    ↓
XLSX or CSV file

Export mappings must support:

- Source field
- Destination column
- Required status
- Default value
- Value transformation
- Unit conversion
- Date format
- Decimal format
- Boolean mapping
- Enumeration mapping
- Concatenation
- Variant expansion
- Language selection

Store export history.

Allow the user to download the generated file.

==================================================
26. INVENTORY MODEL
==================================================

The central application must own inventory.

Do not allow every channel to independently become the stock authority.

Support:

- Warehouses
- Warehouse locations
- Physical stock
- Reserved stock
- Available stock
- Incoming stock
- Damaged stock
- Quarantined stock
- Safety stock
- Channel stock buffer
- Manual adjustments
- Transfers
- Stock counts
- Stock movement history

Core formula:

availableStock =
physicalStock
- reservedStock
- safetyStock
- unavailableStock

Stock published to a channel may be:

channelAvailableStock =
max(availableStock - channelBuffer, 0)

The exact formula must be configurable by company and channel.

Never store only a mutable stock number without movement history.

Use an immutable stock movement ledger.

Movement types:

- INITIAL
- RECEIPT
- SALE_RESERVATION
- RESERVATION_RELEASE
- SALE_COMPLETION
- RETURN_RECEIPT
- MANUAL_INCREASE
- MANUAL_DECREASE
- TRANSFER_OUT
- TRANSFER_IN
- DAMAGED
- CORRECTION

Use PostgreSQL transactions and row-level locking where required.

Prevent overselling caused by concurrent operations.

==================================================
27. STOCK SYNCHRONIZATION
==================================================

Stock synchronization flow:

Website or marketplace order
    ↓
Create idempotent reservation
    ↓
Recalculate central available stock
    ↓
Queue stock updates for all active channels
    ↓
Record synchronization result
    ↓
Retry failures
    ↓
Periodic reconciliation

For eMAG, support stock-only synchronization through the dedicated stock update
operation or the lightweight offer update flow.

Do not update eMAG directly from the browser.

Store:

- Last intended stock
- Last successfully published stock
- Last remote stock read
- Sync status
- Last error
- Retry count
- Last sync timestamp

Synchronization statuses:

- NOT_SYNCED
- QUEUED
- IN_PROGRESS
- SYNCED
- FAILED
- PARTIALLY_SYNCED
- RECONCILIATION_REQUIRED

Implement periodic reconciliation.

Do not assume that a successful HTTP response guarantees that the remote catalogue
state already matches local state.

==================================================
28. FIRST RELEASE SCOPE
==================================================

The first production release must implement:

1. Authentication
2. Company and user management
3. Role and permission system
4. Multiple website/channel configuration
5. Central products
6. Product parents and variants
7. Product families
8. Hybrid attribute system
9. Category templates
10. Image management
11. GS1 data storage and manual registration workflow
12. GTIN validation
13. Warehouses
14. Stock ledger
15. Stock availability calculation
16. XLS/XLSX/CSV import
17. Saved import mappings
18. XLS/XLSX/CSV export
19. eMAG account configuration
20. eMAG category synchronization
21. eMAG characteristic synchronization
22. eMAG VAT and handling-time synchronization
23. EAN lookup
24. eMAG draft publication
25. eMAG product publication
26. Existing product offer attachment
27. eMAG price, stock and status updates
28. Publication status and error display
29. Website read APIs
30. Audit logs
31. Background job queues
32. Docker deployment
33. Static-IP-compatible production configuration
34. Integration logs and retry management

Do not implement full order, shipping and returns interfaces in the first milestone
unless explicitly instructed after the first release is stable.

However, create clean boundaries that allow those modules to be added.

==================================================
29. FUTURE PHASE: ORDER MANAGEMENT
==================================================

Plan but do not fully implement in the first release.

Future order module:

- Import orders from all websites
- Read eMAG orders
- Normalize orders into a central model
- Acknowledge eMAG orders
- Reserve inventory
- Release reservations
- Prepare orders
- Cancel orders
- Support storno operations
- Display payment method
- Display fulfillment type
- Store customer and delivery data
- Attach invoices and warranties
- Maintain external order status history
- Prevent duplicate order imports through idempotency

Normalized order model:

- companyId
- channelId
- externalOrderId
- internalOrderNumber
- customer
- billing address
- shipping address
- products
- quantities
- unit prices
- VAT
- discounts
- currency
- payment method
- fulfillment type
- order status
- payment status
- inventory reservation status
- shipping status
- createdAt
- importedAt
- updatedAt

==================================================
30. FUTURE PHASE: SHIPPING AND AWB
==================================================

Plan but do not fully implement in the first release.

Future shipping module must support:

For eMAG orders:

- Read available courier accounts
- Read pickup and return addresses
- Read valid localities
- Create AWB
- Read AWB
- Store AWB number
- Store AWB barcode
- Store cash on delivery
- Download A4, A5 or A6 labels
- Download or generate ZPL labels
- Read AWB status
- Receive AWB callbacks
- Store package dimensions
- Store predefined packages
- Read order volumetric data
- Generate delivery and return AWBs

For website orders:

- Sameday adapter
- Fan Courier adapter
- Cargus adapter
- DPD adapter
- Future courier adapters

Use a generic CourierAdapter interface.

Example:

interface CourierAdapter {
  validateAddress(...)
  listServices(...)
  estimateDelivery(...)
  createShipment(...)
  cancelShipment(...)
  readShipment(...)
  downloadLabel(...)
  trackShipment(...)
  createReturnShipment(...)
}

Central shipping entities:

- Shipment
- ShipmentPackage
- CourierAccount
- PickupAddress
- ReturnAddress
- TrackingEvent
- ShippingLabel
- CashOnDelivery
- ShipmentError

==================================================
31. FUTURE PHASE: RETURNS
==================================================

Plan but do not fully implement in the first release.

Future returns module:

- Read eMAG return requests
- Acknowledge returns
- Mark return as received
- Reject return
- Finalize return
- Create return AWB
- Receive returned stock
- Decide whether stock is sellable, damaged or quarantined
- Refund integration
- Return status history
- Website return portal
- Return reason analytics

Do not directly increase sellable stock when a return arrives.

Returned products must pass through an inspection state.

==================================================
32. FUTURE PHASE: INVOICES AND ACCOUNTING
==================================================

Plan but do not fully implement in the first release.

Future features:

- Read eMAG invoice data
- Read customer invoice data
- Upload invoices to eMAG orders
- Upload warranties
- Integrate FGO
- Generate invoices for website orders
- e-Factura integration through the selected invoicing provider
- Storno invoices
- Payment reconciliation
- Export accounting reports

Keep marketplace invoice data separate from invoices issued by the seller.

==================================================
33. FUTURE PHASE: ADDITIONAL CHANNELS
==================================================

Prepare adapters for:

- Fashion Days
- Shopify
- WooCommerce
- Amazon
- eBay
- Altex
- Custom client websites
- Supplier feeds

Do not implement them until requested.

Adding a new channel must not require changing the central product schema unless the
channel introduces genuinely universal data.

Channel-specific data belongs in channel listing models or dynamic mappings.

==================================================
34. FUTURE PHASE: AI FEATURES
==================================================

Plan but do not implement by default.

Possible later features:

- Product title suggestions
- Description generation
- SEO title generation
- SEO description generation
- Attribute extraction from supplier files
- Automatic category suggestions
- Image quality checks
- Background removal
- Translation suggestions
- Duplicate product detection
- Missing field suggestions
- Marketplace validation explanation

AI-generated content must never be published automatically without explicit approval.

Store:

- Generated content
- Original content
- Model metadata
- User approval status
- Generation timestamp

==================================================
35. FUTURE PHASE: ANALYTICS
==================================================

Possible later analytics:

- Stock value
- Low-stock products
- Dead stock
- Fast-moving products
- Sales by channel
- Margin by product
- Synchronization failure rate
- Marketplace rejection reasons
- Return rate
- Courier performance
- Order processing time
- Product completeness score
- Conversion-related attribute completeness

Do not build a data warehouse in the first release.

Design event and audit data so analytics can be added later.

==================================================
36. AUDIT LOGGING
==================================================

Log all important business actions.

Examples:

- User login
- User logout
- Product created
- Product edited
- Product archived
- Variant created
- SKU changed
- GTIN assigned
- Price changed
- Stock adjusted
- Product published
- Product unpublished
- eMAG synchronization triggered
- eMAG synchronization failed
- Import completed
- Export generated
- Integration credentials changed
- User permissions changed

Audit records must contain:

- companyId
- userId
- action
- entity type
- entity ID
- before state where safe
- after state where safe
- IP address
- user agent
- timestamp
- correlation ID

Do not store passwords, tokens or raw secret values in audit records.

==================================================
37. NOTIFICATIONS
==================================================

Implement in-app notifications for:

- Low stock
- Out of stock
- Invalid GTIN
- Missing required fields
- eMAG publication failure
- eMAG documentation rejection
- eMAG invalid price
- Stock synchronization failure
- Import errors
- Export completion
- Integration authentication failure

Prepare for future:

- Email notifications
- Slack notifications
- SMS notifications
- Web push notifications

Avoid sending duplicate notifications for the same unresolved incident.

==================================================
38. SEARCH AND FILTERING
==================================================

Implement product search across:

- Product name
- SKU
- GTIN/EAN
- Brand
- Internal category
- Variant values
- Dynamic attributes
- eMAG external IDs
- Website listing IDs

Support filters:

- Status
- Brand
- Category
- Stock status
- Publication status
- eMAG validation status
- Missing GTIN
- Missing images
- Missing required data
- Company
- Website
- Warehouse
- Date range

Use PostgreSQL search initially.

Prepare an abstraction for future Elasticsearch or OpenSearch only if scale later
requires it.

==================================================
39. ADMIN INTERFACE
==================================================

Build a modern professional SaaS-style dashboard.

Primary navigation:

- Dashboard
- Products
- Product Families
- Categories
- Attributes
- Inventory
- Warehouses
- Imports
- Exports
- Channels
- Websites
- eMAG
- GS1
- Synchronization
- Users
- Audit Logs
- Settings

Future navigation:

- Orders
- Shipping
- Returns
- Invoices
- Analytics

Product editor sections:

- General information
- Variants
- Images
- Descriptions
- Attributes
- Inventory
- Prices
- GS1
- Websites
- eMAG
- Validation
- History

Provide:

- Auto-save drafts
- Unsaved changes warning
- Clear validation summary
- Section-level error indicators
- Loading states
- Empty states
- Retry actions
- Accessible forms
- Responsive layout
- Light mode
- Dark mode

Do not copy the outdated eMAG visual design.

Create a cleaner interface while preserving the required data and workflow.

==================================================
40. VALIDATION ENGINE
==================================================

Create a reusable validation engine.

Validation levels:

- Information
- Warning
- Blocking error

Validation scopes:

- Central product
- Variant
- GS1
- Website
- eMAG
- Inventory
- Export

Examples:

- Missing product name
- Duplicate SKU
- Invalid GTIN
- Missing required eMAG category characteristic
- Invalid image URL
- PRP lower than sale price
- Minimum price greater than maximum price
- Missing VAT ID
- Missing manufacturer information
- Missing EU responsible person where required
- Missing stock
- Invalid family variation combination
- Product active but not publishable
- Channel mapping missing

Return structured validation results:

- code
- severity
- entity
- field
- message
- suggested resolution

Do not return only generic text errors.

==================================================
41. SECURITY REQUIREMENTS
==================================================

Implement:

- Strict DTO validation
- Input sanitization
- Output encoding
- Secure CORS policy
- CSRF protection where cookie authentication is used
- Rate limiting
- Secure headers
- Secret encryption
- Least-privilege access
- Tenant isolation
- File upload scanning strategy
- File type verification by content
- Signed private file URLs
- Public image URL controls
- Database transaction safety
- SQL injection prevention through ORM and parameterization
- SSRF protection for imported image URLs
- Webhook signature or source validation
- Dependency vulnerability scanning

Do not trust marketplace callbacks only because they reach the callback route.

Validate source, payload and idempotency.

==================================================
42. API DESIGN
==================================================

Use REST APIs with versioning:

/api/v1/

Use:

- Pagination
- Filtering
- Sorting
- Consistent error format
- Correlation IDs
- Idempotency keys
- Swagger documentation
- Typed frontend API client
- OpenAPI-generated types where practical

Example domains:

/api/v1/auth
/api/v1/companies
/api/v1/users
/api/v1/products
/api/v1/product-families
/api/v1/variants
/api/v1/categories
/api/v1/attributes
/api/v1/images
/api/v1/warehouses
/api/v1/inventory
/api/v1/imports
/api/v1/exports
/api/v1/channels
/api/v1/websites
/api/v1/integrations/emag
/api/v1/integrations/gs1
/api/v1/sync-jobs
/api/v1/audit-logs

Future:

/api/v1/orders
/api/v1/shipments
/api/v1/returns
/api/v1/invoices

==================================================
43. DATABASE REQUIREMENTS
==================================================

Use PostgreSQL.

Use:

- UUID primary keys internally
- Explicit foreign keys
- Unique constraints
- Composite tenant-scoped constraints
- Decimal types for money
- Timestamps with timezone
- Soft deletion where appropriate
- Immutable ledger records for inventory
- JSONB only where flexibility is justified
- Database indexes based on real query paths

Potential entities:

- Company
- User
- CompanyMembership
- Role
- Permission
- RolePermission
- Website
- SalesChannel
- ChannelCredential
- Brand
- Product
- ProductVariant
- ProductFamily
- ProductFamilyMember
- Category
- CategoryMapping
- AttributeDefinition
- AttributeOption
- ProductAttributeValue
- VariantAttributeValue
- ProductImage
- ProductImageAssignment
- Gs1Registration
- GtinAssignment
- Warehouse
- WarehouseLocation
- InventoryBalance
- InventoryMovement
- InventoryReservation
- PriceList
- ProductPrice
- ChannelListing
- EmagAccount
- EmagCategory
- EmagCharacteristic
- EmagCharacteristicValue
- EmagProductListing
- EmagCharacteristicMapping
- ImportJob
- ImportMapping
- ImportRowResult
- ExportJob
- ExportTemplate
- SyncJob
- SyncAttempt
- IntegrationRequestLog
- Notification
- AuditLog

Future entities:

- Order
- OrderItem
- Shipment
- ShipmentPackage
- TrackingEvent
- ReturnRequest
- Invoice

==================================================
44. OBSERVABILITY
==================================================

Implement:

- Structured logs
- Correlation IDs
- Job IDs
- Integration request IDs
- Error tracking
- Health checks
- Readiness checks
- Database health
- Redis health
- Storage health
- Queue health
- eMAG connector health status

Provide operational screens for:

- Failed jobs
- Pending jobs
- Retried jobs
- Dead-letter jobs
- Integration errors
- Last successful synchronization

Do not rely only on console.log.

==================================================
45. DEPLOYMENT
==================================================

Prepare deployment for a VPS with a static public IP.

Production services:

- Reverse proxy
- Frontend
- API
- Worker
- PostgreSQL
- Redis
- Object storage integration
- Scheduled backup process

Use environment variables.

Provide:

- .env.example
- Development Docker Compose
- Production deployment documentation
- Database migration instructions
- Backup and restore instructions
- Static IP and eMAG whitelist instructions
- HTTPS instructions
- Health-check instructions
- Rollback strategy

Never commit real secrets.

==================================================
46. TESTING REQUIREMENTS
==================================================

Write tests for critical logic:

- Tenant isolation
- Permission checks
- SKU uniqueness
- GTIN check digit validation
- GTIN uniqueness
- Product inheritance
- Variant combination uniqueness
- Price calculations
- VAT calculations
- Inventory reservation
- Concurrent stock changes
- Import mapping
- Import validation
- Export mapping
- eMAG payload transformation
- eMAG rate-limit handling
- eMAG retry behavior
- EAN lookup decisions
- Product publication reconciliation

Use mocked connectors for automated tests.

Never run destructive tests against production marketplace accounts.

==================================================
47. ACCEPTANCE CRITERIA FOR VERSION 1
==================================================

Version 1 is considered functional when a company administrator can:

1. Create a company.
2. Invite users.
3. Assign permissions.
4. Configure one or more websites.
5. Configure an eMAG account.
6. Create an internal product category.
7. Create a parent product.
8. Create size and color variants.
9. Assign unique SKUs.
10. Enter GS1 product data.
11. Add or import valid GTINs.
12. Upload and reorder images.
13. Complete descriptions and safety data.
14. Configure stock in a warehouse.
15. Import products from XLSX or CSV.
16. Export products to a reusable eMAG-compatible file.
17. Synchronize eMAG categories and characteristics.
18. Map an internal category to an eMAG category.
19. Complete dynamic eMAG characteristics.
20. Check whether an EAN exists on eMAG.
21. Attach an offer to an existing eMAG product.
22. Publish a new product when no match exists.
23. Update eMAG price.
24. Update eMAG stock.
25. Activate or deactivate an eMAG offer.
26. See publication and validation status.
27. See understandable eMAG errors.
28. Retry a failed synchronization.
29. Expose product data to a connected website.
30. View a full audit history.

==================================================
48. CODING RULES
==================================================

Write production-quality code.

Use:

- Strong TypeScript typing
- Dependency injection
- Domain-focused modules
- Small services
- Reusable validation
- Reusable adapters
- Explicit transactions
- Clear error handling
- Meaningful names
- Database migrations
- Seed data for development
- Documentation for non-obvious behavior

Do not:

- Use any as a shortcut
- Hardcode credentials
- Hardcode tenant IDs
- Hardcode eMAG categories
- Hardcode dynamic eMAG characteristics
- Store money as floating point
- Store stock without movement history
- Call eMAG directly from React
- Expose integration credentials to the browser
- Swallow API errors
- Retry forever
- Build marketplace logic into ProductService
- Assume GS1 direct API access exists
- Generate arbitrary GTIN codes
- Automatically publish AI-generated content
- Implement future modules before the core is stable

==================================================
49. REQUIRED FIRST RESPONSE
==================================================

Do not start by generating application code.

Your first response must contain:

1. A concise summary of the proposed system.
2. Current version scope.
3. Future feature scope.
4. Architecture diagram in text form.
5. Domain module list.
6. Initial database entity list.
7. External integration architecture.
8. Main user workflows.
9. Security model.
10. Deployment model.
11. Implementation milestones.
12. Major risks and mitigations.
13. Questions or assumptions that block correct implementation.

After presenting the plan, wait for approval before generating the first
implementation milestone.

When implementation begins, complete one milestone at a time and include:

- Files created
- Files changed
- Database migrations
- Environment variables
- Commands to run
- Tests added
- Manual verification steps
- Remaining limitations

==================================================
50. PERFORMANCE AND SCALABILITY REQUIREMENTS
==================================================

Performance must be treated as a core architectural requirement, not as a later
optimization.

The application must remain responsive with:

- Large product catalogues
- Thousands of product variants
- Multiple companies
- Multiple websites
- Multiple warehouses
- Large inventory movement histories
- Concurrent users
- Batch imports
- Marketplace synchronization jobs

ARCHITECTURAL RULES

Do not execute slow external integrations synchronously inside normal user-facing
HTTP requests.

Operations such as:

- eMAG publication
- Bulk stock synchronization
- Product import
- Export generation
- Image processing
- Reconciliation
- Category synchronization
- Large validation operations

must run through background queues when they may take more than a normal request
cycle.

The API should immediately return a job identifier and allow the frontend to display
progress.

DATABASE PERFORMANCE

Use PostgreSQL indexes for real access patterns.

At minimum, evaluate indexes for:

- companyId
- product status
- parentProductId
- SKU
- GTIN
- brandId
- categoryId
- warehouseId
- channelId
- publication status
- synchronization status
- createdAt
- updatedAt
- external product and offer IDs

Use composite indexes for tenant-scoped queries.

Examples:

- companyId + sku
- companyId + gtin
- companyId + status
- companyId + internalCategoryId
- companyId + channelId + synchronizationStatus
- warehouseId + productVariantId

Avoid:

- N+1 queries
- Loading complete relation graphs unnecessarily
- Unbounded database queries
- Full table scans for normal dashboard operations
- Storing frequently queried structured data only inside JSONB
- Selecting unused database columns

Use database query logging and EXPLAIN ANALYZE when optimizing slow queries.

PAGINATION

All potentially large collections must use server-side pagination.

This includes:

- Products
- Variants
- Inventory movements
- Audit logs
- Import rows
- Export history
- Synchronization jobs
- Notifications
- Future orders
- Future shipments
- Future returns

Do not load all records into the browser.

Use cursor pagination for large or frequently changing datasets when offset pagination
would become inefficient.

CACHING

Use Redis caching only where it provides measurable benefit.

Suitable cached data may include:

- eMAG categories
- eMAG characteristics
- VAT values
- Handling time values
- Permission results
- Company configuration
- Website catalogue responses
- Frequently accessed product summaries
- Dashboard aggregates

Each cache entry must define:

- Cache key
- Tenant scope
- Expiration time
- Invalidation rule
- Fallback behavior

Never allow cache keys to leak data between companies.

Do not cache inventory availability without a safe invalidation strategy.

WEBSITE API PERFORMANCE

Website-facing product APIs should support:

- Cache-Control headers
- ETags
- Conditional requests
- Response compression
- CDN caching where appropriate
- Field selection
- Pagination
- Filtering
- Sorting

Public catalogue endpoints should return optimized read models rather than exposing
the full internal product structure.

Create dedicated read projections for:

- Product lists
- Product detail pages
- Search results
- Category pages
- Stock availability
- Price availability

Do not build every website response from deeply nested transactional tables during
every request when a read model or cache is more appropriate.

FRONTEND PERFORMANCE

Implement:

- Route-based code splitting
- Lazy loading
- Dynamic imports
- Virtualized tables for large datasets
- Debounced search
- Server-side filtering
- Server-side sorting
- Optimistic updates only when safe
- Query caching with TanStack Query
- Request cancellation
- Image lazy loading
- Image thumbnails
- Avoidance of unnecessary React rerenders
- Memoization only where measured and justified

Do not render thousands of products or inventory movements directly into the DOM.

Use virtualized rows for large tables.

Do not download full-resolution marketplace images for table thumbnails.

IMPORT AND EXPORT PERFORMANCE

Process imports and exports using background jobs.

Imports must:

- Stream large files where practical
- Process rows in batches
- Avoid loading entire workbooks into memory when unnecessary
- Report progress
- Store row-level errors
- Allow partial success
- Prevent duplicate processing
- Support safe retry

Exports must:

- Generate files asynchronously
- Stream results where supported
- Store files in object storage
- Use expiring signed download links where files are private
- Avoid keeping large generated files in API memory

QUEUE PERFORMANCE

Use separate queues for different workloads:

- marketplace-publication
- stock-sync
- imports
- exports
- image-processing
- reconciliation
- notifications
- future-orders
- future-shipping

Configure:

- Concurrency per queue
- Rate limits
- Retry policies
- Job timeout
- Backoff
- Dead-letter behavior
- Job deduplication
- Idempotency
- Priority

A large import must not block urgent stock synchronization jobs.

INVENTORY PERFORMANCE AND CONSISTENCY

Inventory accuracy is more important than raw speed.

Use:

- Atomic database operations
- Row-level locking where necessary
- Idempotent reservations
- Unique transaction identifiers
- Immutable stock movements
- Short database transactions
- Controlled retry for serialization conflicts

Do not calculate stock by summing the complete inventory ledger on every request.

Maintain a current InventoryBalance projection and verify it against the immutable
ledger during reconciliation.

IMAGE PERFORMANCE

Use object storage and CDN delivery.

Generate:

- Thumbnail size
- Medium preview size
- Original image
- Website-optimized format where needed

Store image metadata so the frontend does not need to inspect files repeatedly.

Do not proxy all public image traffic through the Node.js API.

OBSERVABILITY AND PERFORMANCE MONITORING

Measure:

- API response time
- Database query time
- Queue wait time
- Queue execution time
- External API latency
- Cache hit rate
- Error rate
- Import throughput
- Export duration
- Stock synchronization delay
- Frontend bundle size
- Core Web Vitals for public website integrations

Log slow operations with correlation IDs.

Create alerts for:

- Slow API endpoints
- Slow database queries
- Growing queue backlogs
- Failed background jobs
- High Redis memory usage
- Database connection exhaustion
- Increased eMAG latency
- Stock synchronization delays

PERFORMANCE TARGETS

Treat these as initial engineering targets, not absolute guarantees:

- Normal authenticated API reads: p95 below 500 ms
- Normal API writes excluding external integrations: p95 below 800 ms
- Product search response: p95 below 700 ms
- Stock availability read: p95 below 300 ms
- Dashboard initial data response: below 1 second where cached
- Frontend route transitions: visually responsive without full-page reloads
- External integration operations: asynchronous when they cannot reliably meet the
  normal API response targets

Performance tests must be performed with realistic data volumes.

LOAD TESTING

Create load tests for:

- Product listing
- Product search
- Stock availability
- Concurrent inventory reservations
- Batch stock synchronization
- Large imports
- Large exports
- Multiple companies using the system concurrently

Test at minimum with:

- 100,000 products
- 500,000 product variants
- 1,000,000 inventory movements
- 100 concurrent administrative users
- Multiple synchronization workers

The test data may be synthetic.

SCALABILITY

The first deployment may run on a single VPS, but the architecture must allow:

- API horizontal scaling
- Worker horizontal scaling
- Separate managed PostgreSQL
- Separate managed Redis
- External object storage
- Load balancing
- Read replicas when eventually justified

Do not introduce microservices prematurely.

Start with a modular monolith plus separate worker process.

Split services only when there is a demonstrated operational or scaling need.