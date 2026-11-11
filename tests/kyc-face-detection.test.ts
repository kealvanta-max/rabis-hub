/**
 * The selfie screen, against real photographs.
 *
 * Every previous version of this test ran on drawn fixtures — flat shapes and
 * gradients — and passed while the real screen refused genuine members. These
 * are actual photographs, and they cover the case that matters most in Ghana:
 * deep skin tone under ordinary indoor light. Two of these members scored under
 * the old colour floor and would have been turned away.
 *
 * The assertions are deliberately absolute in both directions:
 *   - no genuine person may ever be refused
 *   - no non-person image may ever pass
 *
 * A change that trades one for the other has broken KYC, even if the totals look
 * unchanged.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  centralFaceBox,
  decodeRgba,
  decodeToGrid,
  judgeSelfiePhoto,
  judgeSelfieWithDetection,
} from "@/lib/kyc-deterministic";
import { detectFaces } from "@/lib/kyc-face-server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jpeg = require("jpeg-js") as {
  decode: (input: Uint8Array, options?: { useTArray?: boolean; formatAsRGBA?: boolean }) => {
    width: number;
    height: number;
    data: Uint8Array;
  };
};

const FACE_DIR = path.join(process.cwd(), "tests", "fixtures", "faces");
const NON_FACE_DIR = path.join(process.cwd(), "tests", "fixtures", "non-faces");

function listImages(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jpg"))
    .map((name) => path.join(dir, name));
}

/** Mirrors `/api/upload` for a selfie, in the same order the route runs it. */
async function screenSelfie(file: string) {
  const bytes = new Uint8Array(readFileSync(file));
  const grid = await decodeToGrid(bytes);
  if (!grid) return { status: "unreadable" as const, reasons: ["no-grid"], face: 0 };

  const box = centralFaceBox();
  const colour = judgeSelfiePhoto(grid, box);

  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  const raster = await decodeRgba(bytes);
  expect(raster).not.toBeNull();
  expect(decoded.width).toBe(raster!.width);

  const detection = await detectFaces(raster!.pixels, raster!.width, raster!.height);
  const verdict = judgeSelfieWithDetection(colour, detection);

  return { status: verdict.status, reasons: verdict.reasons ?? [], face: detection.score };
}

describe("selfie screening against real photographs", () => {
  const realPeople = listImages(FACE_DIR);
  const nonPeople = listImages(NON_FACE_DIR);

  it("has fixtures to test with", () => {
    expect(realPeople.length).toBeGreaterThanOrEqual(7);
    expect(nonPeople.length).toBeGreaterThanOrEqual(6);
  });

  it("never refuses a real person", async () => {
    const refused: string[] = [];

    for (const file of realPeople) {
      const result = await screenSelfie(file);
      const name = path.basename(file);
      console.log(`  ${name.padEnd(24)} ${result.status.padEnd(12)} face=${result.face}`);
      if (result.status === "fail") refused.push(`${name} (${result.reasons.join(",")})`);
    }

    /*
     * Named, not counted. "0 failures" is easy to fake by accident; "this
     * particular person was refused" is not.
     */
    expect(refused, `genuine members refused: ${refused.join("; ")}`).toEqual([]);
  }, 300_000);

  it("refuses every image that is not a person, except the one it cannot", async () => {
    const accepted: string[] = [];

    for (const file of nonPeople) {
      const result = await screenSelfie(file);
      const name = path.basename(file);
      console.log(`  ${name.padEnd(24)} ${result.status.padEnd(12)} face=${result.face} ${result.reasons.join(",")}`);
      if (result.status !== "fail") accepted.push(name);
    }

    /*
     * `dog-selfie.jpg` is exempt, and the exemption is the finding.
     *
     * This fixture is the actual photograph from the owner's report, cropped out
     * of her screenshot. Measured on this pipeline it scores 0.847 with both eye
     * clusters found, against 0.69 for a genuine member in the same set. No
     * threshold separates them, so demanding that this screen refuse it would
     * either fail forever or be "fixed" by raising the floor until it refuses
     * real people too.
     *
     * The dog is refused by the live-capture requirement and by the screen gate
     * instead. `tests/kyc-dog.test.ts` holds those assertions and pins this score
     * so the limitation stays measured rather than quietly forgotten.
     */
    expect(new Set(accepted)).toEqual(new Set(["dog-selfie.jpg"]));
  }, 300_000);

  it("keeps a wide margin between the worst real face and the best fake", async () => {
    const scores: Array<{ name: string; score: number; real: boolean }> = [];

    for (const file of realPeople) {
      const raster = await decodeRgba(new Uint8Array(readFileSync(file)));
      const detection = await detectFaces(raster!.pixels, raster!.width, raster!.height);
      scores.push({ name: path.basename(file), score: detection.score, real: true });
    }
    for (const file of nonPeople) {
      const raster = await decodeRgba(new Uint8Array(readFileSync(file)));
      const detection = await detectFaces(raster!.pixels, raster!.width, raster!.height);
      scores.push({ name: path.basename(file), score: detection.score, real: false });
    }

    /*
     * The dog is excluded from this comparison because it is the one fixture
     * whose score is known to beat a real member, and including it would make
     * this assertion describe a margin that does not exist.
     */
    const measured = scores.filter((s) => s.name !== "dog-selfie.jpg");
    const lowestReal = measured.filter((s) => s.real).sort((a, b) => a.score - b.score)[0];
    const highestFake = measured.filter((s) => !s.real).sort((a, b) => b.score - a.score)[0];

    console.log(`  lowest real: ${lowestReal.name} = ${lowestReal.score}`);
    console.log(`  highest fake: ${highestFake.name} = ${highestFake.score}`);

    /*
     * The threshold sits between these two. If they ever cross, the model or the
     * fixtures have changed enough that the threshold needs measuring again
     * rather than assuming.
     *
     * The dog's score is reported separately and is allowed to cross. That is
     * not a regression being tolerated: it is a documented property of
     * SSD-MobileNetV1 on animal faces, recorded in docs/KYC-HARDENING-PLAN.md
     * and pinned by kyc-dog.test.ts.
     */
    const dog = scores.find((s) => s.name === "dog-selfie.jpg");
    console.log(`  the dog, exempted: ${dog?.score}`);
    expect(dog?.score).toBeGreaterThan(lowestReal.score);
    expect(lowestReal.score).toBeGreaterThan(highestFake.score);
  }, 300_000);
});
