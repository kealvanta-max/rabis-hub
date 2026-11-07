import { describe, expect, it } from "vitest";
import { mrzCheckDigit, parseTd1 } from "@/lib/mrz";
import { crossVerifyCard } from "@/lib/kyc-verification";

describe("Ghana Card TD1 checks", () => {
  it("uses ICAO 9303 repeating 7, 3, 1 weights", () => {
    expect(mrzCheckDigit("123456789")).toBe(7);
  });

  it("rejects an unreadable back for manual inspection, not approval", () => {
    expect(crossVerifyCard({ frontText: "GHA-002089279-3", backText: "unreadable" }).status).toBe("review");
  });

  it("requires a parsable MRZ before it can verify a card", () => {
    expect(crossVerifyCard({ frontText: "GHA-002089279-3", backText: "" }).mrzFound).toBe(false);
  });

  it("parses only TD1 lines from OCR text", () => {
    expect(parseTd1("Ghana Card front, no machine-readable zone")).toBeNull();
  });
});
