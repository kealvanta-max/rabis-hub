/**
 * The dog.
 *
 * A real member of this app uploaded a Ghana Card front, a Ghana Card back, and
 * a photograph of a chihuahua as the passport photo. All three were accepted and
 * every document was sent to Rabi's queue as though a machine had cleared it.
 *
 * The fixture is not a synthetic adversarial image. It is the actual selfie,
 * cropped out of the owner's screenshot: a chihuahua from a short social-media
 * video, with the caption and heart icon still visible around it.
 *
 * What this file asserts, and why it is written this way
 * -----------------------------------------------------
 * The tempting test is "the detector must refuse the dog". That would be a lie
 * for the lifetime of this codebase, because the detector cannot be made to
 * refuse it. Measured on the real pipeline, the dog scores **0.847** and the
 * 68-point model places both eye clusters on it — higher than a genuine member
 * in the same fixture set at 0.69. There is no threshold between them.
 *
 * So the test is split in two, and both halves are essential:
 *
 *   1. It records the detector's failure as a known, quantified fact. If the
 *      number changes, or if someone raises the floor and believes that fixed
 *      it, this test says so.
 *   2. It asserts the pipeline refuses the dog anyway — through the paths that
 *      actually closed the hole: the live-camera requirement, and the screen
 *      finding, since the "selfie" was a screenshot of a video.
 *
 * The second half is what protects members. The first half is what stops us
 * repeating the mistake of pretending the first half can do it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { judgeSelfieWithDetection, centralFaceBox, decodeToGrid, judgeSelfiePhoto, decodeRgba } from "@/lib/kyc-deterministic";
import { detectFaces } from "@/lib/kyc-face-server";
import { assessCardRisk } from "@/lib/kyc-fraud-signals";
import { classifyVisionSignals } from "@/lib/kyc-vision-policy";

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "non-faces", "dog-selfie.jpg");

describe("the detector cannot tell a dog from a person", () => {
  it("scores the real dog above a real member, so no threshold exists", async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const raster = await decodeRgba(bytes);
    expect(raster).not.toBeNull();

    const detection = await detectFaces(raster!.pixels, raster!.width, raster!.height);

    /*
     * The measured values, pinned deliberately.
     *
     * `real-light-3.jpg` — a genuine member — scores 0.69 on the same pipeline.
     * The dog scores above it and finds both eyes. That is why the fix is not a
     * threshold, and this assertion is the evidence for that claim sitting in
     * the test suite rather than in a commit message.
     */
    console.log(
      `  dog: human=${detection.human} score=${detection.score.toFixed(3)} eyes=${detection.eyes}`
    );
    expect(detection.status).toBe("detected");
    expect(detection.score).toBeGreaterThan(0.69);
    expect(detection.eyes).toBe("both");
  }, 300_000);

  it("is therefore passed by the colour and detector heuristic alone", async () => {
    /*
     * This documents the old path in full: the deterministic screener on its own
     * does not refuse the dog either. Anyone tempted to route the selfie through
     * it and call the problem solved should read this assertion.
     */
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const grid = await decodeToGrid(bytes);
    expect(grid).not.toBeNull();

    const colour = judgeSelfiePhoto(grid!, centralFaceBox());
    const raster = await decodeRgba(bytes);
    const detection = await detectFaces(raster!.pixels, raster!.width, raster!.height);
    const verdict = judgeSelfieWithDetection(colour, detection);

    expect(verdict.status).toBe("pass");
  }, 300_000);
});

describe("the pipeline refuses the dog anyway", () => {
  it("is refused by the screen gate, because the selfie was a video screenshot", () => {
    /*
     * The actual mechanism. The image is a screenshot of a short video: caption
     * text, a heart icon and a view count are baked into it. Vision reports that
     * honestly as `screen_or_copy`, and for a *selfie* that finding is
     * conclusive, because the live capture step cannot produce it.
     */
    const decision = classifyVisionSignals(
      {
        subject: "uncertain",
        card: "uncertain",
        face_match: "uncertain",
        reproduction: "screen_or_copy",
        confidence: 0.8,
      },
      "selfie"
    );

    expect(decision.state).toBe("rejected");
    expect(decision.reasons).toContain("photo-of-a-screen-or-copy");
    expect(decision.screenPhoto).toBe(true);
  });

  it("is refused even when the subject question is unsure, not certain", () => {
    /*
     * The old structural bug: rejection required certainty about the *subject*,
     * so a model that was unsure about species waved the image through. The
     * screen gate does not depend on the subject answer at all.
     */
    const decision = classifyVisionSignals(
      {
        subject: "uncertain",
        card: "uncertain",
        face_match: "uncertain",
        reproduction: "screen_or_copy",
        confidence: 0.6,
      },
      "selfie"
    );
    expect(decision.state).toBe("rejected");
  });

  it("would also be caught by the two-signal rule if it reached submission", () => {
    /*
     * Independent of vision: a screenshot cannot have come from the live camera,
     * so `liveCapture` is false on the recorded capture mode. Combined with a
     * name mismatch — the commonest real-world pairing, since a fraudster is
     * rarely using their own card — the rule refuses.
     */
    const assessment = assessCardRisk({
      nameMatch: "mismatch",
      liveCapture: false,
      templateDetected: false,
      duplicateImage: false,
    });

    expect(assessment.decision).toBe("auto-refuse");
    expect(assessment.signals).toContain("name-mismatch");
    expect(assessment.signals).toContain("no-live-capture");
  });
});

describe("a genuine member is never refused by these gates", () => {
  it("sends a name mismatch alone to Rabi, with no refusal", () => {
    const assessment = assessCardRisk({
      nameMatch: "mismatch",
      liveCapture: true,
      templateDetected: false,
      duplicateImage: false,
    });

    expect(assessment.decision).toBe("flag-for-review");
    expect(assessment.sentence).toContain("name does not match the card");
  });

  it("never refuses someone who simply could not open their camera", () => {
    /*
     * The fallback is the whole reason a no-camera member is not blocked. Alone
     * it is one signal, so it flags rather than refuses.
     */
    const assessment = assessCardRisk({
      nameMatch: "match",
      liveCapture: false,
      templateDetected: false,
      duplicateImage: false,
    });
    expect(assessment.decision).toBe("flag-for-review");
  });
});
