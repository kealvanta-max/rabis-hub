import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  centralFaceBox,
  classifyDeterministic,
  decodePngRgb,
  imageGeometry,
  isSkinTone,
  judgeCardGeometry,
  judgeCardPhoto,
  judgeSelfiePhoto,
  matchTypedPin,
  readTd1,
  readImageText,
  skinRatio,
  type RgbGrid,
} from "@/lib/kyc-deterministic";

/*
 * These fixtures are the pixel data of the three cases from the bug report,
 * rendered at 32x32 exactly as Cloudinary renders them: a real face, a photo of
 * a room, and a photo of a document taped to a wall. The last two were both
 * accepted by production before this change.
 */
const fixture = (name: string): RgbGrid =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as RgbGrid;

const file = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.join(__dirname, "fixtures", name)));

const FACE = fixture("luma-face.json");
const ROOM = fixture("luma-room.json");
const WALL_DOCUMENT = fixture("luma-wall-document.json");
const BOX = centralFaceBox();

describe("skin tone detection", () => {
  it("recognises the chroma of real skin", () => {
    // A light and a dark complexion, both of which must pass.
    expect(isSkinTone(232, 190, 165)).toBe(true);
    expect(isSkinTone(120, 82, 64)).toBe(true);
  });

  it("rejects the colours of walls, paper and sky", () => {
    expect(isSkinTone(215, 215, 215)).toBe(false); // grey wall
    expect(isSkinTone(246, 244, 238)).toBe(false); // white paper
    expect(isSkinTone(140, 160, 190)).toBe(false); // blue-grey
    expect(isSkinTone(90, 120, 80)).toBe(false); // foliage
  });
});

describe("selfie screening, on the reported images", () => {
  it("does not refuse a real face", () => {
    /*
     * This used to assert `pass`, which overstated what the check can do: a
     * colour screen cannot prove a face is present, only that skin-coloured
     * pixels are. It now returns `inconclusive`, meaning "screening did not
     * object, a human still decides". The assertion that matters — a real
     * member is never rejected for their own photo — is unchanged.
     */
    const verdict = judgeSelfiePhoto(FACE, BOX);
    expect(verdict.status).not.toBe("fail");
  });

  it("refuses a photo of a room", () => {
    const verdict = judgeSelfiePhoto(ROOM, BOX);
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons.some((reason) => reason.includes("skin") || reason.includes("face"))).toBe(true);
  });

  it("refuses a photo of a document taped to a wall", () => {
    /*
     * This is the exact spoof that reached Rabi's queue: it has plenty of
     * luminance contrast from the printed lines, so a flatness test alone would
     * pass it. Only the absence of skin gives it away.
     */
    const verdict = judgeSelfiePhoto(WALL_DOCUMENT, BOX);
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons).toContain("no-human-skin-in-frame");
  });

  it("measures a clear gap between a face and the spoofs", () => {
    const face = skinRatio(FACE, BOX)!;
    const room = skinRatio(ROOM, BOX)!;
    const document = skinRatio(WALL_DOCUMENT, BOX)!;
    expect(face).toBeGreaterThan(0.25);
    expect(room).toBeLessThan(0.02);
    expect(document).toBeLessThan(0.02);
  });
});

describe("card geometry, read from the file header", () => {
  it("reads JPEG dimensions without decoding the image", () => {
    const geometry = imageGeometry(file("photo-ghana-card-back.jpg"));
    expect(geometry).not.toBeNull();
    expect(geometry!.width).toBe(1200);
    expect(geometry!.height).toBe(740);
    expect(geometry!.landscape).toBe(true);
  });

  it("accepts a landscape card-shaped photo", () => {
    const geometry = imageGeometry(file("photo-ghana-card-back.jpg"));
    expect(judgeCardGeometry(geometry).status).toBe("pass");
  });

  it("refuses a portrait photo in a card slot", () => {
    // The card-back slot in the report held a portrait photo of a person.
    const geometry = imageGeometry(file("photo-face.jpg"));
    expect(geometry!.landscape).toBe(false);
    const verdict = judgeCardGeometry(geometry);
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons).toContain("card-not-landscape");
  });

  it("returns nothing for bytes that are not an image", () => {
    expect(imageGeometry(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });
});

describe("card surface", () => {
  const geometry = imageGeometry(file("photo-ghana-card-back.jpg"));

  it("accepts a pale card carrying print", () => {
    const verdict = judgeCardPhoto({ geometry, grid: WALL_DOCUMENT, box: BOX });
    expect(verdict.status).toBe("pass");
  });

  it("refuses a dark scene presented as a card", () => {
    const dark: RgbGrid = {
      width: 32,
      height: 32,
      values: Array.from({ length: 32 * 32 }, () => [18, 16, 20] as [number, number, number]),
    };
    const verdict = judgeCardPhoto({ geometry, grid: dark, box: BOX });
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons).toContain("card-region-too-dark");
  });
});

describe("MRZ reading", () => {
  const REAL = [
    "REPUBLIC OF GHANA",
    "NATIONAL IDENTIFICATION AUTHORITY",
    "I<GHA0020892799<<<<<<<<<<<<<<<",
    "9001011M3001019GHA<<<<<<<<<<<8",
    "0020892793GHA<<<<<<<<<<<<<<<<<",
  ].join("\n");

  it("accepts a card whose ICAO check digits all compute", () => {
    const read = readTd1(REAL);
    expect(read).not.toBeNull();
    expect(read!.checksumsValid).toBe(true);
    expect(read!.documentNumber).toBe("002089279");
    expect(read!.nationality).toBe("GHA");
  });

  it("refuses a card with a tampered check digit", () => {
    const read = readTd1(REAL.replace("I<GHA0020892799", "I<GHA0020892795"));
    expect(read).not.toBeNull();
    expect(read!.checksumsValid).toBe(false);
    expect(read!.failedChecks).toContain("document-number");
  });

  it("ignores a machine-readable zone from another country", () => {
    // Same shape, valid checksums, wrong issuer: a Nigerian ID is not a Ghana Card.
    const nigerian = REAL.replace("I<GHA", "I<NGA");
    expect(readTd1(nigerian)).toBeNull();
  });

  it("finds nothing in a photo of a room", () => {
    expect(readTd1("A wall. A door. Nothing else.")).toBeNull();
  });
});

describe("tying the card to the typed number", () => {
  const read = readTd1(
    ["I<GHA0020892799<<<<<<<<<<<<<<<", "9001011M3001019GHA<<<<<<<<<<<8", "0020892793GHA<<<<<<<<<<<<<<<<<"].join("\n")
  )!;

  it("passes when the typed PIN matches the MRZ", () => {
    expect(matchTypedPin("GHA-002089279-3", read).status).toBe("pass");
  });

  it("fails when the applicant typed a different card", () => {
    const verdict = matchTypedPin("GHA-999999999-1", read);
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons).toContain("typed-pin-does-not-match-mrz");
  });

  it("never records the digits themselves", () => {
    const verdict = matchTypedPin("GHA-999999999-1", read);
    expect(JSON.stringify(verdict.detail)).not.toContain("999999999");
  });
});

describe("collapsing checks into a state", () => {
  it("refuses when anything failed", () => {
    expect(
      classifyDeterministic({
        a: { status: "pass", reasons: [] },
        b: { status: "fail", reasons: ["x"] },
      })
    ).toBe("rejected");
  });

  it("defers to a human when nothing could be read", () => {
    expect(classifyDeterministic({ a: { status: "inconclusive", reasons: [] } })).toBe("manual_review_required");
  });

  it("reports an unavailable engine separately from a bad photo", () => {
    expect(classifyDeterministic({ a: { status: "unavailable", reasons: [] } })).toBe("verification_unavailable");
  });
});

describe("PNG decoding for the pixel grid", () => {
  it("rejects a payload that is not a PNG", () => {
    expect(decodePngRgb(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("round-trips a real 8-bit RGB PNG and keeps colour", () => {
    const png = makePng(8, 8, () => [232, 190, 165]);
    const grid = decodePngRgb(png);
    expect(grid).not.toBeNull();
    expect(grid!.width).toBe(8);
    expect(grid!.values[0]).toEqual([232, 190, 165]);
  });

  it("separates a skin-coloured frame from a grey one", () => {
    const skin = decodePngRgb(makePng(32, 32, () => [225, 180, 150]))!;
    const grey = decodePngRgb(makePng(32, 32, () => [210, 210, 210]))!;
    expect(skinRatio(skin, BOX)!).toBeGreaterThan(0.9);
    expect(skinRatio(grey, BOX)!).toBe(0);
  });
});

/**
 * A minimal PNG writer, so the decoder is tested against bytes it did not
 * produce. Cloudinary renders the real grid; this proves the reader handles an
 * ordinary 8-bit RGB PNG with no interlace, which is what that render is.
 */
function makePng(
  width: number,
  height: number,
  px: (x: number, y: number) => [number, number, number]
): Uint8Array {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (let index = 0; index < buf.length; index += 1) {
      c = table[(c ^ buf[index]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(typed));
    return Buffer.concat([length, typed, check]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = px(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}

describe("a real card that OCR only partly read", () => {
  /*
   * The policy this pins down: a blurred or glared real card must not be
   * refused automatically. Four matching ICAO check digits cannot happen by
   * accident, so a failure there is either a bad photo of a real card (Rabi's
   * call) or an edited card (also Rabi's call, with the crossed checks recorded).
   * What it must never do is refuse a genuine member outright.
   */
  const REAL = [
    "I<GHA0020892799<<<<<<<<<<<<<<<",
    "9001011M3001019GHA<<<<<<<<<<<8",
    "0020892793GHA<<<<<<<<<<<<<<<<<",
  ].join("\n");

  it("reads all four check digits from a clean scan", () => {
    expect(readTd1(REAL)!.checksumsValid).toBe(true);
  });

  it("flags a crossed digit without claiming the card is fake", () => {
    const damaged = readTd1(REAL.replace("I<GHA0020892799", "I<GHA00208927X9"));
    // A misread digit is not a valid zone at all, which is the common case.
    expect(damaged === null || damaged.checksumsValid === false).toBe(true);
  });

  it("does not compare the typed number against an unproven read", () => {
    // Flip the date-of-birth check digit: the zone still parses, so the caller
    // can tell "read but crossed" apart from "not a card at all".
    const read = readTd1(REAL.replace("9001011M", "9001012M"));
    expect(read).not.toBeNull();
    expect(read!.checksumsValid).toBe(false);
    expect(read!.failedChecks).toContain("date-of-birth");
    // The caller skips the PIN comparison in this case, because matchTypedPin
    // would be comparing against digits OCR may have got wrong.
  });
});

describe("server OCR in a deployed function", () => {
  /*
   * Vercel mounts the function read-only. tesseract.js writes the decompressed
   * model to its `cachePath` on first use, so a default cache would hit a
   * read-only filesystem, log the failure, and leave a 23 MB file behind when it
   * does not. These guard both halves of that.
   */
  it("reads a real card through the deployed asset path", async () => {
    const bytes = new Uint8Array(
      readFileSync(path.join(__dirname, "fixtures", "photo-ghana-card-back.jpg"))
    );
    const ocr = await readImageText(bytes);
    expect(ocr).not.toBeNull();
    expect(ocr!.confidence).toBeGreaterThan(50);
    const read = readTd1(ocr!.text);
    expect(read).not.toBeNull();
    expect(read!.checksumsValid).toBe(true);
  }, 90_000);

  it("never writes its cache into the working directory", () => {
    expect(existsSync(path.join(process.cwd(), "eng.traineddata"))).toBe(false);
  });
});
