import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("ro-RO").format(value);
}

export function formatCurrency(value: number, currency = "RON") {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

const relativeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

/** "3 minutes ago" style label; falls back to "just now" under one minute. */
export function formatRelativeTime(value: string | Date) {
  const timestamp = value instanceof Date ? value : new Date(value);
  const elapsed = timestamp.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  for (const [unit, milliseconds] of relativeUnits) {
    if (Math.abs(elapsed) >= milliseconds) {
      return formatter.format(Math.round(elapsed / milliseconds), unit);
    }
  }
  return "just now";
}

export function formatExactTime(value: string | Date) {
  const timestamp = value instanceof Date ? value : new Date(value);
  return timestamp.toLocaleString("ro-RO");
}
