/**
 * Live capture, and the fallback that keeps a member out of a dead end.
 *
 * What can and cannot be tested here
 * ---------------------------------
 * A test runner has no camera, so this file cannot prove that a real member can
 * take a real photo. Claiming otherwise would be the same species of lie as the
 * hardcoded "no obvious problem" this work exists to remove.
 *
 * What it can prove is structural, and those are the properties that regress:
 *
 *   - the selfie slot has no file input at all, so the bypass cannot return
 *   - the capture mode is recorded, and "no camera" is a value the server sees
 *   - the fallback routes to a human instead of blocking the member
 *   - the UI reports the server's verdict rather than inventing one
 *
 * The absence of a picker is the single most important assertion in this file.
 * A future developer adding "just a small gallery option for broken cameras"
 * would reopen the exact hole that let a photograph of a dog into the queue.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

const capture = read("src/components/ui/selfie-capture.tsx");
const signupPage = read("src/app/auth/page.tsx");
const upload = read("src/components/ui/image-upload.tsx");
const cloudinary = read("src/lib/cloudinary.ts");

describe("the selfie slot cannot accept a stored file", () => {
  it("contains no file input of any kind", () => {
    expect(capture).not.toContain('type="file"');
    expect(capture).not.toContain("accept=");
    expect(capture).not.toContain("inputRef");
  });

  it("requires a live media stream", () => {
    expect(capture).toContain("getUserMedia");
    expect(capture).toContain('facingMode: "user"');
    // The stream must be released, or the next screen cannot open the camera.
    expect(capture).toContain("getTracks().forEach((track) => track.stop())");
  });

  it("is what the signup page renders for the passport photo", () => {
    /*
     * The regression this guards: the page kept an `ImageUpload` with
     * `verify="selfie"` after the component existed, so the bypass survived the
     * fix. The slot must be the live component, and the label must still be the
     * one members see.
     */
    expect(signupPage).toContain("SelfieCapture");
    expect(signupPage).toContain('label="Passport Photo / Selfie"');
  });
});

describe("the capture mode is honest about how the photo was made", () => {
  it("distinguishes a live capture from the no-camera fallback", () => {
    expect(capture).toContain('"live-camera"');
    expect(capture).toContain('"fallback-no-camera"');
  });

  it("sends the mode with the submission", () => {
    /*
     * Without this the server cannot tell a live frame from a stored file, and
     * `no-live-capture` — one of the three signals that can combine into a
     * refusal — would be permanently false.
     */
    expect(signupPage).toContain("selfieCaptureMode");
    expect(signupPage).toContain("captureMode");
  });

  it("records the mode on the application", () => {
    const submit = read("src/app/api/signup/submit/route.ts");
    expect(submit).toContain("kycSelfieCaptureMode");
    expect(submit).toContain('body.selfieCaptureMode === "live-camera"');
  });
});

describe("a member with no camera is never trapped", () => {
  it("offers the fallback in the UI", () => {
    expect(capture).toContain("My camera will not open");
    expect(capture).toContain("Ask Rabi to verify you by hand");
  });

  it("explains that the fallback is a human check, not a rejection", () => {
    expect(capture).toContain("Nothing is rejected");
  });

  it("keeps the fallback out of the refusal path on the server", () => {
    /*
     * A missing camera is one signal. On its own it flags for Rabi; it must
     * never be counted as two. `assessCardRisk` is where that rule lives, and
     * this asserts the server actually feeds it the live-capture fact.
     */
    const submit = read("src/app/api/signup/submit/route.ts");
    expect(submit).toContain("assessCardRisk");
    expect(submit).toContain("liveCapture:");
  });
});

describe("the UI reports the server's verdict instead of inventing one", () => {
  it("no longer hardcodes a reassuring sentence", () => {
    /*
     * The original bug: every successful upload produced the fixed string
     * "we could not find an obvious problem", whatever the server had said. The
     * dog's own screening reported that it could not confirm a face, and the
     * member was told there was no problem.
     */
    expect(upload).not.toContain("awaiting-server-screening");
    expect(upload).toContain("buildVerdict");
  });

  it("surfaces a screen finding without calling it a rejection", () => {
    expect(upload).toContain("We noticed this is a photo of a screen");
    // It stays a review, with the upload kept: a digital copy is not fraud.
    expect(upload).toContain('screen-photo-flagged');
  });

  it("carries the server's reasons through the upload client", () => {
    /*
     * The root cause of the lie was here: the upload function returned only the
     * URL, so the component had nothing to report. It now returns the reasons.
     */
    expect(cloudinary).toContain("UploadedEvidence");
    expect(cloudinary).toContain("screenPhoto:");
    expect(cloudinary).not.toMatch(/Promise<string>/);
  });
});

describe("quality of the photograph, not just its existence", () => {
  it("picks the sharpest of several frames rather than the first", () => {
    /*
     * A single grab catches blinks and motion blur, and the member then cannot
     * explain why the next screen doubts them. Five frames costs half a second.
     */
    expect(capture).toContain("BURST_FRAMES");
    expect(capture).toContain("sharpness");
    expect(capture).toMatch(/bestScore/);
  });

  it("gives a specific reason for a blocked camera", () => {
    expect(capture).toContain("NotAllowedError");
    expect(capture).toContain("NotReadableError");
    expect(capture).toContain("Another app is using the camera");
  });
});
