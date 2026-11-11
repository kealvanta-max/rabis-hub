/**
 * Perceptual hashing for KYC evidence.
 *
 * Why a second hash exists
 * -----------------------
 * The submit route already stores a SHA-256 of every uploaded file. That answers
 * "are these the same bytes", which is the wrong question in practice. A
 * fraudster who wants to reuse a stolen Ghana Card does not re-upload the
 * identical file; they open it, maybe screenshot it, crop it, send it through
 * WhatsApp, and upload the result. Every one of those steps produces a
 * completely different SHA-256 and an almost identical picture.
 *
 * A difference hash (dHash) answers "is this the same picture". It survives
 * recompression, resizing, and a light re-crop, because it only keeps the
 * *direction* of brightness change between neighbouring pixels and throws away
 * absolutely everything else.
 *
 * What it deliberately does not claim
 * ----------------------------------
 * This is a duplicate detector, not a fraud detector. Two honest members can
 * produce the same hash if they upload the same stock image, and the same
 * member retaking a photo in a different room will not. It is evidence for
 * Rabi to weigh ("this card photo was used by three accounts"), never a verdict
 * on its own. `distance` and `isSameImage` are the only two exported decisions,
 * and both are advisory.
 *
 * The implementation runs on the 32x32 greyscale grid the deterministic screener
 * already decodes (`decodeToGrid`), so this costs no extra decoding, no extra
 * network hop, and no native dependency.
 */

import type { RgbGrid } from "@/lib/kyc-deterministic";

/**
 * 64 bits, because a dHash compares each pixel with its right-hand neighbour in
 * a row of 9, which yields 8 comparisons, and there are 8 rows.
 */
export const DHASH_BITS = 64;
export const DHASH_HEX_LENGTH = 16;

/**
 * How many bits may differ and still count as the same picture.
 *
 * Measured on this app's own fixtures rather than copied from a blog post.
 * Recompressing a genuine Ghana Card back at quality 25 and 50 — the range a
 * WhatsApp forward lands in — moved the hash by **10 bits**, so the usual
 * advice of 4–6 would have missed exactly the case this check exists for.
 *
 * Twelve is safe here because the separation is wide: across every pair of
 * distinct fixtures in `tests/fixtures`, the closest two pictures were further
 * apart than 12 bits. The threshold therefore sits in empty space rather than
 * between two near-misses, and `tests/perceptual-hash.test.ts` measures both
 * sides of it so a future change cannot close that gap silently.
 */
export const SAME_IMAGE_DISTANCE = 12;

/**
 * The 9x8 grid a dHash needs, taken from the 32x32 grid already decoded.
 *
 * A box filter per cell, not a point sample: sampling single pixels out of a
 * 32x32 grid would make the hash depend on which pixel happened to land in a
 * cell, and two encodings of the same photo would then disagree.
 */
function downscaleToDhashGrid(grid: RgbGrid): number[] {
  const COLUMNS = 9;
  const ROWS = 8;

  if (grid.width < COLUMNS || grid.height < ROWS) return [];

  const cells: number[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    const yStart = Math.floor((row * grid.height) / ROWS);
    const yEnd = Math.max(yStart + 1, Math.floor(((row + 1) * grid.height) / ROWS));
    for (let column = 0; column < COLUMNS; column += 1) {
      const xStart = Math.floor((column * grid.width) / COLUMNS);
      const xEnd = Math.max(xStart + 1, Math.floor(((column + 1) * grid.width) / COLUMNS));

      let total = 0;
      let count = 0;
      for (let y = yStart; y < Math.min(yEnd, grid.height); y += 1) {
        for (let x = xStart; x < Math.min(xEnd, grid.width); x += 1) {
          const [r, g, b] = grid.values[y * grid.width + x];
          // Rec. 601 luma: the same weights `toLumaGrid` uses, so the two
          // greyscale paths in this codebase cannot drift apart.
          total += 0.299 * r + 0.587 * g + 0.114 * b;
          count += 1;
        }
      }
      if (count === 0) return [];
      cells.push(total / count);
    }
  }

  return cells;
}

/**
 * dHash of a decoded grid, as 16 lowercase hex characters.
 *
 * Each row of 9 cells yields 8 bits: 1 when the left cell is brighter than the
 * right. Returns `null` when the grid is unusable rather than a hash of nothing,
 * because a hash of a blank image would match every other blank image and
 * manufacture duplicates that do not exist.
 */
export function dHashFromGrid(grid: RgbGrid | null): string | null {
  if (!grid || !Number.isFinite(grid.width) || !Number.isFinite(grid.height)) return null;
  if (grid.values.length !== grid.width * grid.height) return null;

  const cells = downscaleToDhashGrid(grid);
  if (cells.length !== 9 * 8) return null;

  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const left = cells[row * 9 + column];
      const right = cells[row * 9 + column + 1];
      // `>` rather than `>=`: an exactly flat pair must not be a 1, or a blank
      // wall hashes to all-ones and matches every other blank wall.
      bits += left > right ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.padStart(DHASH_HEX_LENGTH, "0").slice(-DHASH_HEX_LENGTH);
}

/** Hamming distance between two hex hashes, or `null` if either is malformed. */
export function hashDistance(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  if (a.length !== DHASH_HEX_LENGTH || b.length !== DHASH_HEX_LENGTH) return null;
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return null;

  let distance = 0;
  for (let i = 0; i < DHASH_HEX_LENGTH; i += 1) {
    const left = parseInt(a[i], 16);
    const right = parseInt(b[i], 16);
    if (Number.isNaN(left) || Number.isNaN(right)) return null;
    // XOR then count the set bits: the standard 4-bit popcount.
    let xor = left ^ right;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Whether two hashes are close enough to be the same picture.
 *
 * Errs towards `false`: an unreadable or malformed hash is not a duplicate,
 * because a false duplicate can hold up a genuine member's application while a
 * missed duplicate only leaves Rabi with what she had before.
 */
export function isSameImage(a: string | null, b: string | null, tolerance = SAME_IMAGE_DISTANCE): boolean {
  const distance = hashDistance(a, b);
  return distance !== null && distance <= tolerance;
}

/**
 * The closest match in a set of known hashes.
 *
 * Returns the winning hash and distance so the caller can report *which* earlier
 * submission matched, not merely that something did. `null` when nothing is
 * within tolerance, which is the common case and must stay cheap.
 */
export function closestMatch(
  hash: string | null,
  known: readonly (string | null | undefined)[],
  tolerance = SAME_IMAGE_DISTANCE
): { hash: string; distance: number } | null {
  if (!hash) return null;

  let best: { hash: string; distance: number } | null = null;
  for (const candidate of known) {
    const distance = hashDistance(hash, candidate ?? null);
    if (distance === null || distance > tolerance) continue;
    if (!best || distance < best.distance) best = { hash: candidate as string, distance };
  }
  return best;
}
