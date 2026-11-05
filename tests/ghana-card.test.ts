import { describe, expect, it } from "vitest";
import { formatGhanaCardInput, validateGhanaCardFormat } from "@/lib/ghana-card";

describe("validateGhanaCardFormat", () => {
  it("accepts the GHA-XXXXXXXXX-X format", () => {
    expect(validateGhanaCardFormat("GHA-123456789-0")).toBe(true);
    expect(validateGhanaCardFormat(" gha-123456789-0 ")).toBe(true);
  });

  it("rejects incomplete or malformed pins", () => {
    expect(validateGhanaCardFormat("")).toBe(false);
    expect(validateGhanaCardFormat("GHA-12345678-0")).toBe(false);
    expect(validateGhanaCardFormat("GHA1234567890")).toBe(false);
    expect(validateGhanaCardFormat("ABC-123456789-0")).toBe(false);
  });
});

describe("formatGhanaCardInput", () => {
  it("adds the GHA prefix to raw digits", () => {
    expect(formatGhanaCardInput("1234567890")).toBe("GHA-123456789-0");
  });

  it("formats typed prefixes", () => {
    expect(formatGhanaCardInput("gha1234567890")).toBe("GHA-123456789-0");
  });

  it("handles empty input", () => {
    expect(formatGhanaCardInput("")).toBe("");
  });
});
