import { describe, expect, it } from "vitest";
import { formatGhanaPhone, isValidGhanaPhone, normalizeGhanaPhone } from "@/lib/phone";

describe("normalizeGhanaPhone", () => {
  it("converts a local 0-prefixed number", () => {
    expect(normalizeGhanaPhone("0504701032")).toBe("+233504701032");
  });

  it("accepts spaces and dashes", () => {
    expect(normalizeGhanaPhone("050 470 1032")).toBe("+233504701032");
    expect(normalizeGhanaPhone("050-470-1032")).toBe("+233504701032");
  });

  it("keeps already-normalised numbers", () => {
    expect(normalizeGhanaPhone("+233504701032")).toBe("+233504701032");
    expect(normalizeGhanaPhone("233504701032")).toBe("+233504701032");
  });

  it("prefixes bare digits", () => {
    expect(normalizeGhanaPhone("504701032")).toBe("+233504701032");
  });
});

describe("isValidGhanaPhone", () => {
  it("accepts valid Ghanaian numbers", () => {
    expect(isValidGhanaPhone("0244990995")).toBe(true);
    expect(isValidGhanaPhone("+233 24 499 0995")).toBe(true);
  });

  it("rejects short, empty and foreign numbers", () => {
    expect(isValidGhanaPhone("")).toBe(false);
    expect(isValidGhanaPhone("02449909")).toBe(false);
    expect(isValidGhanaPhone("+15551234567")).toBe(false);
  });
});

describe("formatGhanaPhone", () => {
  it("pretty prints a normalised number", () => {
    expect(formatGhanaPhone("0504701032")).toBe("+233 50 470 1032");
  });

  it("returns input unchanged when it cannot be parsed", () => {
    expect(formatGhanaPhone("abc")).toBe("abc");
  });
});
