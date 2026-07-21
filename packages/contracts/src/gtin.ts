const supportedLengths = new Set([8, 12, 13, 14]);

export function calculateGtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body) || !supportedLengths.has(body.length + 1)) {
    throw new Error("GTIN body must be numeric and contain 7, 11, 12, or 13 digits");
  }

  let sum = 0;
  for (let index = body.length - 1, position = 0; index >= 0; index--, position++) {
    const digit = Number(body[index]);
    sum += digit * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || !supportedLengths.has(value.length)) return false;
  const body = value.slice(0, -1);
  return calculateGtinCheckDigit(body) === Number(value.at(-1));
}

export function gtinTypeFor(value: string) {
  if (!supportedLengths.has(value.length)) return undefined;
  return `GTIN_${value.length}` as "GTIN_8" | "GTIN_12" | "GTIN_13" | "GTIN_14";
}
