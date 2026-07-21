import sanitizeHtml from "sanitize-html";

export function sanitizeRichText(value: string | undefined) {
  if (value === undefined) return undefined;
  return sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          rel: "nofollow noopener noreferrer",
          ...(attributes.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
    },
    disallowedTagsMode: "discard",
  });
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 170);
}

export function variationKey(values: Record<string, string>) {
  const entries = Object.entries(values)
    .map(([key, value]) => [key.trim().toLowerCase(), value.trim().toLowerCase()] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length
    ? entries.map(([key, value]) => `${key}=${value}`).join("|")
    : "default";
}
