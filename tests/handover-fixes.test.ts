import fs from "node:fs";
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

  it("never decides from a browser heuristic, and never hides a server refusal", () => {
    // The browser still does not adjudicate: nothing in the upload component
    // inspects pixels to decide whether a face exists. But a refusal the server
    // reports must be shown, not swallowed, so the member is told to retake the
    // photo instead of being sent to the WhatsApp fallback.
    expect(authPage).toContain("const selfieReady = Boolean(form.passportPhoto)");
    expect(upload).toContain("awaiting-server-screening");
    expect(upload).not.toContain("serverKycCheck");
    expect(upload).toContain("KycRejectionError");
    expect(upload).toContain('"selfie"');
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
    // Locate the banner, then the primary action inside it. A byte offset made
    // this fail whenever the banner gained a line of helpful copy, which is a
    // false alarm about a real requirement.
    const banner = adminPage.slice(adminPage.indexOf('aria-label="Pending applications"'));
    const primary = banner.slice(0, banner.indexOf("Review next") + 40);
    expect(primary).toContain("setSelectedUser(next)");
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
  const diagnose = read("src/app/api/kyc/diagnose/route.ts");
  const signup = read("src/app/api/signup/submit/route.ts");
  const faceScan = read("src/components/ui/face-scan.tsx");
  const deterministic = read("src/lib/kyc-deterministic.ts");

  /*
   * Strategy A.
   *
   * There is no third-party identity provider any more. Four were tried and
   * three were wrong: a Python worker that was never deployed, a browser OCR
   * path that shipped a 4MB model to phones, and OOTO, whose two keys were
   * never set in Vercel, so every call it made answered 503. What is left is
   * six checks that need no key at all, and Rabi for everything else.
   *
   * These fences keep the deleted shapes from creeping back, because each one
   * looked reasonable in isolation and each one was dead on arrival.
   */

  it("has no third-party identity provider in the signup path", () => {
    expect(signup).not.toContain("ooto");
    expect(signup).not.toContain("OOTO");
    expect(read(".env.example")).not.toContain("OOTO_APP_KEY");
    expect(fs.existsSync(new URL("../src/lib/ooto.ts", import.meta.url))).toBe(false);
    expect(fs.existsSync(new URL("../src/lib/kyc-server-check.ts", import.meta.url))).toBe(false);
    expect(fs.existsSync(new URL("../src/app/api/kyc/verify/route.ts", import.meta.url))).toBe(
      false
    );
  });

  it("runs the deterministic checks before any model is asked", () => {
    /*
     * Order matters and this is the assertion for it. The deterministic pass is
     * a fact about the bytes; the model is an opinion. On a tie the fact wins,
     * and the fact is cheaper and offline.
     */
    expect(signup.indexOf("screenDeterministically(")).toBeGreaterThan(-1);
    expect(signup.indexOf("screenDeterministically(")).toBeLessThan(
      signup.indexOf("screenKycImages(")
    );
  });

  it("refuses an outright rejection and still requires a human", () => {
    expect(signup).toContain('code: "kyc-screening-rejected"');
    expect(signup).toContain("422");
    expect(signup).toContain('kycReviewStatus: "manual_review_required"');
    expect(signup).toContain('status: "pending"');
  });

  it("never records an AI outage as a pass", () => {
    expect(signup).toContain("verification_unavailable");
    expect(signup).not.toContain('screeningState = "screened_pass"');
  });

  it("records a name or date disagreement for Rabi instead of refusing", () => {
    /* The card's holder and the applicant can legitimately differ by marriage. */
    expect(signup).toContain("readCardIdentity(");
    expect(signup).toContain("manual_review_required");
  });

  it("saves the identity clip without pretending to verify it server-side", () => {
    /*
     * `/api/kyc/verify` required an authenticated account and the clip is filmed
     * before the account exists, so it answered 401 to every real signup. The
     * face scan now uploads and says what actually happens next.
     */
    expect(faceScan).not.toContain("serverKycCheck");
    /* Nothing in the client may call a route that needs an account it lacks. */
    expect(faceScan).not.toContain("fetch(\"/api/kyc");
    expect(faceScan.toLowerCase()).toContain("rabi to review");
  });

  it("keeps every deterministic check keyless", () => {
    /*
     * If a future edit makes any of these need an API key, signup stops working
     * on the day the free tier is exhausted. The check names are the contract.
     */
    for (const name of [
      "readTd1",
      "matchTypedPin",
      "judgeCardGeometry",
      "cardTemplateMarkers",
      "judgeSelfiePhoto",
    ]) {
      expect(deterministic).toMatch(new RegExp(`export (async )?function ${name}\\(`));
    }
  });

  it("can prove the vision credentials from production", () => {
    expect(diagnose).toContain("if (!actor.admin)");
    // It must exercise the real screening path with a synthetic image, so the
    // answer describes the deployed key rather than the presence of a variable.
    expect(diagnose).toContain("screenSelfie(");
    expect(diagnose).toContain("visionProviderNames()");
    // A grey square must not be reported as a human face.
    expect(diagnose).toContain('result.signals?.subject === "human_face"');
  });
});
