import { z } from "zod";
import { isValidGtin } from "./gtin";

export * from "./permissions";
export * from "./gtin";

export const productStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "ACTIVE",
  "ARCHIVED",
]);

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, "Use a non-negative decimal value");

export const createVariantSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    internalNumericId: z.number().int().positive(),
    variantName: z.string().trim().min(1).max(180),
    status: productStatusSchema.default("DRAFT"),
    gtin: z.string().trim().optional(),
    basePrice: decimalStringSchema.optional(),
    costPrice: decimalStringSchema.optional(),
    currency: z.string().trim().length(3).default("RON"),
    weight: decimalStringSchema.optional(),
    weightUnit: z.string().trim().max(12).optional(),
    length: decimalStringSchema.optional(),
    width: decimalStringSchema.optional(),
    height: decimalStringSchema.optional(),
    diameter: decimalStringSchema.optional(),
    dimensionUnit: z.string().trim().max(12).optional(),
    isDefaultVariant: z.boolean().default(false),
    variationValues: z
      .record(z.string().min(1), z.string().trim().min(1))
      .default({}),
  })
  .superRefine((value, context) => {
    if (value.gtin && !isValidGtin(value.gtin)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gtin"],
        message: "GTIN check digit or length is invalid",
      });
    }
  });

export const updateVariantSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
    internalNumericId: z.number().int().positive().optional(),
    variantName: z.string().trim().min(1).max(180).optional(),
    status: productStatusSchema.optional(),
    gtin: z.string().trim().nullable().optional(),
    basePrice: decimalStringSchema.nullable().optional(),
    costPrice: decimalStringSchema.nullable().optional(),
    currency: z.string().trim().length(3).optional(),
    weight: decimalStringSchema.nullable().optional(),
    weightUnit: z.string().trim().max(12).nullable().optional(),
    length: decimalStringSchema.nullable().optional(),
    width: decimalStringSchema.nullable().optional(),
    height: decimalStringSchema.nullable().optional(),
    diameter: decimalStringSchema.nullable().optional(),
    dimensionUnit: z.string().trim().max(12).nullable().optional(),
    isDefaultVariant: z.boolean().optional(),
    variationValues: z
      .record(z.string().min(1), z.string().trim().min(1))
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.gtin && !isValidGtin(value.gtin))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gtin"],
        message: "GTIN check digit or length is invalid",
      });
  });

const createInlineFamilySchema = z
  .object({
    sellerFamilyId: z.number().int().positive().max(2_147_483_647),
    code: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[A-Za-z0-9._-]+$/),
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().max(2_000).optional(),
    variationAxes: z
      .array(
        z.object({
          key: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .regex(/^[a-z][a-z0-9_]*$/),
          label: z.string().trim().min(1).max(120),
        }),
      )
      .min(1)
      .max(5),
  })
  .superRefine((value, context) => {
    const keys = value.variationAxes.map((axis) => axis.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variationAxes"],
        message: "Variation axes must be unique",
      });
    }
  });

const productInputSchema = z.object({
  productType: z.enum(["SIMPLE", "PARENT"]).default("SIMPLE"),
  status: productStatusSchema.default("DRAFT"),
  internalName: z.string().trim().min(2).max(180),
  publicName: z.string().trim().min(2).max(180),
  shortName: z.string().trim().max(100).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().max(100_000).optional(),
  shortDescription: z.string().max(2_000).optional(),
  gs1LabelDescription: z.string().max(500).optional(),
  safetyInformation: z.string().max(10_000).optional(),
  manufacturerPartNumber: z.string().trim().max(120).optional(),
  manufacturerName: z.string().trim().max(180).optional(),
  manufacturerAddress: z.string().trim().max(500).optional(),
  manufacturerEmail: z.string().email().max(100).optional(),
  euResponsiblePersonName: z.string().trim().max(180).optional(),
  euResponsiblePersonAddress: z.string().trim().max(500).optional(),
  euResponsiblePersonEmail: z.string().email().max(100).optional(),
  seoTitle: z.string().trim().max(180).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  defaultLanguage: z.string().trim().min(2).max(10).default("ro"),
  taxClass: z.string().trim().max(80).optional(),
  defaultVatRate: decimalStringSchema.optional(),
  defaultCurrency: z.string().trim().length(3).default("RON"),
  weight: decimalStringSchema.optional(),
  weightUnit: z.string().trim().max(12).optional(),
  length: decimalStringSchema.optional(),
  width: decimalStringSchema.optional(),
  height: decimalStringSchema.optional(),
  diameter: decimalStringSchema.optional(),
  dimensionUnit: z.string().trim().max(12).optional(),
  defaultVariant: createVariantSchema.optional(),
  family: createInlineFamilySchema.optional(),
  existingFamilyId: z.string().uuid().optional(),
});

export const createProductSchema = productInputSchema.superRefine(
  (value, context) => {
    if (value.productType === "SIMPLE" && !value.defaultVariant) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultVariant"],
        message: "A simple product requires one sellable variant",
      });
    }
    if (value.family && !value.defaultVariant) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultVariant"],
        message: "A product family requires an initial variant",
      });
    }
    if (value.existingFamilyId && !value.defaultVariant) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultVariant"],
        message: "A family member requires one sellable SKU",
      });
    }
    if (value.family && value.existingFamilyId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["family"],
        message: "Choose either a new family or an existing family",
      });
    }
    for (const axis of value.family?.variationAxes ?? []) {
      if (!value.defaultVariant?.variationValues[axis.key]?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["defaultVariant", "variationValues", axis.key],
          message: `Enter a value for the ${axis.label} variation axis`,
        });
      }
    }
  },
);

export const updateProductSchema = productInputSchema
  .omit({
    productType: true,
    defaultVariant: true,
    family: true,
    existingFamilyId: true,
  })
  .partial();

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2_000).optional(),
  parentId: z.string().uuid().optional(),
  gs1GpcCode: z.string().trim().max(40).optional(),
});
export const updateCategorySchema = createCategorySchema.partial();

export const createBrandSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  manufacturer: z.string().trim().max(180).optional(),
  websiteUrl: z.string().url().max(500).optional(),
});
export const updateBrandSchema = createBrandSchema.partial();

export const createAttributeDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/),
  displayName: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1_000).optional(),
  dataType: z.enum([
    "SHORT_TEXT",
    "LONG_TEXT",
    "RICH_TEXT",
    "INTEGER",
    "DECIMAL",
    "BOOLEAN",
    "DATE",
    "DATETIME",
    "SINGLE_SELECT",
    "MULTI_SELECT",
    "COLOR",
    "MEASUREMENT",
    "FILE",
    "IMAGE",
    "URL",
    "EMAIL",
    "JSON",
  ]),
  scope: z.enum(["PRODUCT", "VARIANT"]),
  isRequired: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  minimum: decimalStringSchema.optional(),
  maximum: decimalStringSchema.optional(),
  regexPattern: z.string().max(500).optional(),
  unitType: z.string().trim().max(40).optional(),
  isSearchable: z.boolean().default(false),
  isFilterable: z.boolean().default(false),
  isComparable: z.boolean().default(false),
  isInheritable: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
  visibility: z.string().trim().max(40).default("INTERNAL"),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(140),
        label: z.string().trim().min(1).max(180),
        displayOrder: z.number().int().min(0).default(0),
      }),
    )
    .max(500)
    .default([]),
});

export const setAttributeValuesSchema = z.object({
  values: z
    .array(
      z.object({
        definitionId: z.string().uuid(),
        locale: z.string().trim().max(10).default(""),
        value: z.unknown(),
        isOverride: z.boolean().optional(),
      }),
    )
    .max(500),
});

export const assignCategoryAttributeSchema = z.object({
  attributeDefinitionId: z.string().uuid(),
  isRequiredOverride: z.boolean().optional(),
  displayOrder: z.number().int().min(0).default(0),
});

export const createProductFamilySchema = z
  .object({
    productId: z.string().uuid(),
    sellerFamilyId: z.number().int().positive().max(2_147_483_647),
    code: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[A-Za-z0-9._-]+$/),
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().max(2_000).optional(),
    variationAxes: z
      .array(
        z.object({
          attributeDefinitionId: z.string().uuid(),
          label: z.string().trim().min(1).max(120),
        }),
      )
      .min(1)
      .max(5),
    variantIds: z.array(z.string().uuid()).min(1).max(500),
  })
  .superRefine((value, context) => {
    const axisIds = value.variationAxes.map(
      (axis) => axis.attributeDefinitionId,
    );
    if (new Set(axisIds).size !== axisIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variationAxes"],
        message: "Variation axes must be unique",
      });
    }
    if (new Set(value.variantIds).size !== value.variantIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variantIds"],
        message: "A variant can only appear once in a family",
      });
    }
  });

export const addFamilyMemberSchema = z.object({
  variantId: z.string().uuid(),
  position: z.number().int().min(0).default(0),
});

export const updateProductFamilySchema = z
  .object({
    sellerFamilyId: z
      .number()
      .int()
      .positive()
      .max(2_147_483_647)
      .nullable()
      .optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
    name: z.string().trim().min(2).max(180).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    status: productStatusSchema.optional(),
    channelMetadata: z.record(z.string(), z.unknown()).optional(),
    variationAxes: z
      .array(
        z.object({
          attributeDefinitionId: z.string().uuid(),
          label: z.string().trim().min(1).max(120),
        }),
      )
      .min(1)
      .max(5)
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      value.variationAxes &&
      new Set(value.variationAxes.map((axis) => axis.attributeDefinitionId))
        .size !== value.variationAxes.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variationAxes"],
        message: "Variation axes must be unique",
      });
    }
  });

export const gs1GtinTypeSchema = z.enum([
  "GTIN_8",
  "GTIN_12",
  "GTIN_13",
  "GTIN_14",
]);

const positiveDecimalStringSchema = decimalStringSchema.refine(
  (value) => Number(value) > 0,
  "Use a value greater than zero",
);

export const updateGs1RegistrationSchema = z.object({
  gtinType: gs1GtinTypeSchema.optional(),
  activityDomain: z.string().trim().min(1).max(180).optional(),
  productName: z.string().trim().min(2).max(200).optional(),
  shortProductName: z.string().trim().min(2).max(100).optional(),
  labelDescription: z.string().trim().min(2).max(500).optional(),
  isPromotionalProduct: z.boolean().optional(),
  brand: z.string().trim().min(1).max(180).optional(),
  internalCode: z.string().trim().min(1).max(120).optional(),
  packagingMaterial: z.string().trim().min(1).max(120).optional(),
  packagingType: z.string().trim().min(1).max(120).optional(),
  netQuantity: positiveDecimalStringSchema.optional(),
  netQuantityUnit: z.string().trim().min(1).max(30).optional(),
  targetMarkets: z.array(z.string().trim().min(2).max(100)).max(100).optional(),
  productPresentationUrl: z.string().url().max(2_000).optional(),
  productImageUrl: z.string().url().max(2_000).optional(),
  height: positiveDecimalStringSchema.optional(),
  heightUnit: z.string().trim().min(1).max(30).optional(),
  width: positiveDecimalStringSchema.optional(),
  widthUnit: z.string().trim().min(1).max(30).optional(),
  length: positiveDecimalStringSchema.optional(),
  lengthUnit: z.string().trim().min(1).max(30).optional(),
  diameter: positiveDecimalStringSchema.optional(),
  diameterUnit: z.string().trim().min(1).max(30).optional(),
  romanianDistributionNetworks: z
    .array(z.string().trim().min(1).max(180))
    .max(100)
    .optional(),
  otherDistributionNetworks: z
    .array(z.string().trim().min(1).max(180))
    .max(100)
    .optional(),
  gpcCode: z.string().trim().min(1).max(40).optional(),
  responsibilityConfirmed: z.boolean().optional(),
});

export const assignGtinSchema = z
  .object({
    gtin: z.string().trim(),
    source: z.enum(["MANUAL_GS1", "IMPORTED", "LEGACY"]).default("MANUAL_GS1"),
  })
  .superRefine((value, context) => {
    if (!isValidGtin(value.gtin)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gtin"],
        message: "GTIN check digit or length is invalid",
      });
    }
  });

export const productImageRoleSchema = z.enum(["MAIN", "SECONDARY", "OTHER"]);

export const imageTargetSchema = z
  .object({
    productId: z.string().uuid().optional(),
    variantId: z.string().uuid().optional(),
    role: productImageRoleSchema.default("OTHER"),
    position: z.coerce.number().int().min(0).default(0),
    altText: z.string().trim().max(300).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.productId) === Boolean(value.variantId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productId"],
        message: "Select exactly one product or variant image target",
      });
    }
  });

export const updateImageAssignmentSchema = z.object({
  role: productImageRoleSchema.optional(),
  position: z.number().int().min(0).optional(),
  altText: z.string().trim().max(300).nullable().optional(),
});

export const reorderImageAssignmentsSchema = z
  .object({
    assignments: z
      .array(
        z.object({
          assignmentId: z.string().uuid(),
          role: productImageRoleSchema,
          position: z.number().int().min(0),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.assignments.map((item) => item.assignmentId)).size !==
      value.assignments.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignments"],
        message: "Every image assignment must appear only once",
      });
    }
    if (value.assignments.filter((item) => item.role === "MAIN").length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assignments"],
        message: "A product or variant can have at most one main image",
      });
    }
  });

export const createWarehouseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(2).max(180),
});

export const updateWarehouseSchema = createWarehouseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createWarehouseLocationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(1).max(180),
  type: z
    .enum(["SELLABLE", "RECEIVING", "DAMAGED", "QUARANTINE", "RETURNS"])
    .default("SELLABLE"),
});

const inventoryEntitySchema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
});

export const receiveInventorySchema = inventoryEntitySchema.extend({
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(3).max(240),
  idempotencyKey: z.string().uuid(),
});

export const inventoryAdjustmentSchema = inventoryEntitySchema.extend({
  bucket: z.enum(["PHYSICAL", "INCOMING", "DAMAGED", "QUARANTINED"]),
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(240),
  idempotencyKey: z.string().uuid(),
});

export const setSafetyStockSchema = inventoryEntitySchema
  .omit({ locationId: true })
  .extend({
    safetyStock: z.number().int().min(0),
    reason: z.string().trim().min(3).max(240),
    idempotencyKey: z.string().uuid(),
  });

export const createInventoryReservationSchema = inventoryEntitySchema.extend({
  quantity: z.number().int().positive(),
  source: z.string().trim().min(2).max(60),
  externalReference: z.string().trim().min(1).max(180).optional(),
  idempotencyKey: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

export const inventoryReservationActionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(3).max(240),
});

export const inventoryTransferSchema = z
  .object({
    variantId: z.string().uuid(),
    sourceWarehouseId: z.string().uuid(),
    destinationWarehouseId: z.string().uuid(),
    quantity: z.number().int().positive(),
    reason: z.string().trim().min(3).max(240),
    idempotencyKey: z.string().uuid(),
  })
  .refine((value) => value.sourceWarehouseId !== value.destinationWarehouseId, {
    path: ["destinationWarehouseId"],
    message: "Transfer destination must differ from its source",
  });

export const inventoryStockCountSchema = inventoryEntitySchema
  .omit({ locationId: true })
  .extend({
    countedPhysical: z.number().int().min(0),
    reason: z.string().trim().min(3).max(240).optional(),
    idempotencyKey: z.string().uuid(),
  });

export const fileFormatSchema = z.enum(["XLS", "XLSX", "CSV"]);

export const importDestinationFieldSchema = z.enum([
  "product.publicName",
  "product.internalName",
  "product.description",
  "product.status",
  "product.defaultVatRate",
  "brand.name",
  "category.name",
  "variant.sku",
  "variant.internalNumericId",
  "variant.gtin",
  "variant.basePrice",
  "variant.currency",
  "variant.status",
  "stock.onHand",
  "stock.warehouseCode",
  "images.urls",
]);

export const importMappingItemSchema = z.object({
  sourceColumn: z.string().trim().min(1).max(240),
  destinationField: z.union([
    importDestinationFieldSchema,
    z.string().regex(/^attribute\.[a-z][a-z0-9_]*$/),
  ]),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  transformation: z
    .enum([
      "NONE",
      "TRIM",
      "UPPERCASE",
      "LOWERCASE",
      "DECIMAL",
      "INTEGER",
      "BOOLEAN",
      "SPLIT_COMMA",
    ])
    .default("TRIM"),
});

export const configureImportSchema = z
  .object({
    sheetName: z.string().trim().min(1).max(240),
    headerRow: z.number().int().min(1).max(1_000),
    mappingTemplateId: z.string().uuid().optional(),
    mappings: z.array(importMappingItemSchema).min(1).max(500),
    defaults: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((value, context) => {
    const destinations = value.mappings.map(
      (mapping) => mapping.destinationField,
    );
    if (new Set(destinations).size !== destinations.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mappings"],
        message: "Destination fields must be unique",
      });
    }
  });

export const createImportMappingTemplateSchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1_000).optional(),
  format: fileFormatSchema.optional(),
  sheetName: z.string().trim().min(1).max(240).optional(),
  headerRow: z.number().int().min(1).max(1_000).default(1),
  mappings: z.array(importMappingItemSchema).min(1).max(500),
  defaults: z.record(z.string(), z.unknown()).default({}),
});

export const executeImportSchema = z.object({
  confirm: z.literal(true),
  mode: z.enum(["CREATE_ONLY", "UPSERT_BY_SKU"]).default("CREATE_ONLY"),
});

export const exportMappingItemSchema = z.object({
  sourceField: z.string().trim().min(1).max(240),
  destinationColumn: z.string().trim().min(1).max(240),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  transformation: z
    .enum([
      "NONE",
      "TRIM",
      "UPPERCASE",
      "LOWERCASE",
      "DECIMAL_2",
      "BOOLEAN_YES_NO",
      "JOIN_COMMA",
    ])
    .default("NONE"),
  dateFormat: z.string().trim().max(40).optional(),
  unitConversion: z
    .object({ from: z.string(), to: z.string(), factor: z.number() })
    .optional(),
  enumerationMapping: z.record(z.string(), z.string()).optional(),
  concatenate: z.array(z.string().trim().min(1)).max(20).optional(),
  language: z.string().trim().max(10).optional(),
});

export const createExportTemplateSchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1_000).optional(),
  format: fileFormatSchema.exclude(["XLS"]).default("XLSX"),
  mappings: z.array(exportMappingItemSchema).min(1).max(500),
  defaults: z.record(z.string(), z.unknown()).default({}),
});

export const runExportSchema = z.object({
  templateId: z.string().uuid(),
  format: fileFormatSchema.exclude(["XLS"]).optional(),
  filters: z
    .object({
      productStatus: productStatusSchema.optional(),
      categoryId: z.string().uuid().optional(),
      brandId: z.string().uuid().optional(),
      channelAccountId: z.string().uuid().optional(),
      updatedAfter: z.string().datetime().optional(),
    })
    .default({}),
});

export const emagCredentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1).max(500),
});

export const createWebsiteChannelSchema = z.object({
  name: z.string().trim().min(2).max(120),
  domain: z.string().url().max(500),
  currency: z.string().trim().length(3).default("RON"),
  language: z.string().trim().min(2).max(10).default("ro"),
  stockBuffer: z.number().int().min(0).max(1_000_000).default(0),
  isActive: z.boolean().default(false),
});

export const updateWebsiteChannelSchema = createWebsiteChannelSchema.partial();

export const createWebsiteApiCredentialSchema = z.object({
  name: z.string().trim().min(2).max(120),
  expiresAt: z.string().datetime().optional(),
});

export const upsertCategoryMappingSchema = z.object({
  categoryId: z.string().uuid(),
  externalCategoryId: z.string().trim().min(1).max(180),
  externalName: z.string().trim().max(240).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const upsertWebsiteListingSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  status: z
    .enum([
      "DRAFT",
      "VALIDATION_FAILED",
      "QUEUED",
      "PUBLISHED",
      "PAUSED",
      "FAILED",
    ])
    .default("DRAFT"),
  price: decimalStringSchema.optional(),
  currency: z.string().trim().length(3).default("RON"),
  stockBuffer: z.number().int().min(0).max(1_000_000).default(0),
  seoTitle: z.string().trim().max(180).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  imageAssignmentIds: z.array(z.string().uuid()).max(100).default([]),
  externalCategoryId: z.string().trim().max(180).optional(),
});

export const websiteCatalogQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(180).optional(),
  sort: z
    .enum(["updated_desc", "name_asc", "price_asc", "price_desc"])
    .default("updated_desc"),
  fields: z.string().trim().max(500).optional(),
});

const emagAccountInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  marketplace: z
    .enum([
      "EMAG_RO",
      "EMAG_BG",
      "EMAG_HU",
      "FASHION_DAYS_RO",
      "FASHION_DAYS_BG",
    ])
    .default("EMAG_RO"),
  mode: z.enum(["mock", "live"]).default("mock"),
  apiUrl: z.string().url().max(500).optional(),
  username: z.string().trim().min(1).max(240).optional(),
  password: z.string().min(1).max(500).optional(),
  isActive: z.boolean().default(false),
});

export const createEmagAccountSchema = emagAccountInputSchema.superRefine(
  (value, context) => {
    if (value.mode === "live" && (!value.username || !value.password)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Live mode requires username and password",
      });
    }
  },
);

export const updateEmagAccountSchema = emagAccountInputSchema.partial();

export const emagPublicationPathSchema = z.enum([
  "NEW_PRODUCT",
  "ATTACH_EXISTING",
  "UPDATE_OFFER",
]);

export const upsertEmagListingSchema = z
  .object({
    productId: z.string().uuid(),
    variantId: z.string().uuid(),
    externalCategoryId: z.coerce.number().int().positive(),
    publicationPath: emagPublicationPathSchema,
    sellerProductId: z.number().int().min(1).max(16_777_215),
    partNumberKey: z.string().trim().max(255).optional(),
    salePrice: positiveDecimalStringSchema,
    recommendedPrice: positiveDecimalStringSchema.optional(),
    minimumSalePrice: positiveDecimalStringSchema.optional(),
    maximumSalePrice: positiveDecimalStringSchema.optional(),
    vatId: z.number().int().positive(),
    handlingTimeId: z.number().int().positive().optional(),
    supplyLeadTime: z
      .union([
        z.literal(2),
        z.literal(3),
        z.literal(5),
        z.literal(7),
        z.literal(14),
        z.literal(30),
        z.literal(60),
        z.literal(90),
        z.literal(120),
      ])
      .optional(),
    startDate: z.string().date().optional(),
    emagGenius: z.boolean().default(true),
    offerStatus: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
    warrantyMonths: z.number().int().min(0).max(255).optional(),
    greenTax: decimalStringSchema.optional(),
    stockBuffer: z.number().int().min(0).max(1_000_000).default(0),
    status: z
      .enum([
        "DRAFT",
        "VALIDATION_FAILED",
        "QUEUED",
        "PUBLISHED",
        "PAUSED",
        "FAILED",
      ])
      .default("DRAFT"),
    characteristicMappings: z
      .array(
        z.object({
          characteristicId: z.number().int().positive(),
          value: z.string().trim().min(1).max(255),
          tag: z.string().trim().min(1).max(255).optional(),
        }),
      )
      .max(500)
      .default([]),
    sellerFamilyId: z.number().int().min(0).optional(),
    familyName: z.string().trim().max(255).optional(),
    familyTypeId: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.publicationPath === "ATTACH_EXISTING" && !value.partNumberKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["partNumberKey"],
        message: "Attaching an offer requires part_number_key",
      });
    }
    if (
      value.recommendedPrice &&
      Number(value.recommendedPrice) <= Number(value.salePrice)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendedPrice"],
        message: "Recommended price must be greater than sale price",
      });
    }
    if (
      value.minimumSalePrice &&
      value.maximumSalePrice &&
      Number(value.maximumSalePrice) <= Number(value.minimumSalePrice)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumSalePrice"],
        message: "Maximum sale price must be greater than minimum sale price",
      });
    }
  });

export const emagEanLookupSchema = z.object({
  eans: z
    .array(z.string().trim().refine(isValidGtin, "Invalid GTIN/EAN"))
    .min(1)
    .max(100),
});

export const enqueueEmagOperationSchema = z.object({
  listingIds: z.array(z.string().uuid()).min(1).max(1_000),
  operation: z.enum([
    "publish",
    "reconcile",
    "price",
    "stock",
    "status",
    "documentation",
  ]),
});

export const jobQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum([
      "QUEUED",
      "RUNNING",
      "SUCCEEDED",
      "PARTIALLY_SUCCEEDED",
      "FAILED",
      "CANCELLED",
    ])
    .optional(),
  type: z.string().trim().max(120).optional(),
});

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(2).max(120),
  roleId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(500),
  password: z
    .string()
    .min(12)
    .max(200)
    .regex(/[a-z]/, "Password needs a lowercase letter")
    .regex(/[A-Z]/, "Password needs an uppercase letter")
    .regex(/\d/, "Password needs a number"),
  displayName: z.string().trim().min(2).max(120).optional(),
});

export const updateMembershipSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine(
    (value) => value.roleId !== undefined || value.status !== undefined,
    "Provide a role or status change",
  );

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().trim().min(1)).min(1).max(100),
});

export const auditLogQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(120).optional(),
  actorId: z.string().uuid().optional(),
});

export const companySettingsSchema = z.object({
  defaultLanguage: z.string().trim().min(2).max(10).default("ro"),
  defaultCurrency: z.string().trim().length(3).default("RON"),
  defaultVatRate: decimalStringSchema.default("19"),
  defaultWeightUnit: z.string().trim().min(1).max(12).default("kg"),
  defaultDimensionUnit: z.string().trim().min(1).max(12).default("cm"),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).default(5),
});

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    settings: companySettingsSchema.partial().optional(),
  })
  .refine((value) => value.name !== undefined || value.settings !== undefined, {
    message: "Provide at least one company setting",
  });

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const bootstrapWorkspaceSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .default("Pretty Little Things"),
  companySlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .default("aline"),
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(2).max(120),
  password: z
    .string()
    .min(12)
    .max(200)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/\d/),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type CreateAttributeDefinitionInput = z.infer<
  typeof createAttributeDefinitionSchema
>;
export type SetAttributeValuesInput = z.infer<typeof setAttributeValuesSchema>;
export type AssignCategoryAttributeInput = z.infer<
  typeof assignCategoryAttributeSchema
>;
export type CreateProductFamilyInput = z.infer<
  typeof createProductFamilySchema
>;
export type AddFamilyMemberInput = z.infer<typeof addFamilyMemberSchema>;
export type UpdateProductFamilyInput = z.infer<
  typeof updateProductFamilySchema
>;
export type UpdateGs1RegistrationInput = z.infer<
  typeof updateGs1RegistrationSchema
>;
export type AssignGtinInput = z.infer<typeof assignGtinSchema>;
export type ImageTargetInput = z.infer<typeof imageTargetSchema>;
export type UpdateImageAssignmentInput = z.infer<
  typeof updateImageAssignmentSchema
>;
export type ReorderImageAssignmentsInput = z.infer<
  typeof reorderImageAssignmentsSchema
>;
export type InventoryAdjustmentInput = z.infer<
  typeof inventoryAdjustmentSchema
>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateWarehouseLocationInput = z.infer<
  typeof createWarehouseLocationSchema
>;
export type ReceiveInventoryInput = z.infer<typeof receiveInventorySchema>;
export type SetSafetyStockInput = z.infer<typeof setSafetyStockSchema>;
export type CreateInventoryReservationInput = z.infer<
  typeof createInventoryReservationSchema
>;
export type InventoryReservationActionInput = z.infer<
  typeof inventoryReservationActionSchema
>;
export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>;
export type InventoryStockCountInput = z.infer<
  typeof inventoryStockCountSchema
>;
export type ImportMappingItem = z.infer<typeof importMappingItemSchema>;
export type ConfigureImportInput = z.infer<typeof configureImportSchema>;
export type CreateImportMappingTemplateInput = z.infer<
  typeof createImportMappingTemplateSchema
>;
export type ExecuteImportInput = z.infer<typeof executeImportSchema>;
export type ExportMappingItem = z.infer<typeof exportMappingItemSchema>;
export type CreateExportTemplateInput = z.infer<
  typeof createExportTemplateSchema
>;
export type RunExportInput = z.infer<typeof runExportSchema>;
export type CreateWebsiteChannelInput = z.infer<
  typeof createWebsiteChannelSchema
>;
export type UpdateWebsiteChannelInput = z.infer<
  typeof updateWebsiteChannelSchema
>;
export type CreateWebsiteApiCredentialInput = z.infer<
  typeof createWebsiteApiCredentialSchema
>;
export type UpsertCategoryMappingInput = z.infer<
  typeof upsertCategoryMappingSchema
>;
export type UpsertWebsiteListingInput = z.infer<
  typeof upsertWebsiteListingSchema
>;
export type WebsiteCatalogQuery = z.infer<typeof websiteCatalogQuerySchema>;
export type CreateEmagAccountInput = z.infer<typeof createEmagAccountSchema>;
export type UpdateEmagAccountInput = z.infer<typeof updateEmagAccountSchema>;
export type UpsertEmagListingInput = z.infer<typeof upsertEmagListingSchema>;
export type EmagEanLookupInput = z.infer<typeof emagEanLookupSchema>;
export type EnqueueEmagOperationInput = z.infer<
  typeof enqueueEmagOperationSchema
>;
export type JobQuery = z.infer<typeof jobQuerySchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type BootstrapWorkspaceInput = z.infer<typeof bootstrapWorkspaceSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
