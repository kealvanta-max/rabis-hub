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

  it("keeps uploaded evidence pending instead of rejecting by browser heuristics", () => {
    expect(authPage).toContain("const selfieReady = Boolean(form.passportPhoto)");
    expect(upload).toContain("awaiting-server-screening");
    expect(upload).not.toContain("serverKycCheck");
    expect(upload).not.toContain('status: "rejected"');
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

describe("server-side identity checks", () => {
  const ooto = read("src/lib/ooto.ts");
  const route = read("src/app/api/kyc/verify/route.ts");
  const diagnose = read("src/app/api/kyc/diagnose/route.ts");
  const upload = read("src/components/ui/image-upload.tsx");
  const faceScan = read("src/components/ui/face-scan.tsx");

  it("keeps the credentials on the server", () => {
    expect(ooto).toContain("process.env.OOTO_APP_ID");
    expect(ooto).toContain("process.env.OOTO_APP_KEY");
    // A NEXT_PUBLIC_ variant would ship the app key to every browser.
    expect(ooto).not.toContain("NEXT_PUBLIC_OOTO");
    expect(read(".env.example")).not.toContain("NEXT_PUBLIC_OOTO");
  });

  it("uses the three real endpoints", () => {
    expect(ooto).toContain("/liveness?check_deepfake=true");
    expect(ooto).toContain("/video/liveness");
    expect(ooto).toContain("/recognize");
    expect(ooto).toContain("/doc/compare");
  });

  it("treats engine code 5 as no human face", () => {
    // "can not detect face" is the answer a photo of a dog produces.
    expect(ooto).toContain("5: \"No human face was found");
    expect(ooto).toContain('reasons.push("no-face")');
  });

  it("refuses to fetch anything but our own uploads", () => {
    // Otherwise the route is a server-side request forger.
    expect(route).toContain('parsed.hostname !== "res.cloudinary.com"');
    expect(route).toContain("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  });

  it("runs signed server screening at application submission and keeps signup pending", () => {
    const signup = read("src/app/api/signup/submit/route.ts");
    expect(upload).toContain("uploadToCloudinary(file)");
    expect(upload).not.toContain("serverKycCheck");
    expect(signup).toContain("KYC_SCREENING_URL");
    expect(signup).toContain("X-Screening-Signature");
    expect(signup).toContain('kycReviewStatus: "manual_review_required"');
    expect(signup).toContain('status: "pending"');
  });

  it("fails closed to manual review when the service is down", () => {
    expect(ooto).toContain('return unavailable("selfie")');
    expect(read("src/lib/kyc-server-check.ts")).toContain("ok: false, skipped: true");
    expect(read("src/app/api/kyc/verify/route.ts")).toContain('code: "verification-unavailable"');
  });

  it("can prove the credentials from production", () => {
    expect(diagnose).toContain("if (!actor.admin)");
    expect(diagnose).toContain("cloud.ooto-ai.com/api/v1.0/liveness");
  });
});
