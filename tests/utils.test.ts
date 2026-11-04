import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, toDate, toDateInputValue } from "@/lib/utils";

describe("toDate", () => {
  it("returns null for empty values", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate("")).toBeNull();
  });

  it("handles Date instances and ISO strings", () => {
    const date = new Date("2026-03-16T12:00:00.000Z");
    expect(toDate(date)?.toISOString()).toBe(date.toISOString());
    expect(toDate("2026-03-16T12:00:00.000Z")?.toISOString()).toBe(date.toISOString());
  });

  it("handles Firestore Timestamp-like objects", () => {
    const fakeTimestamp = { toDate: () => new Date("2026-03-16T12:00:00.000Z") };
    expect(toDate(fakeTimestamp)?.toISOString()).toBe("2026-03-16T12:00:00.000Z");

    const secondsLike = { seconds: 1_773_659_200 };
    expect(toDate(secondsLike)?.getTime()).toBe(1_773_659_200_000);
  });

  it("returns null for invalid values", () => {
    expect(toDate("not-a-date")).toBeNull();
    expect(toDate({ toDate: () => new Date("nope") })).toBeNull();
    expect(toDate({})).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats a valid date", () => {
    expect(formatDate(new Date("2026-03-16T12:00:00.000Z"))).toMatch(/16 Mar 2026/);
  });

  it("falls back when the value is missing", () => {
    expect(formatDate(null)).toBe("Not scheduled");
    expect(formatDate(null, "—")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("defaults to an em dash", () => {
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("toDateInputValue", () => {
  it("returns a yyyy-mm-dd string", () => {
    expect(toDateInputValue(new Date("2026-03-16T12:00:00.000Z"))).toBe("2026-03-16");
  });

  it("falls back to today", () => {
    expect(toDateInputValue(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
