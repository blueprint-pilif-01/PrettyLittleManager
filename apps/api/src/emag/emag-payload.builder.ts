import type { EmagProductOfferSave } from "@plm/emag";

export type EmagValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export type EmagPayloadSource = {
  publicationPath: "NEW_PRODUCT" | "ATTACH_EXISTING" | "UPDATE_OFFER";
  sellerProductId: number;
  externalCategoryId: number;
  partNumberKey?: string | null;
  name: string;
  partNumber?: string | null;
  brand?: string | null;
  description?: string | null;
  sourceLanguage: string;
  productUrl?: string | null;
  images: Array<{ url?: string | null; role: string }>;
  gtin?: string | null;
  categoryRequiresEan: boolean;
  categoryRequiresWarranty: boolean;
  warrantyMonths?: number | null;
  characteristics: Array<{
    characteristicId: number;
    value: string;
    tag?: string;
  }>;
  requiredCharacteristicIds: number[];
  salePrice: string;
  recommendedPrice?: string | null;
  minimumSalePrice?: string | null;
  maximumSalePrice?: string | null;
  vatId?: number | null;
  handlingTimeId?: number | null;
  supplyLeadTime?: number | null;
  startDate?: string | null;
  emagGenius: boolean;
  offerStatus: 0 | 1 | 2;
  stock: number;
  greenTax?: string | null;
  family?: {
    id: number;
    name?: string | null;
    familyTypeId?: number | null;
  } | null;
  allowedFamilyTypeIds?: number[];
  safetyInformation?: string | null;
  manufacturer?: {
    name?: string | null;
    address?: string | null;
    email?: string | null;
  };
  euRepresentative?: {
    name?: string | null;
    address?: string | null;
    email?: string | null;
  };
};

export function validateEmagPayloadSource(
  source: EmagPayloadSource,
): EmagValidationIssue[] {
  const issues: EmagValidationIssue[] = [];
  const required = (
    condition: boolean,
    field: string,
    code: string,
    message: string,
  ) => {
    if (!condition) issues.push({ field, code, message });
  };
  required(
    source.sellerProductId > 0 && source.sellerProductId <= 16_777_215,
    "sellerProductId",
    "EMAG_SELLER_ID_INVALID",
    "Seller product ID must be between 1 and 16777215",
  );
  required(
    Boolean(source.vatId),
    "vatId",
    "EMAG_VAT_REQUIRED",
    "Select an eMAG VAT identifier",
  );
  required(
    Number(source.salePrice) > 0,
    "salePrice",
    "EMAG_SALE_PRICE_INVALID",
    "Sale price must be greater than zero",
  );
  if (source.family && source.family.id !== 0) {
    required(
      source.family.id > 0,
      "sellerFamilyId",
      "EMAG_FAMILY_ID_INVALID",
      "Enter the positive seller family ID shared by all family products",
    );
    required(
      Boolean(source.family.name?.trim()),
      "familyName",
      "EMAG_FAMILY_NAME_REQUIRED",
      "Family name is required for a family product",
    );
    required(
      Boolean(source.family.familyTypeId),
      "familyTypeId",
      "EMAG_FAMILY_TYPE_REQUIRED",
      "Select an eMAG family type for this category",
    );
    if (
      source.family.familyTypeId &&
      source.allowedFamilyTypeIds &&
      !source.allowedFamilyTypeIds.includes(source.family.familyTypeId)
    ) {
      issues.push({
        field: "familyTypeId",
        code: "EMAG_FAMILY_TYPE_INVALID",
        message:
          "The selected family type is not available for this eMAG category",
      });
    }
  }
  if (
    source.recommendedPrice &&
    Number(source.recommendedPrice) <= Number(source.salePrice)
  )
    issues.push({
      field: "recommendedPrice",
      code: "EMAG_RECOMMENDED_PRICE_INVALID",
      message: "Recommended price must be greater than sale price",
    });
  if (
    source.minimumSalePrice &&
    source.maximumSalePrice &&
    Number(source.maximumSalePrice) <= Number(source.minimumSalePrice)
  )
    issues.push({
      field: "maximumSalePrice",
      code: "EMAG_PRICE_RANGE_INVALID",
      message: "Maximum sale price must be greater than minimum sale price",
    });
  if (source.publicationPath === "ATTACH_EXISTING")
    required(
      Boolean(source.partNumberKey),
      "partNumberKey",
      "EMAG_PART_NUMBER_KEY_REQUIRED",
      "Attaching an offer requires part_number_key",
    );
  if (source.publicationPath === "NEW_PRODUCT") {
    required(
      source.externalCategoryId > 0,
      "externalCategoryId",
      "EMAG_CATEGORY_REQUIRED",
      "Select an eMAG category",
    );
    required(
      Boolean(source.name.trim()),
      "name",
      "EMAG_NAME_REQUIRED",
      "Product name is required",
    );
    required(
      Boolean(source.partNumber?.trim()),
      "partNumber",
      "EMAG_PART_NUMBER_REQUIRED",
      "Manufacturer part number is required",
    );
    required(
      Boolean(source.brand?.trim()),
      "brand",
      "EMAG_BRAND_REQUIRED",
      "Brand is required",
    );
    required(
      Boolean(source.minimumSalePrice),
      "minimumSalePrice",
      "EMAG_MIN_PRICE_REQUIRED",
      "Minimum sale price is required on first publication",
    );
    required(
      Boolean(source.maximumSalePrice),
      "maximumSalePrice",
      "EMAG_MAX_PRICE_REQUIRED",
      "Maximum sale price is required on first publication",
    );
    if (source.categoryRequiresEan)
      required(
        Boolean(source.gtin),
        "gtin",
        "EMAG_EAN_REQUIRED",
        "The selected eMAG category requires an EAN/GTIN",
      );
    if (source.categoryRequiresWarranty)
      required(
        source.warrantyMonths !== null && source.warrantyMonths !== undefined,
        "warrantyMonths",
        "EMAG_WARRANTY_REQUIRED",
        "The selected eMAG category requires warranty information",
      );
    const mappedIds = new Set(
      source.characteristics.map((item) => item.characteristicId),
    );
    for (const id of source.requiredCharacteristicIds)
      if (!mappedIds.has(id))
        issues.push({
          field: `characteristics.${id}`,
          code: "EMAG_CHARACTERISTIC_REQUIRED",
          message: `Required eMAG characteristic ${id} is missing`,
        });
  }
  if (source.offerStatus === 2 && source.publicationPath === "NEW_PRODUCT")
    issues.push({
      field: "offerStatus",
      code: "EMAG_END_OF_LIFE_NEW",
      message:
        "End-of-life status is only valid when updating an existing offer",
    });
  return issues;
}

export function buildEmagProductOfferPayload(source: EmagPayloadSource): {
  payload: EmagProductOfferSave;
  issues: EmagValidationIssue[];
} {
  const issues = validateEmagPayloadSource(source);
  const payload: EmagProductOfferSave = {
    id: source.sellerProductId,
    status: source.offerStatus,
    sale_price: source.salePrice,
    stock: [
      {
        warehouse_id: 1,
        value: Math.max(0, Math.min(65_535, Math.trunc(source.stock))),
      },
    ],
    handling_time: source.handlingTimeId
      ? [{ warehouse_id: 1, value: source.handlingTimeId }]
      : [],
    vat_id: source.vatId ?? 0,
    ...(source.recommendedPrice
      ? { recommended_price: source.recommendedPrice }
      : {}),
    ...(source.minimumSalePrice
      ? { min_sale_price: source.minimumSalePrice }
      : {}),
    ...(source.maximumSalePrice
      ? { max_sale_price: source.maximumSalePrice }
      : {}),
    ...(source.supplyLeadTime
      ? {
          supply_lead_time:
            source.supplyLeadTime as EmagProductOfferSave["supply_lead_time"],
        }
      : {}),
    ...(source.startDate ? { start_date: source.startDate } : {}),
    emag_club: source.emagGenius ? 1 : 0,
    ...(source.greenTax ? { green_tax: source.greenTax } : {}),
  };
  if (source.publicationPath === "ATTACH_EXISTING")
    payload.part_number_key = source.partNumberKey ?? undefined;
  if (source.publicationPath === "NEW_PRODUCT") {
    Object.assign(payload, {
      category_id: source.externalCategoryId,
      source_language: source.sourceLanguage,
      name: source.name,
      part_number: source.partNumber?.replace(/[\s,;]/g, "").slice(0, 25),
      description: source.description || undefined,
      brand: source.brand || undefined,
      images: source.images
        .filter((image) => Boolean(image.url))
        .map((image) => ({
          display_type:
            image.role === "MAIN"
              ? (1 as const)
              : image.role === "SECONDARY"
                ? (2 as const)
                : (0 as const),
          url: image.url!,
        })),
      images_overwrite: 1,
      characteristics: source.characteristics.map((item) => ({
        id: item.characteristicId,
        value: item.value,
        ...(item.tag ? { tag: item.tag } : {}),
      })),
      url: source.productUrl || undefined,
      warranty: source.warrantyMonths ?? undefined,
      ean: source.gtin ? [source.gtin] : undefined,
      safety_information: source.safetyInformation || undefined,
    });
    if (source.family)
      payload.family = {
        id: source.family.id,
        ...(source.family.name ? { name: source.family.name } : {}),
        ...(source.family.familyTypeId
          ? { family_type_id: source.family.familyTypeId }
          : {}),
      };
    if (
      source.manufacturer?.name &&
      source.manufacturer.address &&
      source.manufacturer.email
    )
      payload.manufacturer = [
        {
          name: source.manufacturer.name,
          address: source.manufacturer.address,
          email: source.manufacturer.email,
        },
      ];
    if (
      source.euRepresentative?.name &&
      source.euRepresentative.address &&
      source.euRepresentative.email
    )
      payload.eu_representative = [
        {
          name: source.euRepresentative.name,
          address: source.euRepresentative.address,
          email: source.euRepresentative.email,
        },
      ];
  }
  return { payload, issues };
}
