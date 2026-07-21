import { describe, expect, it } from "vitest";
import {
  buildEmagProductOfferPayload,
  type EmagPayloadSource,
} from "./emag-payload.builder";

const source = (): EmagPayloadSource => ({
  publicationPath: "NEW_PRODUCT",
  sellerProductId: 42,
  externalCategoryId: 1001,
  name: "Produs",
  partNumber: "PART-42",
  brand: "Aline",
  sourceLanguage: "ro_RO",
  images: [],
  gtin: "5941234123457",
  categoryRequiresEan: true,
  categoryRequiresWarranty: false,
  warrantyMonths: 24,
  characteristics: [{ characteristicId: 7, value: "Bumbac" }],
  requiredCharacteristicIds: [7],
  salePrice: "100.0000",
  minimumSalePrice: "90.0000",
  maximumSalePrice: "150.0000",
  recommendedPrice: "120.0000",
  vatId: 1,
  handlingTimeId: 1,
  emagGenius: true,
  offerStatus: 1,
  stock: 3,
});

describe("eMAG payload builder", () => {
  it("builds the documented data item without wrapping it twice", () => {
    const result = buildEmagProductOfferPayload(source());
    expect(result.issues).toEqual([]);
    expect(result.payload).toMatchObject({
      id: 42,
      category_id: 1001,
      sale_price: "100.0000",
      vat_id: 1,
      stock: [{ warehouse_id: 1, value: 3 }],
    });
  });
  it("blocks missing mandatory dynamic characteristics", () => {
    const input = source();
    input.characteristics = [];
    expect(buildEmagProductOfferPayload(input).issues).toContainEqual(
      expect.objectContaining({ code: "EMAG_CHARACTERISTIC_REQUIRED" }),
    );
  });
  it("requires part_number_key for attachment", () => {
    const input = source();
    input.publicationPath = "ATTACH_EXISTING";
    input.partNumberKey = null;
    expect(buildEmagProductOfferPayload(input).issues).toContainEqual(
      expect.objectContaining({ code: "EMAG_PART_NUMBER_KEY_REQUIRED" }),
    );
  });
  it("projects every sellable family member with the documented eMAG family keys", () => {
    const input = source();
    input.family = {
      id: 120,
      name: "Costum medical, Model Clasic, Bumbac",
      familyTypeId: 4140,
    };
    input.allowedFamilyTypeIds = [4140, 5401];

    const result = buildEmagProductOfferPayload(input);

    expect(result.issues).toEqual([]);
    expect(result.payload.family).toEqual({
      id: 120,
      name: "Costum medical, Model Clasic, Bumbac",
      family_type_id: 4140,
    });
  });
  it("rejects a missing or category-incompatible family type", () => {
    const missing = source();
    missing.family = { id: 120, name: "Costum medical" };
    expect(buildEmagProductOfferPayload(missing).issues).toContainEqual(
      expect.objectContaining({ code: "EMAG_FAMILY_TYPE_REQUIRED" }),
    );

    const incompatible = source();
    incompatible.family = {
      id: 120,
      name: "Costum medical",
      familyTypeId: 9999,
    };
    incompatible.allowedFamilyTypeIds = [4140];
    expect(buildEmagProductOfferPayload(incompatible).issues).toContainEqual(
      expect.objectContaining({ code: "EMAG_FAMILY_TYPE_INVALID" }),
    );
  });
});
