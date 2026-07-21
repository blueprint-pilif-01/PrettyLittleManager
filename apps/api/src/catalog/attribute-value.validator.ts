import { BadRequestException, Injectable } from "@nestjs/common";
import { AttributeDataType, Prisma } from "@prisma/client";
import { sanitizeRichText } from "./catalog.utils";

type Definition = {
  id: string;
  key: string;
  dataType: AttributeDataType;
  isRequired: boolean;
  minimum: Prisma.Decimal | null;
  maximum: Prisma.Decimal | null;
  regexPattern: string | null;
  unitType: string | null;
  options: Array<{ value: string }>;
};

@Injectable()
export class AttributeValueValidator {
  validate(definition: Definition, value: unknown): Prisma.InputJsonValue {
    if (value === null || value === undefined || value === "") {
      if (definition.isRequired) this.fail(definition, "A value is required");
      this.fail(definition, "Use deletion to clear an optional attribute");
    }

    switch (definition.dataType) {
      case "SHORT_TEXT":
      case "LONG_TEXT":
      case "COLOR":
      case "FILE":
      case "IMAGE":
        return this.text(definition, value);
      case "RICH_TEXT":
        return sanitizeRichText(this.text(definition, value)) ?? "";
      case "EMAIL": {
        const text = this.text(definition, value);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) this.fail(definition, "Enter a valid email address");
        return text;
      }
      case "URL": {
        const text = this.text(definition, value);
        try {
          const url = new URL(text);
          if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error();
        } catch {
          this.fail(definition, "Enter an HTTP or HTTPS URL");
        }
        return text;
      }
      case "INTEGER": {
        if (typeof value !== "number" || !Number.isSafeInteger(value)) this.fail(definition, "Enter an integer");
        this.range(definition, value);
        return value;
      }
      case "DECIMAL": {
        if ((typeof value !== "number" && typeof value !== "string") || !/^\d+(\.\d+)?$/.test(String(value))) {
          this.fail(definition, "Enter a non-negative decimal value");
        }
        this.range(definition, Number(value));
        return String(value);
      }
      case "BOOLEAN":
        if (typeof value !== "boolean") this.fail(definition, "Enter true or false");
        return value;
      case "DATE":
      case "DATETIME": {
        const text = this.text(definition, value);
        if (Number.isNaN(Date.parse(text))) this.fail(definition, "Enter a valid date");
        return text;
      }
      case "SINGLE_SELECT": {
        const text = this.text(definition, value);
        this.allowed(definition, [text]);
        return text;
      }
      case "MULTI_SELECT": {
        if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
          this.fail(definition, "Enter a list of option values");
        }
        const values = [...new Set(value as string[])];
        this.allowed(definition, values);
        return values;
      }
      case "MEASUREMENT": {
        if (!value || typeof value !== "object" || Array.isArray(value)) this.fail(definition, "Enter a measurement object");
        const record = value as Record<string, unknown>;
        const numericValue = record.value;
        const unit = record.unit;
        if ((typeof numericValue !== "number" && typeof numericValue !== "string") || typeof unit !== "string") {
          this.fail(definition, "A measurement requires value and unit");
        }
        if (definition.unitType && unit !== definition.unitType) this.fail(definition, `Use unit ${definition.unitType}`);
        return { value: String(numericValue), unit };
      }
      case "JSON":
        try {
          return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
        } catch {
          this.fail(definition, "Value must be valid JSON");
        }
    }
  }

  private text(definition: Definition, value: unknown) {
    if (typeof value !== "string") this.fail(definition, "Enter a text value");
    if (definition.regexPattern) {
      let pattern: RegExp;
      try {
        pattern = new RegExp(definition.regexPattern);
      } catch {
        this.fail(definition, "The attribute definition has an invalid pattern");
      }
      if (!pattern.test(value)) this.fail(definition, "Value does not match the required format");
    }
    return value;
  }

  private range(definition: Definition, value: number) {
    if (definition.minimum && value < definition.minimum.toNumber()) this.fail(definition, `Value must be at least ${definition.minimum}`);
    if (definition.maximum && value > definition.maximum.toNumber()) this.fail(definition, `Value must be at most ${definition.maximum}`);
  }

  private allowed(definition: Definition, values: string[]) {
    const allowed = new Set(definition.options.map((option) => option.value));
    const invalid = values.filter((value) => !allowed.has(value));
    if (invalid.length) this.fail(definition, `Unsupported option: ${invalid.join(", ")}`);
  }

  private fail(definition: Definition, message: string): never {
    throw new BadRequestException({
      code: "ATTRIBUTE_VALUE_INVALID",
      message,
      field: definition.key,
      attributeDefinitionId: definition.id,
    });
  }
}
