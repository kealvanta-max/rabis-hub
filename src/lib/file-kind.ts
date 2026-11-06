/**
 * What is this file, really?
 *
 * The browser's `file.type` is a hint, not a fact. Android Chrome hands back an
 * empty string for some camera and download-manager picks, and a phone that
 * stores photos as HEIC often labels them `image/jpg`. Trusting the label meant
 * a member's perfectly good Ghana Card was refused with "only JPG, PNG or WEBP".
 *
 * So the server looks at the first bytes instead. This module is deliberately
 * pure (no `File`, no `Buffer`, no DOM) which keeps it testable and lets both the
 * route and the tests agree on the same rules.
 */

export type FileKind = "image" | "video";

/** Vercel rejects request bodies over 4.5 MB before our code even runs. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Cloudinary folder for every KYC artefact. */
export const UPLOAD_FOLDER = "rabis-kyc";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let index = start; index < start + length && index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

/**
 * Identify an image or video from its magic bytes.
 *
 * Returns `null` for anything else, which is exactly what we want: the route
 * refuses unknown content rather than storing it.
 */
export function sniffFileKind(bytes: Uint8Array): FileKind | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image";

  // ISO base media (HEIC images and MP4/MOV video): "....ftyp<brand>"
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "avif"].includes(brand)) {
      return "image";
    }
    if (["isom", "iso2", "mp41", "mp42", "avc1", "qt  ", "M4V ", "3gp4"].includes(brand)) {
      return "video";
    }
    // Unknown ISO brand: still media, and the size cap is the real guard.
    return "video";
  }

  // WebM / Matroska: 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video";
  }

  return null;
}

/** Mime types we accept, used only as a secondary signal next to the bytes. */
export function kindFromMime(mime: string): FileKind | null {
  const value = (mime || "").toLowerCase();
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  return null;
}

/**
 * Cloudinary's own words, translated into something Rabi can act on.
 *
 * This exists because the previous behaviour collapsed every failure into
 * "Upload failed. Check your connection", which was wrong advice for a signature
 * mismatch and sent her hunting the wrong problem for days.
 */
export function explainCloudinaryError(message: string | undefined): string {
  const text = (message || "").toLowerCase();

  if (text.includes("invalid signature") || text.includes("api_key") || text.includes("unknown api key")) {
    return "The Cloudinary API key or secret does not belong to this cloud name. Check the three CLOUDINARY values.";
  }
  if (text.includes("upload preset")) {
    return "Cloudinary rejected the upload preset. Check the preset name, or add the API secret so uploads can be signed.";
  }
  if (text.includes("cloud_name") || text.includes("cloud name")) {
    return "Cloudinary does not recognise this cloud name. Check NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.";
  }
  if (text.includes("quota") || text.includes("limit exceeded")) {
    return "The Cloudinary account is over its limit for this month.";
  }
  if (text.includes("file size") || text.includes("too large")) {
    return "Cloudinary refused the file size. Try a smaller photo.";
  }

  return "Cloudinary refused the upload. The server log has the exact reason.";
}
