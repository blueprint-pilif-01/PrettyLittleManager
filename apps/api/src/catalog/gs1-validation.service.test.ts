import type { Gs1Registration, Product, ProductVariant } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { Gs1ValidationService } from "./gs1-validation.service";

const service = new Gs1ValidationService();

function context(registration: Partial<Gs1Registration> | null) {
  const product = {
    id: "5e877630-3147-48eb-9a15-19327f8b4ccd",
    status: "DRAFT",
    manufacturerName: "Aline Manufacturing",
  } as Product;
  const variant = {
    id: "d69ff66a-17d6-436b-acd0-3bc7800acb9f",
    status: "DRAFT",
    product,
  } as ProductVariant & { product: Product };
  return {
    variant,
    registration: registration
      ? ({
          id: "938ba5c6-ac50-469f-8061-c96bc2834905",
          activityDomain: "Cosmetics",
          productName: "Aline Shampoo",
          shortProductName: "Shampoo",
          labelDescription: "Hair shampoo 250 ml",
          brand: "Aline",
          internalCode: "AL-SH-250",
          packagingMaterial: "Plastic",
          packagingType: "Bottle",
          netQuantity: "250",
          netQuantityUnit: "ML",
          targetMarkets: ["RO"],
          gpcCode: "10000310",
          responsibilityConfirmed: true,
          productImageUrl: "https://example.test/image.jpg",
          productPresentationUrl: "https://example.test/product",
          height: null,
          heightUnit: null,
          width: null,
          widthUnit: null,
          length: null,
          lengthUnit: null,
          diameter: null,
          diameterUnit: null,
          ...registration,
        } as unknown as Gs1Registration)
      : null,
  };
}

describe("Gs1ValidationService", () => {
  it("returns a structured blocking issue when registration has not started", () => {
    const result = service.validate(context(null));
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "GS1_REGISTRATION_NOT_STARTED",
      severity: "BLOCKING_ERROR",
      field: "registration",
    });
  });

  it("accepts a complete manual registration", () => {
    const result = service.validate(context({}));
    expect(result.valid).toBe(true);
    expect(result.counts.blockingErrors).toBe(0);
  });

  it("blocks incomplete dimension pairs", () => {
    const result = service.validate(context({ heightUnit: "MM" }));
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "GS1_DIMENSION_INCOMPLETE", field: "height" }));
  });
});
