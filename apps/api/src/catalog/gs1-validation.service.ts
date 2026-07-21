import { Injectable } from "@nestjs/common";
import type { Gs1Registration, Product, ProductVariant } from "@prisma/client";

export type ValidationSeverity = "INFORMATION" | "WARNING" | "BLOCKING_ERROR";

export type ValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  entity: { type: "Gs1Registration" | "ProductVariant" | "Product"; id: string };
  field: string;
  message: string;
  suggestedResolution: string;
};

type Gs1Context = {
  variant: ProductVariant & { product: Product };
  registration: Gs1Registration | null;
};

@Injectable()
export class Gs1ValidationService {
  validate(context: Gs1Context) {
    const { registration, variant } = context;
    const issues: ValidationIssue[] = [];
    if (!registration) {
      issues.push({
        code: "GS1_REGISTRATION_NOT_STARTED",
        severity: "BLOCKING_ERROR",
        entity: { type: "ProductVariant", id: variant.id },
        field: "registration",
        message: "GS1 registration information has not been started",
        suggestedResolution: "Complete and save the GS1 registration form for this variant",
      });
      return this.result(issues);
    }

    const required: Array<{
      field: keyof Gs1Registration;
      label: string;
      resolution?: string;
    }> = [
      { field: "activityDomain", label: "activity domain" },
      { field: "productName", label: "product name" },
      { field: "shortProductName", label: "short product name" },
      { field: "labelDescription", label: "label description" },
      { field: "brand", label: "brand" },
      { field: "internalCode", label: "internal code" },
      { field: "packagingMaterial", label: "packaging material" },
      { field: "packagingType", label: "packaging type" },
      { field: "netQuantity", label: "net quantity" },
      { field: "netQuantityUnit", label: "net quantity unit" },
      { field: "gpcCode", label: "GS1 GPC code" },
    ];
    for (const item of required) {
      const value = registration[item.field];
      if (value === null || value === undefined || value === "") {
        issues.push({
          code: `GS1_${String(item.field).replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_MISSING`,
          severity: "BLOCKING_ERROR",
          entity: { type: "Gs1Registration", id: registration.id },
          field: String(item.field),
          message: `The ${item.label} is required for manual GS1 registration`,
          suggestedResolution: item.resolution ?? `Enter the ${item.label}`,
        });
      }
    }

    const targetMarkets = this.stringArray(registration.targetMarkets);
    if (!targetMarkets.length) {
      issues.push({
        code: "GS1_TARGET_MARKET_MISSING",
        severity: "BLOCKING_ERROR",
        entity: { type: "Gs1Registration", id: registration.id },
        field: "targetMarkets",
        message: "At least one target market is required",
        suggestedResolution: "Select every market where the product will be distributed",
      });
    }
    if (!registration.responsibilityConfirmed) {
      issues.push({
        code: "GS1_RESPONSIBILITY_NOT_CONFIRMED",
        severity: "BLOCKING_ERROR",
        entity: { type: "Gs1Registration", id: registration.id },
        field: "responsibilityConfirmed",
        message: "The data responsibility declaration is not confirmed",
        suggestedResolution: "Review the GS1 data and confirm responsibility for its accuracy",
      });
    }

    this.dimensionPair(issues, registration, "height", "heightUnit");
    this.dimensionPair(issues, registration, "width", "widthUnit");
    this.dimensionPair(issues, registration, "length", "lengthUnit");
    this.dimensionPair(issues, registration, "diameter", "diameterUnit");

    if (!registration.productImageUrl) {
      issues.push({
        code: "GS1_PRODUCT_IMAGE_URL_MISSING",
        severity: "WARNING",
        entity: { type: "Gs1Registration", id: registration.id },
        field: "productImageUrl",
        message: "No public product image URL is included in the GS1 summary",
        suggestedResolution: "Upload and process a product image, then add its public URL",
      });
    }
    if (!registration.productPresentationUrl) {
      issues.push({
        code: "GS1_PRESENTATION_URL_MISSING",
        severity: "WARNING",
        entity: { type: "Gs1Registration", id: registration.id },
        field: "productPresentationUrl",
        message: "No product presentation URL is included",
        suggestedResolution: "Add the public website URL when the product page is available",
      });
    }
    if (!variant.product.manufacturerName) {
      issues.push({
        code: "PRODUCT_MANUFACTURER_MISSING",
        severity: "WARNING",
        entity: { type: "Product", id: variant.product.id },
        field: "manufacturerName",
        message: "The central product record has no manufacturer name",
        suggestedResolution: "Complete the manufacturer details on the central product",
      });
    }
    if (variant.product.status === "ARCHIVED" || variant.status === "ARCHIVED") {
      issues.push({
        code: "GS1_ENTITY_ARCHIVED",
        severity: "BLOCKING_ERROR",
        entity: { type: "ProductVariant", id: variant.id },
        field: "status",
        message: "An archived product or variant cannot be submitted",
        suggestedResolution: "Restore the catalog entity before continuing the GS1 workflow",
      });
    }
    return this.result(issues);
  }

  private result(issues: ValidationIssue[]) {
    const blockingErrors = issues.filter((issue) => issue.severity === "BLOCKING_ERROR");
    return {
      valid: blockingErrors.length === 0,
      counts: {
        blockingErrors: blockingErrors.length,
        warnings: issues.filter((issue) => issue.severity === "WARNING").length,
        information: issues.filter((issue) => issue.severity === "INFORMATION").length,
      },
      issues,
    };
  }

  private dimensionPair(
    issues: ValidationIssue[],
    registration: Gs1Registration,
    valueField: "height" | "width" | "length" | "diameter",
    unitField: "heightUnit" | "widthUnit" | "lengthUnit" | "diameterUnit",
  ) {
    const hasValue = registration[valueField] !== null;
    const hasUnit = Boolean(registration[unitField]);
    if (hasValue === hasUnit) return;
    issues.push({
      code: "GS1_DIMENSION_INCOMPLETE",
      severity: "BLOCKING_ERROR",
      entity: { type: "Gs1Registration", id: registration.id },
      field: hasValue ? unitField : valueField,
      message: `GS1 ${valueField} requires both a value and unit`,
      suggestedResolution: `Complete or clear both ${valueField} fields`,
    });
  }

  private stringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }
}
