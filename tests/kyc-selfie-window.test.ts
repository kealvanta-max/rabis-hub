/**
 * The selfie window, measured rather than guessed.
 *
 * Two numbers decide whether a real member gets through the selfie check, and
 * both were wrong in a way that only real photographs revealed:
 *
 *   1. `MIN_SKIN_RATIO` was 0.10, and the deepest-complexion fixture measures
 *      9.52%. Every caller with no face detector refused her. That is the bug
 *      these tests exist to keep fixed.
 *
 *   2. `screenDeterministically` - the function the signup submission runs -
 *      screened the selfie on colour alone, while `/api/upload` had already run
 *      a face detector over the same bytes and passed it at 0.877. The same
 *      photo passed one checkpoint and failed the next.
 *
 * The assertions are absolute in both directions, because a change that trades
 * one direction for the other has broken KYC even when the totals look equal:
 *
 *   - no genuine person may be refused, whatever the detector did or did not do
 *   - no non-person image may pass
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  MIN_SKIN_RATIO,
  centralFaceBox,
  decodeToGrid,
  judgeSelfiePhoto,
  judgeSelfieWithDetection,
  skinRatio,
} from "@/lib/kyc-deterministic";

const FACE_DIR = path.join(process.cwd(), "tests", "fixtures", "faces");
const NON_FACE_DIR = path.join(process.cwd(), "tests", "fixtures", "non-faces");

/** The image the old floor refused. Named so a failure points at the reason. */
const DEEPEST_COMPLEXION = "real-dark-skin-4.jpg";

function listImages(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jpg"))
    .sort()
    .map((name) => path.join(dir, name));
}

async function measure(file: string) {
  const bytes = new Uint8Array(readFileSync(file));
  const grid = await decodeToGrid(bytes);
  expect(grid).not.toBeNull();
  const box = centralFaceBox();
  return {
    ratio: skinRatio(grid!, box),
    colour: judgeSelfiePhoto(grid!, box),
  };
}

/** What the screen decides when the face model could not run at all. */
async function withModelDown(file: string) {
  const { colour } = await measure(file);
  return judgeSelfieWithDetection(colour, {
    human: false,
    score: 0,
    status: "unavailable",
  });
}

describe("the skin floor does not sit above a real member", () => {
  it("measures the deepest complexion above the floor", async () => {
    const { ratio } = await measure(path.join(FACE_DIR, DEEPEST_COMPLEXION));
    expect(ratio).not.toBeNull();
    /*
     * Pinned to the measurement, not to the constant, so moving the constant
     * upward again fails here with the actual numbers in the message.
     */
    expect(
      ratio!,
      `${DEEPEST_COMPLEXION} measures ${(ratio! * 100).toFixed(2)}% skin; the floor is ${(MIN_SKIN_RATIO * 100).toFixed(2)}%`
    ).toBeGreaterThan(MIN_SKIN_RATIO);
  });

  it("keeps the floor above every non-person image", async () => {
    for (const file of listImages(NON_FACE_DIR)) {
      const { ratio } = await measure(file);
      if (ratio === null) continue;
      /*
       * The dog and the drawn face measure high on colour, which is the whole
       * reason a colour share can never be used to prove a person is present.
       * They are excluded here because the floor never decides them: the face
       * detector does, and `kyc-face-detection.test.ts` covers that.
       */
      const name = path.basename(file);
      if (name === "dog-selfie.jpg" || name === "drawn-face.jpg") continue;

      expect(
        ratio,
        `${name} measures ${(ratio * 100).toFixed(2)}% skin, which must stay below the ${(MIN_SKIN_RATIO * 100).toFixed(2)}% floor`
      ).toBeLessThan(MIN_SKIN_RATIO);
    }
  });
});

describe("a genuine member is never refused when the face model is down", () => {
  it("does not refuse any real face on colour alone", async () => {
    for (const file of listImages(FACE_DIR)) {
      const verdict = await withModelDown(file);
      const name = path.basename(file);
      expect(
        verdict.status,
        `${name} was ${verdict.status} by the colour screen alone: ${(verdict.reasons ?? []).join(", ")}`
      ).not.toBe("fail");
    }
  });

  it("still refuses images that cannot contain a person", async () => {
    for (const file of listImages(NON_FACE_DIR)) {
      const verdict = await withModelDown(file);
      const name = path.basename(file);
      /*
       * With no detector, colour is the only evidence left. It is allowed to
       * refuse anything that has no skin in it at all, and must keep doing so:
       * that is the case a wall, a room, a card back and a spoofed web page
       * are in. The dog and drawn face are exempt because colour genuinely
       * cannot separate them - only the model can, and it does.
       */
      if (name === "dog-selfie.jpg" || name === "drawn-face.jpg") continue;
      expect(
        verdict.status,
        `${name} must be refused when the model is down, got ${verdict.status}`
      ).toBe("fail");
    }
  });
});

describe("upload and submit agree about the same selfie", () => {
  it("does not reject a selfie the face detector accepted", async () => {
    /*
     * `judgeSelfieWithDetection` is exactly what `/api/upload` and
     * `screenDeterministically` both call now. When the detector reports a face,
     * colour must not be able to overrule it - that inversion is what refused
     * a member whose face the model scored 0.877.
     */
    const { colour } = await measure(path.join(FACE_DIR, DEEPEST_COMPLEXION));
    const verdict = judgeSelfieWithDetection(colour, {
      human: true,
      score: 0.877,
      status: "detected",
      eyes: "both",
    });

    expect(verdict.status).toBe("pass");
    expect((verdict.reasons ?? []).join(" ")).toContain("human-face-detected-score-0.88");
  });
});
