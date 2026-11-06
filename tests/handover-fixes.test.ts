import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression fences for the pre-handover round.
 *
 * Each of these pins a bug that was visible to the owner on her phone. They are
 * file-level assertions because the failures were mostly wiring: a button wired
 * to the wrong thing, a component left in the tree, a guard that let a photo
 * through. If any of it comes back, CI says so before Rabi sees it.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const authPage = read("src/app/auth/page.tsx");
const dashboard = read("src/app/dashboard/page.tsx");
const adminPage = read("src/app/admin/page.tsx");
const modal = read("src/components/admin/user-detail-modal.tsx");
const upload = read("src/components/ui/image-upload.tsx");
const faceDetection = read("src/lib/face-detection.ts");
const verification = read("src/lib/kyc-verification.ts");

describe("the dog bypass", () => {
  it("treats a detector failure as a rejection, not a manual review", () => {
    expect(verification).toContain('reasons: ["detector-unavailable"]');
    const skippedBlock = verification.slice(verification.indexOf("if (skipped)"));
    expect(skippedBlock.slice(0, 400)).toContain('status: "rejected"');
  });

  it("never returns isHuman true from the failure path", () => {
    expect(faceDetection).toContain("Fail CLOSED");
    const failureBlock = faceDetection.slice(faceDetection.indexOf("Fail CLOSED"));
    expect(failureBlock.slice(0, 800)).toContain("isHuman: false");
  });

  it("downscales before the model runs, so real phones stop failing", () => {
    expect(faceDetection).toContain("MAX_DETECT_EDGE = 1024");
    expect(faceDetection).toContain("createImageBitmap(canvas)");
  });

  it("requires a verified face before the selfie counts as uploaded", () => {
    expect(authPage).toContain('docVerdicts.selfie?.status === "verified"');
    expect(authPage).not.toContain('docVerdicts.selfie?.status !== "rejected"');
  });
});

describe("savings UI is gone", () => {
  it("has no savings card on the member dashboard", () => {
    expect(dashboard).not.toContain("Savings progress");
    expect(dashboard).not.toContain("contributionSummary");
    expect(dashboard).not.toContain("GH₵");
  });

  it("has no savings card in the admin review sheet", () => {
    expect(modal).not.toContain("Savings recorded");
    expect(modal).not.toContain("Record payment");
    expect(modal).not.toContain("contributionSummary");
  });

  it("no longer writes contributions from the admin panel", () => {
    expect(adminPage).not.toContain("recordContribution");
    expect(adminPage).not.toContain("removeContribution");
  });
});

describe("admin pending queue", () => {
  it("opens the review sheet instead of only switching tabs", () => {
    const button = adminPage.slice(adminPage.indexOf('aria-label="Pending applications"'));
    expect(button.slice(0, 1600)).toContain("setSelectedUser(next)");
  });

  it("still offers the full list", () => {
    expect(adminPage).toContain("See all pending");
    expect(adminPage).toContain('setFilter("pending")');
  });
});

describe("math captcha", () => {
  it("says the answer was wrong, in red, and asks a new question", () => {
    expect(authPage).toContain("Incorrect answer, please try again.");
    expect(authPage).toContain("newMathQuestion()");
    expect(authPage).toContain('role="alert"');
  });

  it("is not a dead disabled button", () => {
    expect(authPage).not.toContain("disabled={!mathPassed");
  });
});

describe("developer tools are out of the admin panel", () => {
  it("has no photo storage self-test", () => {
    expect(adminPage).not.toContain("Photo storage check");
    expect(adminPage).not.toContain("runStorageCheck");
    expect(adminPage).not.toContain("checkingStorage");
  });
});

describe("premium loading", () => {
  it("ships a blur-up image component", () => {
    const blurUp = read("src/components/ui/blur-up-image.tsx");
    expect(blurUp).toContain("e_blur");
    expect(blurUp).toContain("w_32");
  });

  it("uses it for the document previews and the upload preview", () => {
    expect(upload).toContain("BlurUpImage");
    expect(modal).toContain("BlurUpImage");
  });

  it("paints a skeleton while a route resolves", () => {
    expect(read("src/app/admin/loading.tsx")).toContain("SkeletonPage");
    expect(read("src/app/dashboard/loading.tsx")).toContain("DashboardSkeleton");
  });

  it("keeps the sweep gentle and respects reduced motion", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("skeleton-sweep 1.9s");
    expect(css).toContain("prefers-reduced-motion");
  });
});
