import { Injectable } from "@nestjs/common";
import type { Gs1Registration, Product, ProductVariant } from "@prisma/client";
import type { ValidationIssue } from "./gs1-validation.service";

export type Gs1SummaryContext = {
  variant: ProductVariant & { product: Product };
  registration: Gs1Registration;
  validation: {
    valid: boolean;
    counts: { blockingErrors: number; warnings: number; information: number };
    issues: ValidationIssue[];
  };
};

export abstract class Gs1Connector {
  abstract readonly mode: "MANUAL" | "API";
  abstract buildRegistrationSummary(context: Gs1SummaryContext): {
    mode: "MANUAL" | "API";
    title: string;
    generatedAt: string;
    sections: Array<{ title: string; fields: Array<{ label: string; value: string }> }>;
    text: string;
    validation: Gs1SummaryContext["validation"];
  };
  abstract exportRegistrationCsv(context: Gs1SummaryContext): string;
}

@Injectable()
export class ManualGs1Connector extends Gs1Connector {
  readonly mode = "MANUAL" as const;

  buildRegistrationSummary(context: Gs1SummaryContext) {
    const { registration, variant } = context;
    const sections = [
      {
        title: "Identity",
        fields: [
          { label: "GTIN type", value: registration.gtinType },
          { label: "Product name", value: this.value(registration.productName) },
          { label: "Short product name", value: this.value(registration.shortProductName) },
          { label: "Label description", value: this.value(registration.labelDescription) },
          { label: "Brand", value: this.value(registration.brand) },
          { label: "Internal code", value: this.value(registration.internalCode ?? variant.sku) },
          { label: "Activity domain", value: this.value(registration.activityDomain) },
          { label: "GPC code", value: this.value(registration.gpcCode) },
        ],
      },
      {
        title: "Packaging and quantity",
        fields: [
          { label: "Promotional product", value: registration.isPromotionalProduct ? "Yes" : "No" },
          { label: "Packaging material", value: this.value(registration.packagingMaterial) },
          { label: "Packaging type", value: this.value(registration.packagingType) },
          { label: "Net quantity", value: this.measure(registration.netQuantity, registration.netQuantityUnit) },
          { label: "Height", value: this.measure(registration.height, registration.heightUnit) },
          { label: "Width", value: this.measure(registration.width, registration.widthUnit) },
          { label: "Length", value: this.measure(registration.length, registration.lengthUnit) },
          { label: "Diameter", value: this.measure(registration.diameter, registration.diameterUnit) },
        ],
      },
      {
        title: "Markets and references",
        fields: [
          { label: "Target markets", value: this.list(registration.targetMarkets) },
          { label: "Romanian distribution networks", value: this.list(registration.romanianDistributionNetworks) },
          { label: "Other distribution networks", value: this.list(registration.otherDistributionNetworks) },
          { label: "Product presentation URL", value: this.value(registration.productPresentationUrl) },
          { label: "Product image URL", value: this.value(registration.productImageUrl) },
          { label: "Responsibility confirmed", value: registration.responsibilityConfirmed ? "Yes" : "No" },
        ],
      },
    ];
    const title = `GS1 manual registration — ${registration.productName ?? variant.variantName}`;
    const text = [
      title,
      ...sections.flatMap((section) => [
        `\n${section.title}`,
        ...section.fields.map((field) => `${field.label}: ${field.value}`),
      ]),
    ].join("\n");
    return {
      mode: this.mode,
      title,
      generatedAt: new Date().toISOString(),
      sections,
      text,
      validation: context.validation,
    };
  }

  exportRegistrationCsv(context: Gs1SummaryContext) {
    const summary = this.buildRegistrationSummary(context);
    const rows = [
      ["Section", "Field", "Value"],
      ...summary.sections.flatMap((section) =>
        section.fields.map((field) => [section.title, field.label, field.value]),
      ),
    ];
    return `\uFEFF${rows.map((row) => row.map(this.csv).join(",")).join("\r\n")}`;
  }

  private value(value: unknown) {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  private measure(value: unknown, unit: string | null) {
    return value === null || value === undefined ? "—" : `${String(value)} ${unit ?? ""}`.trim();
  }

  private list(value: unknown) {
    return Array.isArray(value) && value.length ? value.join(", ") : "—";
  }

  private csv(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
