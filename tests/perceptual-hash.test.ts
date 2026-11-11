/**
 * The perceptual hash.
 *
 * The value of this check is entirely in one property: two encodings of the same
 * picture must produce hashes that are close, and two different pictures must
 * not. That property is not obvious from the code, so it is measured here on
 * real fixtures rather than asserted on hand-built grids.
 *
 * The fixtures used are the app's own: a Ghana Card back, a photograph of a
 * room, and a screenshot. If the hash cannot tell those apart it is useless for
 * the one job it has.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jpeg = require("jpeg-js") as {
  decode: (input: Uint8Array, options?: { useTArray?: boolean; formatAsRGBA?: boolean }) => {
    width: number;
    height: number;
    data: Uint8Array;
  };
  encode: (raw: { data: Uint8Array | Buffer; width: number; height: number }, quality: number) => {
    data: Uint8Array;
  };
};
import { decodeToGrid } from "@/lib/kyc-deterministic";
import {
  closestMatch,
  dHashFromGrid,
  DHASH_HEX_LENGTH,
  hashDistance,
  isSameImage,
  SAME_IMAGE_DISTANCE,
} from "@/lib/perceptual-hash";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(path.join(process.cwd(), "tests", "fixtures", "non-faces", name)));

async function hashOf(bytes: Uint8Array): Promise<string | null> {
  return dHashFromGrid(await decodeToGrid(bytes));
}

describe("the hash itself", () => {
  it("is 16 hex characters, always", async () => {
    const hash = await hashOf(fixture("card-back.jpg"));
    expect(hash).not.toBeNull();
    expect(hash).toHaveLength(DHASH_HEX_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable across runs, so storing it is meaningful", async () => {
    const first = await hashOf(fixture("card-back.jpg"));
    const second = await hashOf(fixture("card-back.jpg"));
    expect(first).toBe(second);
  });

  it("returns null for a grid it cannot use, rather than a hash of nothing", () => {
    expect(dHashFromGrid(null)).toBeNull();
    expect(dHashFromGrid({ width: 0, height: 0, values: [] })).toBeNull();
    // A grid whose declared size disagrees with its contents.
    expect(dHashFromGrid({ width: 4, height: 4, values: [[0, 0, 0]] })).toBeNull();
  });
});

describe("the same picture, encoded differently", () => {
  it("stays within tolerance after recompression at low quality", async () => {
    /*
     * This is the WhatsApp case. A card forwarded through a chat app is
     * recompressed hard; the SHA-256 is unrecognisable and the picture is not.
     */
    const original = fixture("card-back.jpg");
    const decoded = jpeg.decode(original, { useTArray: true, formatAsRGBA: true });
    const recompressed = jpeg.encode(
      { data: Buffer.from(decoded.data), width: decoded.width, height: decoded.height },
      25
    );

    const before = await hashOf(original);
    const after = await hashOf(new Uint8Array(recompressed.data));
    const distance = hashDistance(before, after);

    console.log(`  recompression distance: ${distance}`);
    expect(distance).not.toBeNull();
    expect(isSameImage(before, after)).toBe(true);
  }, 120_000);

  it("stays within tolerance after being downscaled by half", async () => {
    /*
     * The screenshot case: a picture displayed on a phone and captured again is
     * a different size. A hash that only matched identical dimensions would be
     * defeated by the simplest possible evasion.
     */
    const original = fixture("card-back.jpg");
    const decoded = jpeg.decode(original, { useTArray: true, formatAsRGBA: true });
    const width = Math.floor(decoded.width / 2);
    const height = Math.floor(decoded.height / 2);
    const out = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // Nearest-neighbour downsample: cheap, and exactly what a naive resizer
        // does.
        const s = (y * 2 * decoded.width + x * 2) * 4;
        const d = (y * width + x) * 4;
        out[d] = decoded.data[s];
        out[d + 1] = decoded.data[s + 1];
        out[d + 2] = decoded.data[s + 2];
        out[d + 3] = 255;
      }
    }

    const scaled = jpeg.encode({ data: out, width, height }, 90);
    const before = await hashOf(original);
    const after = await hashOf(new Uint8Array(scaled.data));
    const distance = hashDistance(before, after);

    console.log(`  half-scale distance: ${distance}`);
    expect(distance).not.toBeNull();
    expect(isSameImage(before, after)).toBe(true);
  }, 120_000);
});

describe("different pictures do not collide", () => {
  it("separates the app's own fixtures by far more than the tolerance", async () => {
    const cardBack = await hashOf(fixture("card-back.jpg"));
    const room = await hashOf(fixture("room.jpg"));
    const webpage = await hashOf(fixture("spoof-webpage.jpg"));

    const cardRoom = hashDistance(cardBack, room);
    const cardWeb = hashDistance(cardBack, webpage);

    console.log(`  card vs room: ${cardRoom}, card vs webpage: ${cardWeb}`);
    expect(cardRoom).not.toBeNull();
    expect(cardRoom as number).toBeGreaterThan(SAME_IMAGE_DISTANCE);
    expect(cardWeb as number).toBeGreaterThan(SAME_IMAGE_DISTANCE);
    expect(isSameImage(cardBack, room)).toBe(false);
  }, 120_000);

  it("treats a malformed or missing hash as 'not a duplicate'", () => {
    // Fail open on detection, because a false duplicate holds up a real member.
    expect(isSameImage(null, "0123456789abcdef")).toBe(false);
    expect(isSameImage("not-a-hash", "0123456789abcdef")).toBe(false);
    expect(hashDistance("0123456789abcdef", "0123")).toBeNull();
    expect(closestMatch(null, ["0123456789abcdef"])).toBeNull();
  });
});

describe("matching against stored hashes", () => {
  it("finds the closest match and reports the distance", () => {
    const known = ["0000000000000000", "ffffffffffffffff", "0123456789abcdef"];
    const match = closestMatch("0123456789abcdee", known);
    expect(match).not.toBeNull();
    expect(match!.hash).toBe("0123456789abcdef");
    expect(match!.distance).toBe(1);
  });

  it("returns nothing when every candidate is out of tolerance", () => {
    const match = closestMatch("0000000000000000", ["ffffffffffffffff"]);
    expect(match).toBeNull();
  });
});
