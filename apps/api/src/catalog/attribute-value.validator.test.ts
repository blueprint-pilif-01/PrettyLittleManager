import { BadRequestException } from "@nestjs/common";
import { AttributeDataType, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AttributeValueValidator } from "./attribute-value.validator";

const validator = new AttributeValueValidator();

function definition(overrides: Partial<Parameters<AttributeValueValidator["validate"]>[0]> = {}) {
  return {
    id: "6af42e0f-0dbf-4ec7-93b4-f4c810b3e540",
    key: "size",
    dataType: AttributeDataType.SHORT_TEXT,
    isRequired: false,
    minimum: null,
    maximum: null,
    regexPattern: null,
    unitType: null,
    options: [],
    ...overrides,
  };
}

describe("AttributeValueValidator", () => {
  it("validates select options", () => {
    const select = definition({
      dataType: AttributeDataType.SINGLE_SELECT,
      options: [{ value: "red" }, { value: "blue" }],
    });
    expect(validator.validate(select, "red")).toBe("red");
    expect(() => validator.validate(select, "green")).toThrow(BadRequestException);
  });

  it("validates numeric ranges", () => {
    const number = definition({
      dataType: AttributeDataType.INTEGER,
      minimum: new Prisma.Decimal(1),
      maximum: new Prisma.Decimal(10),
    });
    expect(validator.validate(number, 5)).toBe(5);
    expect(() => validator.validate(number, 11)).toThrow("Value must be at most 10");
  });

  it("sanitizes rich text attribute values", () => {
    const richText = definition({ dataType: AttributeDataType.RICH_TEXT });
    expect(validator.validate(richText, '<strong>Safe</strong><script>bad()</script>')).toBe("<strong>Safe</strong>");
  });
});
