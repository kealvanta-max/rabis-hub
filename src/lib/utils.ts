import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Accepts a Firestore Timestamp-like object, Date, string or number. */
export function toDate(
  value: unknown
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === "function") {
      try {
        const date = maybeTimestamp.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
      } catch {
        /* ignore and fall through */
      }
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return new Date(maybeTimestamp.seconds * 1000);
    }
  }
  return null;
}

export function formatDate(value: unknown, fallback = "Not scheduled"): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : fallback;
}

export function formatDateTime(value: unknown, fallback = "—"): string {
  const date = toDate(value);
  return date ? date.toLocaleString("en-GB") : fallback;
}

/** Formats a date for an <input type="date"> value. */
export function toDateInputValue(value: unknown): string {
  const date = toDate(value) ?? new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
