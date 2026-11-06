import { describe, expect, it } from "vitest";
import {
  checkCardAspectRatio,
  checkImageQuality,
  detectIdMarkers,
  differenceHash,
  evaluateIdBack,
  evaluateIdFront,
  evaluateSelfie,
  extractCardNumbers,
  isDuplicateImage,
  normalizeCardNumber,
} from "@/lib/kyc-verification";

const FRONT_TEXT = `
REPUBLIC OF GHANA
NATIONAL IDENTIFICATION AUTHORITY
GHANA CARD
GHANA CARD NUMBER  GHA-123456789-0
DATE OF BIRTH  12-04-1996
`;

describe("Ghana Card number handling", () => {
  it("normalises the human format", () => {
    expect(normalizeCardNumber("GHA-123456789-0")).toBe("GHA1234567890");
    expect(normalizeCardNumber(" gha 123 456 789 0 ")).toBe("GHA1234567890");
  });

  it("extracts card numbers from noisy OCR text", () => {
    expect(extractCardNumbers(FRONT_TEXT)).toContain("GHA1234567890");
    expect(extractCardNumbers("G H A 123 456 789 0")).toContain("GHA1234567890");
  });

  it("returns nothing for unrelated text", () => {
    expect(extractCardNumbers("Good boy, sit. Woof.")).toHaveLength(0);
  });
});

describe("ID markers", () => {
  it("scores a real card header highly", () => {
    expect(detectIdMarkers(FRONT_TEXT).score).toBeGreaterThanOrEqual(80);
  });

  it("scores an unrelated photo at zero", () => {
    const markers = detectIdMarkers("just a photo of a dog");
    expect(markers.ghana).toBe(false);
    expect(markers.score).toBe(0);
  });
});

describe("card aspect ratio", () => {
  it("accepts a landscape card shape", () => {
    expect(checkCardAspectRatio(1000, 630).ok).toBe(true);
  });

  it("rejects a portrait photo", () => {
    expect(checkCardAspectRatio(630, 1000).ok).toBe(false);
  });

  it("rejects an absurdly wide panorama", () => {
    expect(checkCardAspectRatio(3000, 500).ok).toBe(false);
  });
});

describe("front of the card", () => {
  const aspect = checkCardAspectRatio(1000, 630);

  it("verifies when the number and the authority match", () => {
    const verdict = evaluateIdFront(FRONT_TEXT, "GHA-123456789-0", aspect);
    expect(verdict.status).toBe("verified");
    expect(verdict.confidence).toBeGreaterThan(80);
  });

  it("rejects a photo with no Ghana Card markings (e.g. a pet)", () => {
    const verdict = evaluateIdFront("good boy sitting on the grass", "GHA-123456789-0", aspect);
    expect(verdict.status).toBe("rejected");
    expect(verdict.reasons).toContain("no-ghana-markers");
  });

  it("rejects when the printed number does not match the typed number", () => {
    const verdict = evaluateIdFront(FRONT_TEXT, "GHA-987654321-0", aspect);
    expect(verdict.status).toBe("rejected");
    expect(verdict.reasons).toContain("number-mismatch");
  });

  it("rejects before a number has been typed", () => {
    const verdict = evaluateIdFront(FRONT_TEXT, "", aspect);
    expect(verdict.status).toBe("rejected");
  });

  it("rejects a portrait upload even with perfect text", () => {
    const verdict = evaluateIdFront(FRONT_TEXT, "GHA-123456789-0", checkCardAspectRatio(600, 900));
    expect(verdict.status).toBe("rejected");
    expect(verdict.reasons).toContain("aspect-ratio");
  });
});

describe("back of the card", () => {
  const aspect = checkCardAspectRatio(1000, 630);

  it("verifies on Ghana markings alone (barcodes rarely OCR)", () => {
    expect(evaluateIdBack("GHANA NATIONAL IDENTIFICATION AUTHORITY", "GHA-123456789-0", aspect).status).toBe(
      "verified"
    );
  });

  it("rejects an unrelated landscape photo", () => {
    expect(evaluateIdBack("holiday snap by the beach", "GHA-123456789-0", aspect).status).toBe("rejected");
  });
});

describe("selfie", () => {
  it("accepts one well-framed face", () => {
    expect(evaluateSelfie({ faceCount: 1, areaRatio: 0.25, confidence: 0.9 }).status).toBe("verified");
  });

  it("rejects a photo with no face", () => {
    expect(evaluateSelfie({ faceCount: 0, areaRatio: 0, confidence: 0 }).status).toBe("rejected");
  });

  it("rejects a group photo", () => {
    expect(evaluateSelfie({ faceCount: 3, areaRatio: 0.3, confidence: 0.9 }).status).toBe("rejected");
  });

  it("rejects a face that is too small to be a passport photo", () => {
    expect(evaluateSelfie({ faceCount: 1, areaRatio: 0.01, confidence: 0.8 }).status).toBe("rejected");
  });

  it("refuses a photo the detector could not check, instead of passing it on", () => {
    // Fail closed. An unrun check used to hand the photo to a human, which is
    // how a photo of a dog reached the review queue.
    const verdict = evaluateSelfie({ faceCount: 0, areaRatio: 0, confidence: 0 }, true);
    expect(verdict.status).toBe("rejected");
    expect(verdict.reasons).toContain("detector-unavailable");
    expect(verdict.message.toLowerCase()).toContain("again");
  });
});

describe("duplicate image guard", () => {
  const gradient = Array.from({ length: 9 * 8 }, (_, index) => (index % 9) * 24);
  // Two unrelated "photos" — different brightness distribution everywhere.
  const randomish = Array.from({ length: 9 * 8 }, (_, index) => ((index * 37 + 91) % 7) * 32);

  it("produces a stable hash for the same pixels", () => {
    expect(differenceHash(gradient)).toBe(differenceHash(gradient));
  });

  it("flags identical images as duplicates", () => {
    const hash = differenceHash(gradient);
    expect(isDuplicateImage(hash, hash)).toBe(true);
  });

  it("does not flag different images", () => {
    expect(isDuplicateImage(differenceHash(gradient), differenceHash(randomish))).toBe(false);
  });

  it("ignores missing hashes", () => {
    expect(isDuplicateImage(undefined, null)).toBe(false);
  });
});

describe("photo quality guard", () => {
  it("accepts a normally exposed photo", () => {
    expect(checkImageQuality({ brightness: 130, contrast: 45 }).ok).toBe(true);
  });

  it("rejects a covered lens", () => {
    expect(checkImageQuality({ brightness: 12, contrast: 30 }).ok).toBe(false);
  });

  it("rejects flash glare", () => {
    expect(checkImageQuality({ brightness: 250, contrast: 30 }).ok).toBe(false);
  });

  it("rejects a flat, blurred frame", () => {
    expect(checkImageQuality({ brightness: 128, contrast: 4 }).ok).toBe(false);
  });
});
