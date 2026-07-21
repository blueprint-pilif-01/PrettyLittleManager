import { describe, expect, it } from "vitest";
import { calculateGtinCheckDigit, gtinTypeFor, isValidGtin } from "./gtin";

describe("GTIN validation", () => {
  it("calculates a GTIN-13 check digit", () => {
    expect(calculateGtinCheckDigit("594123412345")).toBe(3);
    expect(isValidGtin("5941234123453")).toBe(true);
  });

  it("rejects wrong checksums and unsupported lengths", () => {
    expect(isValidGtin("5941234123454")).toBe(false);
    expect(isValidGtin("1234567890")).toBe(false);
    expect(isValidGtin("ABC12345")).toBe(false);
  });

  it("identifies supported GTIN types", () => {
    expect(gtinTypeFor("5941234123453")).toBe("GTIN_13");
    expect(gtinTypeFor("1234")).toBeUndefined();
  });
});
