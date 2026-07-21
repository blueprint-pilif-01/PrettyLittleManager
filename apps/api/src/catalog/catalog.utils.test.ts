import { describe, expect, it } from "vitest";
import { sanitizeRichText, slugify, variationKey } from "./catalog.utils";

describe("catalog utilities", () => {
  it("creates stable variation keys independent of input order and casing", () => {
    expect(variationKey({ Size: " M ", color: "Red" })).toBe("color=red|size=m");
    expect(variationKey({ COLOR: "red", size: "m" })).toBe("color=red|size=m");
    expect(variationKey({})).toBe("default");
  });

  it("creates URL-safe Romanian slugs", () => {
    expect(slugify("Șampon Păr Vopsit 250 ml")).toBe("sampon-par-vopsit-250-ml");
  });

  it("removes unsafe rich-text content", () => {
    const sanitized = sanitizeRichText('<p>Safe</p><script>alert(1)</script><iframe src="x"></iframe>');
    expect(sanitized).toBe("<p>Safe</p>");
  });
});
