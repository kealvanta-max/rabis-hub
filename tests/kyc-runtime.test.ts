import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateSelfie } from "@/lib/kyc-verification";

/**
 * The owner uploaded a photo of a dog as his selfie and the app said "review".
 * It should have been refused outright. These pin the two reasons it was not:
 * the face model never loaded (wrong wasm version, and our own CSP blocked the
 * CDN it came from), and the card reader could never load either.
 */
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("a photo of an animal is refused, not sent to a human", () => {
  it("rejects a selfie with no human face", () => {
    const verdict = evaluateSelfie({ faceCount: 0, areaRatio: 0, confidence: 0 });
    expect(verdict.status).toBe("rejected");
    expect(verdict.reasons).toContain("no-face");
    expect(verdict.message).toMatch(/human face/i);
  });

  it("rejects a selfie with more than one face", () => {
    expect(evaluateSelfie({ faceCount: 2, areaRatio: 0.2, confidence: 0.9 }).status).toBe("rejected");
  });

  it("never sends an unverified photo to a human, even when the detector fails", () => {
    const verdict = evaluateSelfie({ faceCount: 0, areaRatio: 0, confidence: 0 }, true);
    expect(verdict.status).toBe("rejected");
    expect(verdict.reasons).toContain("detector-unavailable");
  });

  it("downscales a phone photo before the face model sees it", () => {
    // A 4000 pixel phone photo used to exhaust the model on mid-range Android,
    // fail, and fall back to manual review. That fallback is gone, so the size
    // limit is what keeps a real member from being blocked.
    const face = read("src/lib/face-detection.ts");
    expect(face).toContain("MAX_DETECT_EDGE");
    expect(face).toContain("createImageBitmap(canvas)");
  });

  it("treats a detector failure as a rejection, never as isHuman", () => {
    const face = read("src/lib/face-detection.ts");
    expect(face).toContain("Fail CLOSED");
    expect(face).not.toContain("Don't block a real\n    // signup");
  });
});

describe("the KYC runtimes are served by us, not a blocked CDN", () => {
  const face = read("src/lib/face-detection.ts");
  const scan = read("src/components/ui/face-scan.tsx");
  const ocr = read("src/lib/ghana-card-ocr.ts");
  const config = read("next.config.mjs");
  const pkg = read("package.json");

  it("loads the MediaPipe runtime from our own domain", () => {
    expect(face).toContain('const LOCAL_WASM = "/kyc/mediapipe"');
    expect(face).toContain("FilesetResolver");
    // The wasm was pinned to a version the installed API does not match.
    expect(face).not.toContain("tasks-vision@0.10.12");
    expect(scan).not.toContain("tasks-vision@0.10.12");
  });

  it("points the card reader at local worker, engine and language files", () => {
    expect(ocr).toContain("/kyc/tesseract/worker.min.js");
    expect(ocr).toContain("/kyc/tesseract/core");
    expect(ocr).toContain("/kyc/tesseract/lang");
  });

  it("ships those files with the build", () => {
    expect(pkg).toContain("scripts/vendor-kyc-assets.mjs");
    expect(pkg).toContain('"prebuild"');
  });

  it("keeps the fallback origins allowed by our own CSP", () => {
    // A CSP that blocks the model loader switches KYC off for the whole country.
    expect(config).toMatch(/script-src[^"]*cdn\.jsdelivr\.net/);
    expect(config).toContain("tessdata.projectnaptha.com");
  });
});
