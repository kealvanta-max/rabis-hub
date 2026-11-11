/**
 * Deterministic KYC screening, server side, on the real uploaded bytes.
 *
 * Why this module exists
 * ----------------------
 * Every "is this real or fake" decision in the app depended on something that
 * was not running:
 *
 *   - `crossVerifyCard()` (MRZ check digits + front/back number match, the one
 *     check an edited image cannot pass) had no call site in `src/` at all.
 *   - `detectHumanFace()` (MediaPipe, 468 landmarks — an animal cannot produce
 *     them) was imported by nothing in the upload path.
 *   - The only live gate was an LLM call, and it sat *after* nothing had been
 *     uploaded to storage. So a photo of a room in the "Card back" slot and a
 *     photo of a document in the "Selfie" slot both sailed through, and the
 *     member was told "A real face was found" by a hardcoded string in the UI.
 *
 * This module answers the same questions without asking a model anything, so a
 * spoofed image is refused even when every AI provider is down or out of quota:
 *
 *   1. Is there exactly one human face in this selfie?   (box-shape heuristics)
 *   2. Is the card landscape, flat and card-shaped?      (geometry)
 *   3. Does the back carry a real ICAO TD1 MRZ?          (Tesseract + checksums)
 *   4. Does the number in the MRZ match the front?       (cross-side)
 *   5. Is the applicant's typed PIN in that MRZ?         (ties the card to the
 *                                                         number they claimed)
 *
 * Scope, stated honestly: a still photo can never prove liveness, and none of
 * this proves a card was issued by the NIA. What it does prove is that the
 * images are internally consistent with a real Ghana Card being in front of the
 * camera — which is exactly the class of submission that was getting through.
 *
 * Nothing here throws. An unreadable photo is `inconclusive` (Rabi decides), a
 * missing OCR engine is `unavailable` (Rabi decides). Only a positive detection
 * of something wrong is a `fail`.
 */

import "server-only";

import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { digitsOf, mrzCheckDigit } from "@/lib/mrz";

/* ------------------------------------------------------------------ types */

export type CheckStatus = "pass" | "fail" | "inconclusive" | "unavailable";

export interface DeterministicCheck {
  status: CheckStatus;
  /** Machine-readable codes, stored in the application record. */
  reasons: string[];
  /** Numbers the admin screen can show, never images or personal text. */
  detail?: Record<string, string | number | boolean>;
}

export interface DeterministicScreening {
  /** Worst verdict that matters, collapsed the same way the worker does it. */
  state: "screened_pass" | "rejected" | "manual_review_required" | "verification_unavailable";
  checks: Record<string, DeterministicCheck>;
  reasons: string[];
  /** Which parts ran. Useful for the diagnostic route. */
  engine: { ocr: boolean };
}

/* ------------------------------------------------------- image geometry */

/** A 1.586 ratio is ID-1, the size of a Ghana Card. iOS/Android both allow a
 *  loose crop, hence the tolerance. */
const CARD_RATIO = 1.586;
const CARD_RATIO_TOLERANCE = 0.42;

/** Measured in the tiny greyscale resample below (see `inkProfile`). */
const MIN_INK_STDDEV = 9;
const MIN_INK_DYNAMIC_RANGE = 60;

export interface ImageGeometry {
  width: number;
  height: number;
  ratio: number;
  /** True when width > height. */
  landscape: boolean;
}

/**
 * Read just the pixel dimensions out of a JPEG/PNG/WebP header.
 *
 * Deliberately not a decoder: the upload route already has the bytes in memory
 * and the only question here is shape. Returns null for anything unrecognised,
 * which the caller treats as "cannot judge", never as a pass.
 */
export function imageGeometry(bytes: Uint8Array): ImageGeometry | null {
  const size = bytes.length;
  if (size < 24) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, then an IHDR chunk.
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    size >= 24
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return geometryOf(width, height);
  }

  // JPEG: walk the segment chain until a Start Of Frame carries the size.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < size) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      // Padding and restart markers carry no length.
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2) return null;
      // SOF0..SOF15, excluding DHT (0xC4), JPG (0xC8) and DAC (0xCC).
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        if (offset + 9 >= size) return null;
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return geometryOf(width, height);
      }
      offset += 2 + length;
    }
    return null;
  }

  // WebP: RIFF....WEBP, then a VP8X / VP8 / VP8L chunk.
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const kind = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (kind === "VP8X" && size >= 30) {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return geometryOf(width, height);
    }
    if (kind === "VP8 " && size >= 30) {
      const width = ((bytes[26] | (bytes[27] << 8)) & 0x3fff) || 0;
      const height = ((bytes[28] | (bytes[29] << 8)) & 0x3fff) || 0;
      return geometryOf(width, height);
    }
    if (kind === "VP8L" && size >= 25) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return geometryOf(width, height);
    }
  }

  return null;
}

function geometryOf(width: number, height: number): ImageGeometry | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return { width, height, ratio: width / height, landscape: width > height };
}

/* ------------------------------------------------------ face heuristics */

/** A coarse luminance map of the frame, 4:3 or 8:8, greyscale 0-255. */
export interface LumaGrid {
  width: number;
  height: number;
  /** Row-major luminance values, length = width * height. */
  values: number[];
}

/**
 * The box a selfie's head should occupy, found without a face model.
 *
 * Why not just run a face detector: the browser one (MediaPipe) was never wired
 * to the upload path and cannot be trusted anyway (it runs on the member's
 * phone), and a server-side detector is a multi-hundred-megabyte model we cannot
 * ship in a function. What actually matters for the spoofs that got through is
 * far simpler — "is the middle of this frame a head, or is it a room / a sheet
 * of paper" — and that question survives a 32x32 resample.
 *
 * This returns the central region as the candidate head, and the judgement of
 * whether it looks like one is left to `judgeFaceTone`.
 */
export function centralFaceBox(): { x: number; y: number; w: number; h: number } {
  return { x: 0.2, y: 0.1, w: 0.6, h: 0.62 };
}

export interface LumaProbe {
  /** Luminance of the brightest part of the region, 0-255. */
  highlight: number;
  /** Luminance of the darkest part of the region, 0-255. */
  shadow: number;
  /** Standard deviation of luminance within the region. */
  contrast: number;
  /** Mean luminance within the region. */
  mean: number;
  /** Contrast of the ring of background immediately around the region. */
  surroundContrast: number;
  surroundMean: number;
}

/** Pull the luminance statistics a head would have out of a coarse grid. */
export function probeBox(grid: LumaGrid, box: { x: number; y: number; w: number; h: number }): LumaProbe | null {
  const { width, height, values } = grid;
  if (width < 4 || height < 4 || values.length !== width * height) return null;

  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.w) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.h) * height));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;

  const inside: number[] = [];
  const outside: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = values[y * width + x];
      if (x >= x0 && x < x1 && y >= y0 && y < y1) inside.push(value);
      else outside.push(value);
    }
  }
  if (inside.length < 4) return null;

  const sorted = [...inside].sort((a, b) => a - b);
  const pick = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];

  return {
    highlight: pick(0.9),
    shadow: pick(0.1),
    contrast: stddev(inside),
    mean: mean(inside),
    surroundContrast: outside.length ? stddev(outside) : 0,
    surroundMean: outside.length ? mean(outside) : 0,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export interface FaceHeuristic {
  status: CheckStatus;
  reasons: string[];
  /** Where the head was judged to be, as fractions of the frame. */
  box?: { x: number; y: number; w: number; h: number };
}

/**
 * A portrait's proportions, measured against the frame.
 *
 * A selfie is a head: roughly upright, roughly 15-75% of the frame height, with
 * its centre in the middle third. A photo of a room has no such region, and a
 * photo of a document on a wall is a wide low-contrast rectangle.
 */
export function judgeFaceBox(box: {
  x: number;
  y: number;
  w: number;
  h: number;
}): FaceHeuristic {
  const { x, y, w, h } = box;
  const centreX = x + w / 2;
  const centreY = y + h / 2;
  const aspect = w / h;
  const coverage = w * h;

  const reasons: string[] = [];

  // Head-and-shoulders framing. A phone selfie is square-ish to portrait.
  if (aspect > 1.25) reasons.push("face-box-too-wide");
  if (aspect < 0.42) reasons.push("face-box-too-narrow");
  if (h < 0.14) reasons.push("face-too-small-in-frame");
  if (h > 0.98) reasons.push("face-fills-entire-frame");
  if (coverage < 0.035) reasons.push("subject-too-small-in-frame");

  // A selfie is centred. A subject pinned to an edge is usually scenery.
  if (centreX < 0.12 || centreX > 0.88) reasons.push("subject-off-centre-horizontally");
  if (centreY < 0.06 || centreY > 0.9) reasons.push("subject-off-centre-vertically");

  if (reasons.length > 0) return { status: "fail", reasons, box };
  return { status: "pass", reasons: [], box };
}

/**
 * Judge the brightness structure of a "face" region.
 *
 * A human face in a selfie has a lit side and a shadowed side and a dark region
 * where the eyes and hair are: the luminance inside the box varies a lot. A
 * printed sheet, a wall, a ceiling, a blank document — the things that were
 * being accepted — are dominated by one flat tone.
 */
export function judgeFaceTone(probe: LumaProbe, box: FaceHeuristic["box"]): FaceHeuristic {
  const reasons: string[] = [];

  if (probe.contrast < 11) reasons.push("face-region-flat-no-facial-structure");
  if (probe.highlight - probe.shadow < MIN_INK_DYNAMIC_RANGE / 2) {
    reasons.push("face-region-no-light-and-shadow");
  }
  if (probe.mean > 244) reasons.push("face-region-blown-out");
  if (probe.mean < 16) reasons.push("face-region-too-dark");
  /*
   * A real head is usually a different tone from the wall behind it. A document
   * photographed against the wall it is taped to is not.
   */
  if (Math.abs(probe.mean - probe.surroundMean) < 3 && probe.surroundContrast < 10) {
    reasons.push("subject-indistinct-from-background");
  }

  if (reasons.length > 0) return { status: "fail", reasons, box };
  return { status: "pass", reasons: [], box };
}

/* -------------------------------------------------------- card geometry */

/**
 * Is this a photograph of a physical card, in the right orientation?
 *
 * The screenshot that started this had the back of a card slot filled with a
 * portrait photo of a person standing in a room: it was portrait-orientation and
 * had no card in it. A real card photo is landscape and card-shaped.
 */
export function judgeCardGeometry(geometry: ImageGeometry | null): DeterministicCheck {
  if (!geometry) {
    return { status: "inconclusive", reasons: ["image-dimensions-unreadable"] };
  }
  if (!geometry.landscape) {
    return {
      status: "fail",
      reasons: ["card-not-landscape"],
      detail: { width: geometry.width, height: geometry.height },
    };
  }
  if (Math.abs(geometry.ratio - CARD_RATIO) > CARD_RATIO_TOLERANCE) {
    return {
      status: "fail",
      reasons: ["card-not-card-shaped"],
      detail: { width: geometry.width, height: geometry.height, ratio: Number(geometry.ratio.toFixed(3)) },
    };
  }
  if (geometry.width < 320 || geometry.height < 200) {
    return {
      status: "fail",
      reasons: ["card-photo-too-small"],
      detail: { width: geometry.width, height: geometry.height },
    };
  }
  return {
    status: "pass",
    reasons: ["card-landscape-card-shaped"],
    detail: { ratio: Number(geometry.ratio.toFixed(3)) },
  };
}

/* -------------------------------------------------------------------- MRZ */

export interface Td1Read {
  /** The three 30-character lines, exactly as read. */
  lines: [string, string, string];
  /** Document number without filler, e.g. GHA002089279. */
  documentNumber: string;
  /** True only when all four ICAO check digits compute. */
  checksumsValid: boolean;
  /** Which of the four failed, for the admin record. */
  failedChecks: string[];
  nationality: string;
  /**
   * The holder's name, split at the `<<` on line 3.
   *
   * This is the only identity data a photographed Ghana Card gives up reliably,
   * and it is what the signup compares against the legal name the member typed.
   */
  surname: string;
  givenNames: string;
  /** "M" or "F". Empty when the character was unreadable. */
  sex: string;
  /** Raw six-digit ICAO date of birth from line 2. */
  dateOfBirth: string;
}

const TD1_LINE = /^[A-Z0-9<]{30}$/;

/**
 * Find and validate the TD1 zone in OCR output.
 *
 * `mrz.ts` already does this for text the browser produced. This variant is
 * stricter on purpose: it demands the issuing state be GHA, because a Nigerian
 * or Ivorian ID has a valid TD1 too and would otherwise pass a "looks like a
 * machine readable zone" test.
 */
export function readTd1(text: string): Td1Read | null {
  const lines = (text ?? "")
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter((line) => line.length > 0);

  /*
   * Anchor on the TD1 header, not on position.
   *
   * OCR output contains header text above the zone — `REPUBLIC OF GHANA`,
   * `NATIONAL IDENTIFICATION AUTHORITY` — and a sliding three-line window happily
   * matched those padded lines with the first real MRZ line. That produced a
   * "surname" of `0020892793GHA`: the document number read as a family name, and
   * the identity check then reported a *consistent* match for whoever was typing.
   *
   * Line 1 of a TD1 always begins `I<` or `ID` followed by the issuing state, so
   * that is the anchor. Everything after it must be lines 2 and 3.
   */
  const padded = lines.map((line) => (line.length < 30 ? line.padEnd(30, "<") : line.slice(0, 30)));

  const headers = padded
    .map((line, index) => (line.startsWith("I<") || line.startsWith("ID") ? index : -1))
    .filter((index) => index !== -1 && index + 2 < padded.length);

  for (const start of headers) {
    const window = [padded[start], padded[start + 1], padded[start + 2]];
    if (!window.every((line) => TD1_LINE.test(line))) continue;

    const [line1, line2, line3] = window;

    /*
     * TD1 line 1 is: document code (2), issuing state (3), document number
     * (9) + check digit (1). Ghana issues "I<GHA". Some stock prints "IDGHA".
     * Anything else is not a Ghana Card, however tidy the rest looks.
     */
    if (!line1.startsWith("I<") && !line1.startsWith("ID")) continue;
    if (line1.slice(2, 5) !== "GHA") continue;

    const documentNumber = line1.slice(5, 14).replace(/</g, "");
    if (documentNumber.length < 6) continue;

    const failedChecks: string[] = [];
    if (!check(line1[14], line1.slice(5, 14))) failedChecks.push("document-number");
    if (!check(line2[6], line2.slice(0, 6))) failedChecks.push("date-of-birth");
    if (!check(line2[14], line2.slice(8, 14))) failedChecks.push("date-of-expiry");

    const compositeSource = `${line1.slice(5, 30)}${line2.slice(0, 7)}${line2.slice(8, 15)}${line2.slice(18, 29)}`;
    if (!check(line2[29], compositeSource)) failedChecks.push("composite");

    /*
     * Line 3 is `SURNAME<<GIVEN<NAMES`. The split has to happen before the filler
     * is stripped, because `<<` separates the two fields while a single `<` is
     * just a space inside a name.
     */
    const nameParts = line3.split("<<");
    const tidy = (value: string) => value.replace(/</g, " ").replace(/\s+/g, " ").trim();

    /*
     * A name field must read like a name.
     *
     * The check that failed here: a card whose line 3 held only the document
     * number (`0020892793GHA`) was parsed with that number as the surname, and
     * the comparison against it then reported *consistent*. Refusing anything
     * with a four-digit run means a misread line can only make the comparison
     * "could not check", never a false match.
     */
    const looksLikeName = (value: string) => /[A-Z]/.test(value) && !/[0-9]{4}/.test(value);
    const surname = tidy(nameParts[0] ?? "");
    const givenNames = tidy(nameParts.slice(1).join(" "));

    return {
      lines: [line1, line2, line3],
      documentNumber,
      checksumsValid: failedChecks.length === 0,
      failedChecks,
      nationality: line2.slice(15, 18).replace(/</g, ""),
      surname: looksLikeName(surname) ? surname : "",
      givenNames: looksLikeName(givenNames) ? givenNames : "",
      sex: line2[7] === "M" || line2[7] === "F" ? line2[7] : "",
      dateOfBirth: line2.slice(0, 6),
    };
  }

  return null;
}

/**
 * Read the holder's identity from the machine-readable zone on the card back.
 *
 * The MRZ is printed in OCR-B in a clean band, which is why it survives a
 * photograph that defeats the rest of the card: measured on low-resolution
 * samples, Tesseract recovered `I<GHA…` from the back while reading nothing
 * usable from the front.
 *
 * Returns null when no TD1 zone could be parsed. That is not a verdict — the
 * caller records it as "could not compare", never as a mismatch.
 */
export async function readCardIdentity(bytes: Uint8Array | null): Promise<Td1Read | null> {
  if (!bytes || bytes.length === 0) return null;
  const ocr = await readImageText(bytes);
  if (!ocr) return null;
  return readTd1(ocr.text);
}

function check(observed: string | undefined, source: string): boolean {
  if (!observed || !/^[0-9]$/.test(observed)) return false;
  return mrzCheckDigit(source) === Number(observed);
}

/**
 * Tie the card to the number the applicant typed.
 *
 * The MRZ holds the document number (GHA002089279). The member types
 * GHA-002089279-3. If the nine digits differ, two different cards are in play,
 * or the card was typed from one document and photographed from another — the
 * exact failure mode a fake submission produces.
 */
export function matchTypedPin(typed: string, read: Td1Read): DeterministicCheck {
  const typedDigits = digitsOf(typed);
  const mrzDigits = digitsOf(read.documentNumber);

  if (typedDigits.length < 9 || mrzDigits.length < 9) {
    return { status: "inconclusive", reasons: ["pin-comparison-not-possible"] };
  }

  const typedNine = typedDigits.slice(-10, -1);
  const mrzNine = mrzDigits.slice(-9);
  if (typedNine !== mrzNine) {
    return {
      status: "fail",
      reasons: ["typed-pin-does-not-match-mrz"],
      // Only the length is recorded; never the digits themselves.
      detail: { typedLength: typedDigits.length, mrzLength: mrzDigits.length },
    };
  }

  return { status: "pass", reasons: ["typed-pin-matches-mrz"] };
}

/* ------------------------------------------------------- PNG luma decode */

/**
 * Decode a small greyscale PNG into a luminance grid.
 *
 * Cloudinary can render any stored photo to a 32x32 greyscale PNG on demand
 * (`c_scale,w_32,h_32,e_grayscale,f_png`). That gives the server real pixel
 * values for the *stored* image without shipping an image decoder into the
 * function, and because it is generated server-side from the file we saved, a
 * tampered browser cannot substitute a flattering grid.
 *
 * Only what Cloudinary actually emits is supported: 8-bit, non-interlaced,
 * greyscale / RGB / RGBA / grey+alpha. Anything else returns null and the
 * caller records "cannot judge" rather than guessing.
 */
export function decodePngRgb(bytes: Uint8Array): RgbGrid | null {
  if (bytes.length < 33) return null;
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];

  if (bitDepth !== 8 || interlace !== 0) return null;
  if (width < 2 || height < 2 || width > 256 || height > 256) return null;

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (channels === 0) return null;

  // Walk the chunks and collect IDAT.
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    if (dataStart + length > bytes.length) return null;
    if (type === "IDAT") idat.push(Buffer.from(bytes.subarray(dataStart, dataStart + length)));
    if (type === "IEND") break;
    offset = dataStart + length + 4; // + CRC
  }
  if (idat.length === 0) return null;

  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;

  // Undo the per-scanline filters (PNG spec section 9).
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      out[y * stride + x] = value & 0xff;
    }
  }

  const values: Array<[number, number, number]> = [];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const base = pixel * channels;
    if (channels === 1 || channels === 2) {
      const grey = out[base];
      values.push([grey, grey, grey]);
    } else {
      values.push([out[base], out[base + 1], out[base + 2]]);
    }
  }

  return { width, height, values };
}

/** Luminance view of an RGB grid, for the contrast checks. */
export function toLumaGrid(grid: RgbGrid): LumaGrid {
  return {
    width: grid.width,
    height: grid.height,
    values: grid.values.map(([r, g, b]) => Math.round(0.299 * r + 0.587 * g + 0.114 * b)),
  };
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  if (dUp <= dUpLeft) return up;
  return upLeft;
}

/** Size of the grid Cloudinary renders for analysis. */
export const GRID_EDGE = 32;

/* ---------------------------------------------------------------- skin */

export interface RgbGrid {
  width: number;
  height: number;
  /** Row-major RGB triplets, 0-255. */
  values: Array<[number, number, number]>;
}

/**
 * Share of the central box that is human skin tone, 0-1.
 *
 * This is the check that actually separates the two spoofs in the report. The
 * "selfie" was a photograph of a printed document taped to a wall: it has
 * plenty of luminance contrast (the printed lines), so a "is this flat?"
 * measure passes it, but it contains no skin at all. A real face fills a large
 * part of the frame with skin.
 *
 * The rule of thumb is the standard YCbCr chroma test: human skin sits in a
 * narrow band of Cr above Cb, largely independent of how dark or light the
 * person is, which matters here because a threshold on raw brightness would
 * reject darker skin. Thresholds are deliberately loose; the question is
 * "is there a person here at all", not "what shade is this pixel".
 */
export function skinRatio(grid: RgbGrid, box: { x: number; y: number; w: number; h: number }): number | null {
  const { width, height, values } = grid;
  if (width < 4 || height < 4 || values.length !== width * height) return null;
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.w) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.h) * height));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;

  let total = 0;
  let skin = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const [r, g, b] = values[y * width + x];
      total += 1;
      if (isSkinTone(r, g, b)) skin += 1;
    }
  }
  return total > 0 ? skin / total : null;
}

/**
 * A skin-tone test that real rooms do not pass.
 *
 * The first version of this used the textbook YCbCr chroma window and it was a
 * hazard: measured against real surfaces, a wooden door (130,102,85), beige
 * paint (199,167,130), tan paint (209,179,139) and terracotta (190,120,90) all
 * came back "skin". Real members stand in front of walls; shipping that test
 * would have rejected genuine people for their paint colour, which is a far
 * worse failure than letting a fake through.
 *
 * Skin occupies a narrower place than walls and wood: whatever the complexion,
 * red leads green and green leads blue, the spread between them is modest (wood
 * and paint are far more saturated), and human skin never gets near the extremes
 * of luminance that a white wall or a dark doorway sit at.
 *
 * This is still only a *screen*, not a face detector. It only decides whether
 * the pixels could be somebody's face; the checks that actually prove anything
 * are the MRZ and the printed markers. Where it cannot tell, it says so.
 */
export function isSkinTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  // Must be the red-leads-green-leads-blue ordering skin has.
  if (!(r > g && g > b)) return false;
  // Not black, not blown out. A wall is often one or the other.
  if (luminance < 40 || luminance > 245) return false;
  // Saturation: skin is warm but muted. Wood and terracotta are far richer.
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.10 || saturation > 0.52) return false;
  // Red must clearly lead blue, but not overwhelmingly.
  const warmth = r - b;
  if (warmth < 12 || warmth > 95) return false;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (cr < 133 || cr > 180) return false;
  if (cb < 77 || cb > 130) return false;

  return true;
}

/**
 * Below this share of the frame, there is no person to photograph.
 *
 * Measured against every fixture in the repository, inside the same central box
 * this floor is applied to:
 *
 *   genuine members (deepest complexion)   9.52%   <- the lowest real face
 *   genuine members (rest)                 19.0 - 72.6%
 *   wall, room, card back, spoof page      0.00 - 4.76%   <- the highest non-person
 *
 * The old value was 0.10, which sat ABOVE the lowest genuine member. That person
 * was refused with "no-human-skin-in-frame" by every caller that has no face
 * detector: `screenDeterministically`, which is what the signup submission runs,
 * and `judgeSelfiePhoto` whenever the model is unavailable. A 9.5%-against-10%
 * margin is not a margin; it is a coin toss decided by the lighting in her room.
 *
 * 0.07 sits between the two measured populations with room on both sides: it is
 * low enough that a real member in poor light cannot fall under it, and still
 * far above every non-person image measured, which tops out at 4.76%.
 *
 * This is a screen for "there is nothing here that could be a person", never
 * proof that a face is present. The face detector still decides whenever it can
 * run; this number only decides what happens when it cannot.
 */
export const MIN_SKIN_RATIO = 0.07;

/**
 * Ask Cloudinary for a small greyscale render of an uploaded image.
 *
 * The URL is built from the stored delivery URL, so it is the same asset the
 * application record points at. Returns null when the host is not our Cloudinary
 * account or the fetch fails; never throws.
 */
export async function fetchRgbGrid(deliveryUrl: string, cloudName: string): Promise<RgbGrid | null> {
  if (!cloudName) return null;
  let parsed: URL;
  try {
    parsed = new URL(deliveryUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") return null;
  const prefix = `/${cloudName}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  const marker = "/upload/";
  const at = parsed.pathname.indexOf(marker);
  if (at === -1) return null;
  const publicId = parsed.pathname.slice(at + marker.length).replace(/^v\d+\//, "");
  if (!publicId) return null;

  // Colour is required: the face test reads skin chroma, not brightness.
  const transform = `c_scale,w_${GRID_EDGE},h_${GRID_EDGE},f_png`;
  const url = `https://res.cloudinary.com/${cloudName}/image/upload/${transform}/${publicId}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", redirect: "error" });
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return decodePngRgb(buffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- composites */

/**
 * The selfie question, answered from a colour grid of the stored image.
 *
 * Kept here (not in the route) so the upload path and the submission path ask
 * exactly the same question, and so it can be unit-tested against fixtures.
 */
export function judgeSelfiePhoto(
  grid: RgbGrid,
  box: { x: number; y: number; w: number; h: number }
): FaceHeuristic {
  const shape = judgeFaceBox(box);
  if (shape.status === "fail") return shape;

  const skin = skinRatio(grid, box);
  if (skin === null) return { status: "inconclusive", reasons: ["selfie-pixels-unreadable"], box };

  /*
   * Skin colour can prove the ABSENCE of a person. It cannot prove a presence,
   * and the difference matters more than it looks.
   *
   * A window in a dark room, a night photo, a landscape and a page of text all
   * carry no skin-coloured pixels, and refusing them is safe: there is nothing
   * in those images a selfie could legitimately be. That is the case this check
   * is for, and it is the case in the report.
   *
   * The reverse does not hold. Wooden doors (130,102,85), beige paint
   * (199,167,130) and tan paint (209,179,139) sit inside the same colour region
   * as real skin — measured, repeatedly — so "there is skin-coloured stuff here
   * therefore there is a person" would reject genuine members standing in a
   * corridor. An earlier version of this file claimed otherwise and was wrong.
   *
   * So: below the floor is a refusal; above it is only "cannot rule it out",
   * which is what `inconclusive` means and is routed to Rabi. Proving that a
   * face is present needs a face detector, and that is stated in
   * `docs/kyc-vision-review.md` rather than faked here.
   */
  if (skin < MIN_SKIN_RATIO) {
    return { status: "fail", reasons: ["no-human-skin-in-frame"], box };
  }

  const probe = probeBox(toLumaGrid(grid), box);
  if (!probe) return { status: "inconclusive", reasons: ["selfie-tone-unreadable"], box };

  /*
   * Enough skin-coloured pixels to be a person, and some structure to the
   * region. Still not proof: this is a screen that has not objected.
   */
  const tone = judgeFaceTone(probe, box);
  if (tone.status === "fail") return tone;
  return { status: "inconclusive", reasons: ["face-presence-not-provable-screening-only"], box };
}

/**
 * The selfie verdict, now that a real detector exists.
 *
 * This wraps the colour screen above with the one piece of evidence that
 * actually answers the question. The colour screen alone could never do it; it
 * exists in `judgeSelfiePhoto` to catch the cases where the model is unavailable,
 * so screening never degrades to "accept everything".
 *
 * The policy is deliberately asymmetric, by how expensive each mistake is:
 *
 *   face detected      -> pass. Model and colour agree, and this is the case
 *                         every genuine member is in.
 *   no face detected   -> fail, retryable. A model trained to find faces found
 *                         none at all: that is a screen, a wall, a room, or a
 *                         card. Refusing costs the member one retake.
 *   model unavailable  -> fall through to the colour screen, which decides. If
 *                         it cannot decide either, the photo goes to Rabi. A
 *                         broken model must never refuse a real person, and must
 *                         never silently accept either.
 */
export function judgeSelfieWithDetection(
  colour: FaceHeuristic,
  detection: {
    human: boolean;
    status: "detected" | "none" | "unavailable";
    score: number;
    detail?: string;
    /** Landmark answer from `detectFaces`; absent when the caller has none. */
    eyes?: "both" | "partial" | "none" | "unavailable";
  }
): FaceHeuristic {
  /*
   * The detector wins, always.
   *
   * This ordering is the whole point, and the first version had it backwards. It
   * consulted the colour screen first and skipped the model when colour had
   * already objected — so a real member with deep skin tone, whose face reads
   * only 9.5% "skin" inside the measurement box, was refused before the model
   * that scores her 0.84 had run at all. A dark-skinned applicant was being
   * turned away by a test that had never been shown her face.
   *
   * Colour is now only a fallback for when the model cannot run. It is never
   * allowed to overrule a model that looked.
   */
  if (detection.status === "detected" && detection.human) {
    /*
     * The eye question, and why it never refuses anyone.
     *
     * A face box can be produced by a photograph of a screen or by a print held
     * in front of the lens. Landmarks are stronger evidence that eye structure
     * is actually there, so two eye clusters are recorded as a pass.
     *
     * But `partial` and `none` are NOT failures. A member in glasses, standing
     * back from the camera, blinking at the wrong moment, or simply small in the
     * frame can lose both clusters while being entirely genuine, and the
     * detector already scored her face 0.9. Refusing on this would repeat the
     * deep-skin-tone mistake in a new costume. So a face that was found but has
     * no eyes is *flagged for Rabi* by name, and she decides.
     */
    const eyes = detection.eyes ?? "unavailable";
    const eyeNote =
      eyes === "both"
        ? [`eyes-detected`]
        : eyes === "unavailable"
          ? []
          : [`eyes-${eyes}-face-found-please-confirm`];

    return {
      status: "pass",
      reasons: [`human-face-detected-score-${detection.score.toFixed(2)}`, ...eyeNote],
      box: colour.box,
    };
  }

  if (detection.status === "none") {
    /*
     * A model trained to find faces found none. That is a screen, a wall, a
     * room, a card or a printout. Refusing costs a retake; accepting costs an
     * identity. The colour screen's reason is kept when it had one, because
     * "no skin in frame at all" is more useful to the member than a score.
     */
    if (colour.status === "fail") return colour;
    return { status: "fail", reasons: ["no-face-detected-in-frame"], box: colour.box };
  }

  /*
   * Unavailable. The colour screen is all that is left, and it is allowed to
   * refuse an image with no skin at all, because nothing legitimate is in it.
   * Anything else is Rabi's call.
   */
  return {
    ...colour,
    reasons: [...(colour.reasons ?? []), `face-model-${detection.status}`],
  };
}

/**
 * The card question: is this a flat, landscape, printed card?
 *
 * Two independent signals, because either alone is easy to beat:
 *
 *   geometry - landscape and card-shaped, from the file header. Catches the
 *              portrait photo of a person that was accepted as a card back.
 *   surface  - an ID card is a pale, evenly lit rectangle carrying dark print.
 *              A photo of a room is neither pale nor even; a photo of a wall is
 *              pale but has no print.
 *
 * Deliberately permissive: a real card photographed at an angle, in shadow, or
 * with a busy background must still pass. Only a clear negative fails.
 */
export function judgeCardPhoto({
  geometry,
  grid,
  box,
}: {
  geometry: ImageGeometry | null;
  grid: RgbGrid;
  box: { x: number; y: number; w: number; h: number };
}): DeterministicCheck {
  const shape = judgeCardGeometry(geometry);
  // A portrait-orientation photo in a card slot is the strongest single signal,
  // so it short-circuits. The other geometry failures are reported but do not
  // reject on their own, because a loose crop is normal.
  if (shape.status === "fail") return shape;

  const x0 = Math.max(0, Math.floor(box.x * grid.width));
  const y0 = Math.max(0, Math.floor(box.y * grid.height));
  const x1 = Math.min(grid.width, Math.ceil((box.x + box.w) * grid.width));
  const y1 = Math.min(grid.height, Math.ceil((box.y + box.h) * grid.height));

  const luma: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const [r, g, b] = grid.values[y * grid.width + x];
      luma.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  if (luma.length < 16) return { status: "inconclusive", reasons: ["card-pixels-unreadable"] };

  const average = mean(luma);
  const spread = stddev(luma);
  const sorted = [...luma].sort((a, b) => a - b);
  const dark = sorted[Math.floor(0.05 * sorted.length)];
  const light = sorted[Math.floor(0.95 * sorted.length)];

  const reasons: string[] = [];

  /*
   * A card fills most of a cropped card photo and is a pale document. A dark
   * frame here means the "card" is a room, clothing, or a night-time scene.
   */
  if (average < 60) reasons.push("card-region-too-dark");
  /*
   * An ID card always has print: a portrait, text, a guilloche pattern. A
   * completely flat region is a blank wall or a blank sheet.
   */
  if (spread < 6) reasons.push("card-no-printed-content");
  if (light - dark < 25) reasons.push("card-not-flat-lit-document");

  if (reasons.length > 0) {
    return {
      status: "fail",
      reasons,
      detail: { mean: Math.round(average), spread: Math.round(spread) },
    };
  }

  return {
    status: "pass",
    reasons: ["card-like-surface"],
    detail: { mean: Math.round(average), spread: Math.round(spread) },
  };
}

/* ---------------------------------------------------------------- verdict */

/**
 * Collapse the individual checks into one state.
 *
 * Failures from the deterministic layer are NOT softened into "review" the way
 * an AI disagreement is. An OCR'd MRZ whose check digits do not compute, or a
 * selfie with no head in it, is not a matter of opinion, and sending it to a
 * human queue is what let the last batch through.
 */
export function classifyDeterministic(checks: Record<string, DeterministicCheck>): DeterministicScreening["state"] {
  const statuses = Object.values(checks).map((check) => check.status);
  if (statuses.includes("fail")) return "rejected";
  if (statuses.includes("unavailable")) return "verification_unavailable";
  if (statuses.includes("inconclusive")) return "manual_review_required";
  if (statuses.length > 0 && statuses.every((status) => status === "pass")) return "screened_pass";
  return "manual_review_required";
}

export function collectReasons(checks: Record<string, DeterministicCheck>): string[] {
  return Object.entries(checks).flatMap(([name, check]) =>
    check.reasons.map((reason) => `${name}:${reason}`)
  );
}

/* ------------------------------------------------------------------- OCR */

/**
 * Tesseract in Node, loaded lazily.
 *
 * The language data comes from `@tesseract.js-data/eng` (`4.0.0_best_int`, 2.9 MB
 * instead of 11 MB) and is resolved through `require.resolve` so the folder is
 * known at build time. If the engine or the data cannot be found the caller is
 * told so and the application goes to Rabi — it never becomes a pass.
 */
type TesseractWorker = {
  recognize: (input: Uint8Array | Buffer | string) => Promise<{ data: { text?: string; confidence?: number } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker | null> | null = null;

/**
 * Language data and engine, resolved from `public/kyc`.
 *
 * `scripts/vendor-kyc-assets.mjs` already copies the 2.9 MB `best_int` English
 * model and the LSTM wasm into `public/kyc` on every install and build, so those
 * files are part of the deployment regardless of what the function tracer
 * decides to follow. Reading them from `process.cwd()` therefore works in a
 * Vercel function without any `outputFileTracingIncludes` entry — which
 * matters, because the tracer demonstrably does not follow the node_modules
 * copy (verified against `route.js.nft.json`: 0 traineddata files traced).
 *
 * If the files are missing the worker fails to build, `getWorker` returns null,
 * and the caller records `ocr-engine-unavailable` for Rabi. It never becomes a
 * pass.
 */
function langPath(): string {
  return path.join(process.cwd(), "public", "kyc", "tesseract", "lang");
}

function corePath(): string {
  return path.join(process.cwd(), "public", "kyc", "tesseract", "core");
}

/**
 * Where tesseract.js is allowed to cache the decompressed model.
 *
 * It writes `eng.traineddata` (~23 MB, decompressed from the 2.9 MB `.gz`) next
 * to the working directory by default. That is harmless locally but wrong on
 * Vercel, where the function root is read-only: the write fails, the failure is
 * only logged, and a 23 MB file is left inside the repo when it does not.
 *
 * `/tmp` is writable in a Vercel function and survives for the life of the
 * instance, so warm invocations skip the gunzip entirely.
 */
function cachePath(): string {
  return path.join(os.tmpdir(), "kyc-tesseract-cache");
}

async function getWorker(): Promise<TesseractWorker | null> {
  if (workerPromise) return workerPromise;

  workerPromise = (async (): Promise<TesseractWorker | null> => {
    try {
      const { createWorker } = await import("tesseract.js");
      const cache = cachePath();
      try {
        (await import("node:fs")).mkdirSync(cache, { recursive: true });
      } catch {
        /* a missing /tmp is not worth failing the read over; tesseract retries */
      }
      const worker = (await createWorker("eng", 1, {
        langPath: langPath(),
        corePath: corePath(),
        cachePath: cache,
        cacheMethod: "write",
        gzip: true,
        logger: () => undefined,
      })) as unknown as TesseractWorker;
      return worker;
    } catch (error) {
      console.error("[kyc] server OCR unavailable:", (error as Error)?.message ?? error);
      workerPromise = null;
      return null;
    }
  })() as Promise<TesseractWorker | null>;

  return workerPromise;
}

/** Cap the OCR input so a 12 MP photo cannot burn the whole function timeout. */
const OCR_MAX_EDGE = 1600;
const OCR_TIMEOUT_MS = 20_000;

/**
 * Read text from an uploaded image, on the server.
 *
 * Returns null when the engine is missing or the read timed out; returns an
 * empty string when the engine ran and found nothing. Those two are different
 * answers and the caller treats them differently.
 */
export async function readImageText(bytes: Uint8Array): Promise<{ text: string; confidence: number } | null> {
  const worker = await getWorker();
  if (!worker) return null;

  // Tesseract accepts the bytes directly, so nothing is written to disk.
  const run = (async () => {
    const { data } = await worker.recognize(Buffer.from(bytes));
    return { text: data.text ?? "", confidence: Math.round(data.confidence ?? 0) };
  })();

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), OCR_TIMEOUT_MS));
  try {
    return await Promise.race([run, timeout]);
  } catch (error) {
    console.error("[kyc] server OCR failed:", (error as Error)?.message ?? error);
    return null;
  }
}

export { OCR_MAX_EDGE, MIN_INK_STDDEV, MIN_INK_DYNAMIC_RANGE };

/* ------------------------------------------------------------- screening */

export interface ScreenEvidence {
  /** Cloudinary delivery URL of the stored file. */
  url: string;
  /** The same bytes, when the caller already has them (the upload route does). */
  bytes?: Uint8Array;
  mime?: string;
}

export interface ScreenSubmissionInput {
  front: ScreenEvidence;
  back: ScreenEvidence;
  selfie: ScreenEvidence;
  /** The PIN the applicant typed, e.g. GHA-002089279-3. */
  typedPin: string;
  /** Cloud name, for the render-as-grid path. Falls back to skipped when absent. */
  cloudName?: string;
}

/**
 * Screen a whole submission deterministically.
 *
 * Order is deliberate: the cheap geometry questions run first because they cost
 * nothing and catch the most common spoof, then OCR runs once on the card back
 * to reach the MRZ. Every check is recorded, pass or fail, so Rabi sees *why*.
 */
export async function screenDeterministically(
  input: ScreenSubmissionInput
): Promise<DeterministicScreening> {
  const checks: Record<string, DeterministicCheck> = {};
  const cloudName = input.cloudName ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

  /* ---- 1. Card geometry, front and back. Cheap, no OCR, no grid. ---- */
  for (const [side, evidence] of [
    ["front", input.front],
    ["back", input.back],
  ] as const) {
    const geometry = evidence.bytes ? imageGeometry(evidence.bytes) : null;
    checks[`card-geometry-${side}`] = geometry
      ? judgeCardGeometry(geometry)
      : { status: "inconclusive", reasons: ["image-dimensions-unavailable"] };
  }

  /* ---- 2. Selfie: is there a person in the middle of the frame? ---- */
  /*
   * Two questions, in this order, because they fail in different ways:
   *
   *   skin   - is the central region made of human skin at all? A photograph of
   *            a printed document, a wall, a room or an animal has none, and
   *            that is the exact spoof from the report.
   *   tone   - does that region have the light-and-shadow structure of a face?
   *
   * Skin is the primary gate; tone only refines a photo that already passed it.
   */
  const faceBox = centralFaceBox();
  const boxJudgement = judgeFaceBox(faceBox);
  /*
   * Decoded from the bytes the submit route already downloaded and hashed.
   * No second service is consulted, so this cannot silently degrade to
   * "inconclusive" when Cloudinary is slow, transformed-blocked or rate limited.
   */
  const selfieBytes = input.selfie.bytes ?? (await download(input.selfie.url));
  const selfieGrid = selfieBytes ? await decodeToGrid(selfieBytes) : null;

  /*
   * The face detector is asked here too, and it is asked FIRST.
   *
   * This used to be colour only, and that was a contradiction that refused real
   * members. `/api/upload` runs `detectFaces` on the selfie and lets it pass with
   * a score of 0.877; the same photo then reached submit, where only the colour
   * screen looked at it, measured 9.5% inside the box, and failed the whole
   * application with "no-human-skin-in-frame". The member was told her selfie
   * does not show her face by a checkpoint that had never been shown her face,
   * after an earlier checkpoint had already found it.
   *
   * A detector that finds a face is stronger evidence than a colour share, so
   * when it answers, it decides. When it cannot run, the colour screen decides
   * exactly as before, and "could not confirm" still goes to Rabi rather than
   * becoming a refusal.
   *
   * Required lazily for the same reason `jpeg-js` and Tesseract are: this module
   * is imported by routes that never look at a photo, and pulling TensorFlow in
   * at module scope would make all of them pay for a model they do not use.
   */
  let detected: {
    human: boolean;
    score: number;
    status: "detected" | "none" | "unavailable";
    eyes?: "both" | "partial" | "none" | "unavailable";
  } | null = null;
  if (selfieBytes) {
    try {
      // Required lazily for the same reason `jpeg-js` is: see `decodeJpeg`.
      const faceServer = require("@/lib/kyc-face-server") as {
        detectFaces: (
          pixels: Uint8Array,
          width: number,
          height: number
        ) => Promise<{
          human: boolean;
          score: number;
          status: "detected" | "none" | "unavailable";
          eyes?: "both" | "partial" | "none" | "unavailable";
        }>;
      };
      const raster = await decodeRgba(selfieBytes);
      if (raster) {
        detected = await faceServer.detectFaces(raster.pixels, raster.width, raster.height);
      }
    } catch {
      // A missing or broken model is not a verdict about the member.
      detected = null;
    }
  }

  if (boxJudgement.status === "fail") {
    checks["selfie-subject"] = boxJudgement;
  } else if (!selfieGrid) {
    checks["selfie-subject"] = { status: "inconclusive", reasons: ["selfie-pixels-unavailable"], detail: boxDetail(faceBox) };
  } else if (detected?.status === "detected" && detected.human) {
    /*
     * The detector looked and found a human face. Landmark eyes are recorded but
     * never required: a member in glasses or blinking must not be refused, which
     * is why an eye miss is a note for Rabi rather than a failure.
     */
    const eyes = detected.eyes ?? "unavailable";
    checks["selfie-subject"] = {
      status: "pass",
      reasons: [
        `human-face-detected-score-${detected.score.toFixed(2)}`,
        ...(eyes === "both" ? ["eyes-detected"] : eyes === "unavailable" ? [] : [`eyes-${eyes}-face-found-please-confirm`]),
      ],
      detail: boxDetail(faceBox),
    };
  } else {
    const skin = skinRatio(selfieGrid, faceBox);
    if (skin === null) {
      checks["selfie-subject"] = { status: "inconclusive", reasons: ["selfie-pixels-unavailable"], detail: boxDetail(faceBox) };
    } else if (detected?.status === "none") {
      /*
       * A model trained to find faces found none anywhere in the frame. That is a
       * screen, a wall, a room, a card or a printout, and it is the case the dog
       * photo in the report was in. Colour keeps the word when it had one,
       * because "no skin in frame" is more useful to the member than a score.
       */
      checks["selfie-subject"] =
        skin < MIN_SKIN_RATIO
          ? {
              status: "fail",
              reasons: ["no-human-skin-in-frame"],
              detail: { ...boxDetail(faceBox), skinShare: Number((skin * 100).toFixed(1)) },
            }
          : {
              status: "fail",
              reasons: ["no-face-detected-in-frame"],
              detail: { ...boxDetail(faceBox), skinShare: Number((skin * 100).toFixed(1)) },
            };
    } else if (skin < MIN_SKIN_RATIO) {
      /*
       * No detector answered, and there is nothing skin-shaped in the middle of
       * the frame. Nothing legitimate is in this image, so refusing is safe.
       */
      checks["selfie-subject"] = {
        status: "fail",
        reasons: ["no-human-skin-in-frame"],
        detail: { ...boxDetail(faceBox), skinShare: Number((skin * 100).toFixed(1)) },
      };
    } else {
      const probe = probeBox(toLumaGrid(selfieGrid), faceBox);
      const tone = probe
        ? judgeFaceTone(probe, faceBox)
        : { status: "inconclusive" as CheckStatus, reasons: ["face-tone-unreadable"], box: faceBox };
      checks["selfie-subject"] = {
        status: tone.status,
        reasons: [...tone.reasons, ...(tone.status === "pass" ? ["person-in-frame"] : [])],
        detail: { ...boxDetail(faceBox), skinShare: Number((skin * 100).toFixed(1)) },
      };
    }
  }

  /* ---- 3. Card back: read the MRZ and check every ICAO digit. ---- */
  let ocrAvailable = false;
  let read: Td1Read | null = null;
  const backBytes = input.back.bytes ?? (await download(input.back.url));
  if (backBytes) {
    const ocr = await readImageText(backBytes);
    if (ocr === null) {
      checks["card-mrz"] = { status: "unavailable", reasons: ["ocr-engine-unavailable"] };
    } else {
      ocrAvailable = true;
      read = readTd1(ocr.text);
      /*
       * The check digits decide which of two very different things happened.
       *
       *   all four compute -> the OCR *provably* read a genuine TD1 correctly.
       *                       A misread character cannot produce four matching
       *                       ICAO check digits by accident, so a failure here
       *                       is the card's fault, not the camera's.
       *   a zone was found but some digits did not compute -> most likely a
       *                       blurred or glared portion of a real card. That is
       *                       Rabi's call, NOT an automatic refusal, because
       *                       punishing a member for their camera is how a
       *                       signup flow dies and this card may well be real.
       *                       The crossed checks are still recorded, so a
       *                       reviewer sees exactly what did not line up.
       *   no zone at all    -> a Ghana Card back always carries one.
       */
      if (!read) {
        const blank = ocr.text.trim().length < 12;
        checks["card-mrz"] = blank
          ? { status: "inconclusive", reasons: ["no-text-found-on-card-back"] }
          : { status: "fail", reasons: ["no-machine-readable-zone-found"] };
      } else if (!read.checksumsValid) {
        checks["card-mrz"] = {
          status: "inconclusive",
          reasons: [
            ...read.failedChecks.map((name) => `mrz-check-digit-uncertain-${name}`),
            "human-review-required",
          ],
          detail: { failedChecks: read.failedChecks.join(",") },
        };
      } else {
        checks["card-mrz"] = {
          status: "pass",
          reasons: ["mrz-issuer-gha-and-icao-checks-passed"],
          detail: { nationality: read.nationality },
        };
      }
    }
  } else {
    checks["card-mrz"] = { status: "unavailable", reasons: ["card-bytes-unavailable"] };
  }

  /* ---- 4. Does the card agree with the number the applicant typed? ---- */
  if (read && read.checksumsValid) {
    /*
     * Only compare numbers when the MRZ checksums proved the OCR read them
     * correctly. Comparing against a misread digit would refuse a member whose
     * card is perfectly genuine, which is the worst outcome this system can
     * produce.
     */
    checks["card-pin"] = matchTypedPin(input.typedPin, read);
  } else {
    checks["card-pin"] = { status: "inconclusive", reasons: ["pin-comparison-not-possible"] };
  }

  /* ---- 5. Does the card front actually carry Ghana Card printing? ---- */
  /*
   * A Ghana Card front reads GHANA / NATIONAL IDENTIFICATION AUTHORITY / CARD.
   * A CapCut splash screen, a bank card or a blank rectangle does not. This is
   * checked from OCR text, so it is unavailable rather than failed when the
   * engine cannot run — never a silent pass.
   */
  /* The MRZ step already downloaded the back when it could; reuse it. */
  const backBytesForTemplate = input.back.bytes ?? (await download(input.back.url));
  let lastFrontText = "";
  const frontBytes = input.front.bytes ?? (await download(input.front.url));
  if (frontBytes) {
    const frontOcr = await readImageText(frontBytes);
    if (frontOcr === null) {
      checks["card-front-print"] = { status: "unavailable", reasons: ["ocr-engine-unavailable"] };
    } else {
      ocrAvailable = true;
      lastFrontText = frontOcr.text;
      const markers = ghanaCardMarkers(frontOcr.text);
      checks["card-front-print"] = markers.matched
        ? { status: "pass", reasons: ["ghana-card-printing-recognised"], detail: { markers: markers.found.join(",") } }
        : frontOcr.text.trim().length < 12
          ? { status: "fail", reasons: ["card-front-has-no-readable-printing"] }
          : { status: "fail", reasons: ["card-front-printing-not-a-ghana-card"], detail: { markers: markers.found.join(",") } };
    }
  } else {
    checks["card-front-print"] = { status: "unavailable", reasons: ["card-bytes-unavailable"] };
  }

  /* ---- 6. Is this a manufactured card rather than a photographed one? ---- */
  /*
   * A template, a stock photo, or a design mock-up is not a citizen's card, and
   * the tell is in the text: a watermark for a template site, the word SPECIMEN,
   * a repeated SAMPLE, or a placeholder number of all zeros.
   *
   * Both sides are checked. The specimens in circulation carry their watermark on
   * whichever side the designer liked, and the back is where the all-zero MRZ
   * lives.
   *
   * When OCR is unavailable this is `unavailable`, never `pass`: a check that
   * cannot run must not become an alibi for a fraudster.
   */
  let backText = "";
  if (backBytesForTemplate) {
    const backOcr = await readImageText(backBytesForTemplate);
    if (backOcr === null) {
      checks["card-template"] = { status: "unavailable", reasons: ["ocr-engine-unavailable"] };
    } else {
      ocrAvailable = true;
      backText = backOcr.text;
    }
  }

  if (!checks["card-template"]) {
    const template = cardTemplateMarkers(`${lastFrontText} ${backText}`);
    const placeholder = cardNumberIsPlaceholder(input.typedPin) || cardNumberIsPlaceholder(read?.documentNumber ?? "");
    const found = [...template.found, ...(placeholder ? ["placeholder-number"] : [])];

    checks["card-template"] = found.length > 0
      ? {
          status: "fail",
          reasons: [placeholder && template.found.length === 0 ? "card-number-is-a-placeholder" : "card-is-a-manufactured-template"],
          detail: { found: found.join(",") },
        }
      : { status: "pass", reasons: ["no-template-markings"] };
  }

  return {
    state: classifyDeterministic(checks),
    checks,
    reasons: collectReasons(checks),
    engine: { ocr: ocrAvailable },
  };
}

function boxDetail(box: { x: number; y: number; w: number; h: number }): Record<string, number> {
  return { boxX: box.x, boxY: box.y, boxW: box.w, boxH: box.h };
}

/** Bounded, host-checked download. Same rules as the submit route. */
async function download(url: string): Promise<Uint8Array | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") return null;
  } catch {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", redirect: "error" });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 8 * 1024 * 1024) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.length > 0 && buffer.length <= 8 * 1024 * 1024 ? buffer : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}


/* -------------------------------------------------------- local decoding */

/**
 * Decode the uploaded bytes into a colour grid, on this server, with no network.
 *
 * This replaces the previous approach, which asked Cloudinary to render a 32x32
 * PNG and decoded that. It was clever and it was wrong: if that one request
 * failed for any reason — a transformation blocked by account settings, a
 * timeout, a 401 — the grid came back null, the selfie check returned
 * "inconclusive", and the submission was accepted with nothing checked. A
 * spoofed selfie then looked exactly like a real one, which is precisely the
 * behaviour this whole layer exists to prevent.
 *
 * Screening must never depend on a second service being reachable. The bytes are
 * already here, so they are decoded here.
 *
 * Output is a fixed GRID_EDGE square, box-filtered down, which is all the checks
 * need: skin chroma and luminance structure.
 */
export async function decodeToGrid(bytes: Uint8Array): Promise<RgbGrid | null> {
  const decoded = decodeAny(bytes);
  if (!decoded) return null;
  return resample(decoded, GRID_EDGE);
}

/** Greyscale field first; the grid is a box-filtered resample of it. */
interface RawImage {
  width: number;
  height: number;
  /** Row-major RGB triplets. */
  pixels: Uint8Array;
}

/**
 * Decode JPEG, or a PNG Cloudinary/Tesseract might hand us. WebP and HEIC are
 * not decoded here: the upload route already re-encodes phone photos to JPEG,
 * and anything else returns null, which the caller records as "could not judge"
 * rather than a pass.
 */
export function decodeAny(bytes: Uint8Array): RawImage | null {
  if (bytes.length < 24) return null;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return decodeJpeg(bytes);
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const grid = decodePngRgb(bytes);
    if (!grid) return null;
    const pixels = new Uint8Array(grid.width * grid.height * 3);
    grid.values.forEach(([r, g, b], index) => {
      pixels[index * 3] = r;
      pixels[index * 3 + 1] = g;
      pixels[index * 3 + 2] = b;
    });
    return { width: grid.width, height: grid.height, pixels };
  }
  return null;
}

function decodeJpeg(bytes: Uint8Array): RawImage | null {
  try {
    // jpeg-js is pure JavaScript and synchronous; decoding a 1600px photo takes
    // tens of milliseconds, which is why it is safe inside a function.
    /*
     * Required lazily on purpose. jpeg-js is a CommonJS module and importing it
     * at module scope made it load for every route that touches screening,
     * including the ones that never decode anything. The `require` also keeps
     * the bundler from trying to inline it.
     */
    const jpeg = require("jpeg-js") as {
      decode: (input: Uint8Array, options?: { useTArray?: boolean; formatAsRGBA?: boolean }) => {
        width: number;
        height: number;
        data: Uint8Array;
      };
    };
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    if (!image.width || !image.height || !image.data) return null;
    const pixels = new Uint8Array(image.width * image.height * 3);
    for (let index = 0, source = 0; index < pixels.length; index += 3, source += 4) {
      pixels[index] = image.data[source];
      pixels[index + 1] = image.data[source + 1];
      pixels[index + 2] = image.data[source + 2];
    }
    return { width: image.width, height: image.height, pixels };
  } catch {
    return null;
  }
}

/**
 * Decode straight to RGBA at full resolution.
 *
 * `decodeAny` deliberately throws the alpha channel away and its result is fed
 * to the 32x32 grid; the face detector needs the real pixels, so it gets its own
 * door to the same decoder rather than a lossy round trip.
 *
 * Returns null for anything not decodable here. The caller must treat that as
 * "could not judge", never as "no face".
 */
export async function decodeRgba(
  bytes: Uint8Array
): Promise<{ pixels: Uint8Array; width: number; height: number } | null> {
  if (bytes.length < 24) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    try {
      const jpeg = require("jpeg-js") as {
        decode: (input: Uint8Array, options?: { useTArray?: boolean; formatAsRGBA?: boolean }) => {
          width: number;
          height: number;
          data: Uint8Array;
        };
      };
      const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
      if (!image.width || !image.height || !image.data) return null;
      return { pixels: image.data, width: image.width, height: image.height };
    } catch {
      return null;
    }
  }

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const grid = decodePngRgb(bytes);
    if (!grid) return null;
    const pixels = new Uint8Array(grid.width * grid.height * 4);
    grid.values.forEach(([r, g, b], index) => {
      pixels[index * 4] = r;
      pixels[index * 4 + 1] = g;
      pixels[index * 4 + 2] = b;
      pixels[index * 4 + 3] = 255;
    });
    return { pixels, width: grid.width, height: grid.height };
  }

  return null;
}

/** Box-filter a decoded image down to `edge` x `edge`. */
function resample(image: RawImage, edge: number): RgbGrid {
  const values: Array<[number, number, number]> = new Array(edge * edge);
  const { width, height, pixels } = image;

  for (let gy = 0; gy < edge; gy += 1) {
    const y0 = Math.floor((gy * height) / edge);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / edge));
    for (let gx = 0; gx < edge; gx += 1) {
      const x0 = Math.floor((gx * width) / edge);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / edge));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < height; y += 1) {
        for (let x = x0; x < x1 && x < width; x += 1) {
          const at = (y * width + x) * 3;
          r += pixels[at];
          g += pixels[at + 1];
          b += pixels[at + 2];
          count += 1;
        }
      }
      values[gy * edge + gx] =
        count > 0
          ? [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
          : [0, 0, 0];
    }
  }

  return { width: edge, height: edge, values };
}

/* ------------------------------------------------------------- diagnostics */

/**
 * Report whether the deterministic layer can actually run here.
 *
 * Used by `/api/kyc/diagnose` so an operator can tell "the OCR engine did not
 * load" apart from "the card was rejected", without reading a log. Building the
 * worker is the only honest test of readiness, so it is warmed here and reused.
 */
export async function deterministicEngineStatus(): Promise<{ ocr: boolean }> {
  const worker = await getWorker();
  return { ocr: Boolean(worker) };
}

/**
 * Does this text carry the printing that only appears on a Ghana Card?
 *
 * Deliberately generous about OCR noise: it counts markers rather than requiring
 * an exact phrase, because real cards are photographed at angles, in poor light
 * and through a plastic sleeve. Two independent markers is enough to say "this
 * is a Ghana Card"; the MRZ checksums are what prove it was a real one.
 */
/**
 * The words that appear on every template card and never on a real one.
 *
 * The user supplied twelve card images and they are almost all manufactured: one
 * carries a watermark for a design site, one shows Mr Bean as the cardholder, one
 * says `SAMPLE SAMPLE SAMPLE`, one is the famous `ARABA SMART BIOMETRIC CARD`
 * specimen, and several carry the `000000000` ID that produces an all-zero MRZ.
 *
 * These are not typos a member makes. They are the fingerprints of a design
 * template, a stock photo, or a Photoshop demonstration — and unlike a colour
 * heuristic, this evidence is genuinely conclusive: a real Ghana Card has a real
 * person's name on it.
 *
 * Deliberately narrow. Matching on "SAMPLE" alone would refuse a member whose
 * surname happens to be Sample, so each pattern requires template context. The
 * cost of a miss here is one fake reaching Rabi's queue; the cost of a false
 * positive is refusing a real citizen, which is worse.
 */
const TEMPLATE_MARKERS: [string, RegExp][] = [
  ["design-watermark", /\b[A-Z]{2,}TEMPL\.?\s?COM\b|MYTEMPL|TEMPLATE\s*COM|READY\s*TEMPLATES?/],
  ["specimen-word", /\bSPECIMEN\b|\bSAMPLE\s+CARD\b|\bVOID\b/],
  ["repeated-sample", /\bSAMPLE\b[\s\S]{0,40}?\bSAMPLE\b/],
  ["placeholder-name", /BIOMETRIC\s*CARD[\s\S]{0,40}?ARABA|\bARABA\b[\s\S]{0,20}?SMART\b/],
  ["celebrity-cardholder", /\bMR\s+BEAN\b|\bROWAN\s+ATKINSON\b/],
];

export interface TemplateFinding {
  templated: boolean;
  found: string[];
}

/**
 * Look for the marks of a manufactured card.
 *
 * `text` is OCR output from the whole card — front and back are both worth
 * checking, because the specimens in circulation carry the tell on either side.
 */
export function cardTemplateMarkers(text: string): TemplateFinding {
  const upper = (text ?? "").toUpperCase().replace(/\s+/g, " ");
  const found = TEMPLATE_MARKERS.filter(([, pattern]) => pattern.test(upper)).map(([name]) => name);
  return { templated: found.length > 0, found };
}

/**
 * A card number made of one repeated group of zeros.
 *
 * Every specimen in the user's set uses `GHA-000000000-0`, which is why their MRZ
 * lines read `<0000000<<<0012<<…`. The nine-digit body is all zeros and the check
 * digit is therefore zero too — so an all-zero payload passes an ICAO checksum
 * **perfectly**, and the checksum proves only that the seven/five/six digits
 * repeated on both sides of the card agree, which a template guarantees by
 * design.
 *
 * A real Ghana Card number is nine digits of real entropy. Requiring at least
 * four distinct digits is lenient enough to pass any genuine card and still
 * rejects every placeholder.
 */
export function cardNumberIsPlaceholder(pin: string): boolean {
  const digits = (pin ?? "").replace(/\D/g, "");
  if (digits.length < 9) return false;
  const body = digits.slice(0, 9);
  const distinct = new Set(body.split("")).size;
  return distinct < 4;
}

export function ghanaCardMarkers(text: string): { matched: boolean; found: string[] } {
  const upper = (text ?? "").toUpperCase();
  const tests: [string, RegExp][] = [
    ["ghana", /GHANA/],
    ["national", /NATIONAL/],
    ["identification", /IDENTIFICATION/],
    ["authority", /AUTHORITY/],
    ["nia", /\bN\.?\s?I\.?\s?A\.?\b/],
    ["card", /\bCARD\b/],
    ["republic", /REPUBLIC/],
    ["ecowas", /ECOWAS/],
    ["pin", /GHA\s*-?\s*\d{9}/],
    ["date-of-birth", /DATE\s*OF\s*BIRTH|DOB/],
    ["sex", /\bSEX\b/],
    ["nationality", /NATIONALITY/],
  ];
  const found = tests.filter(([, pattern]) => pattern.test(upper)).map(([name]) => name);
  return { matched: found.length >= 2, found };
}
