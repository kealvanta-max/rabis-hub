import { describe, expect, it } from "vitest";

import {
  explainCloudinaryError,
  kindFromMime,
  MAX_UPLOAD_BYTES,
  sniffFileKind,
} from "@/lib/file-kind";

/** Build a fake header: 64 bytes, with the given prefix. */
function header(...prefix: number[]) {
  const bytes = new Uint8Array(64);
  bytes.set(prefix, 0);
  return bytes;
}

function asciiAt(offset: number, text: string) {
  return Array.from(text).map((char) => char.charCodeAt(0));
}

describe("file sniffing", () => {
  it("recognises the formats a phone actually produces", () => {
    expect(sniffFileKind(header(0xff, 0xd8, 0xff, 0xe0))).toBe("image");
    expect(sniffFileKind(header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image");
    expect(
      sniffFileKind(header(...asciiAt(0, "RIFF"), 0, 0, 0, 0, ...asciiAt(0, "WEBP")))
    ).toBe("image");
  });

  it("treats an iPhone HEIC photo as an image, not an unknown blob", () => {
    const heic = header(0, 0, 0, 0x18, ...asciiAt(0, "ftyp"), ...asciiAt(0, "heic"));
    expect(sniffFileKind(heic)).toBe("image");
  });

  it("separates a liveness clip from a photo", () => {
    const webm = header(0x1a, 0x45, 0xdf, 0xa3);
    expect(sniffFileKind(webm)).toBe("video");

    const mp4 = header(0, 0, 0, 0x20, ...asciiAt(0, "ftyp"), ...asciiAt(0, "isom"));
    expect(sniffFileKind(mp4)).toBe("video");
  });

  it("refuses anything that is not media", () => {
    expect(sniffFileKind(header(...asciiAt(0, "%PDF-1.7")))).toBeNull();
    expect(sniffFileKind(header(...asciiAt(0, "<!DOCTYPE")))).toBeNull();
    expect(sniffFileKind(new Uint8Array(4))).toBeNull();
  });

  it("falls back to the declared type when the bytes are unknown", () => {
    expect(kindFromMime("image/jpeg")).toBe("image");
    expect(kindFromMime("VIDEO/WEBM")).toBe("video");
    // Android sometimes sends this, which is what the server has to tolerate.
    expect(kindFromMime("")).toBeNull();
    expect(kindFromMime("application/pdf")).toBeNull();
  });

  it("keeps the cap under Vercel's 4.5 MB request limit", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(1024 * 1024);
  });
});

describe("cloudinary explanations", () => {
  it("names a key that belongs to another cloud", () => {
    expect(explainCloudinaryError("Invalid Signature abc123. String to sign")).toContain(
      "does not belong to this cloud name"
    );
  });

  it("does not blame the member's connection", () => {
    const message = explainCloudinaryError("Stale request");
    expect(message.toLowerCase()).not.toContain("connection");
  });

  it("explains a missing preset", () => {
    expect(explainCloudinaryError("Upload preset not found")).toContain("preset");
  });
});
