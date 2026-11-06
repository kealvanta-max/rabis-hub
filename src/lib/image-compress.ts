/**
 * Make a phone photo small enough to survive the trip to the server.
 *
 * Vercel refuses request bodies above 4.5 MB before our route runs, and a modern
 * Android camera happily produces 6 MB stills. A 1600px JPEG at quality 82 is
 * around 300 KB, which is sharper than a card check needs and small enough that
 * the member's own data bundle barely notices.
 *
 * Everything here is best effort: if the browser cannot decode the file (HEIC on
 * some Androids, an exotic format, a canvas-less environment) the original is
 * returned untouched and the server's byte sniffing takes over.
 */

const SKIP_UNDER_BYTES = 700 * 1024;
const TARGET_BYTES = 2 * 1024 * 1024;

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the element path */
    }
  }

  if (typeof document === "undefined") return null;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function encode(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  quality: number
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  // JPEG has no alpha, so paint white first instead of letting odd pixels go black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source as CanvasImageSource, 0, 0, width, height);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export interface ShrinkOptions {
  /** Longest side in pixels. 1600 keeps a Ghana Card readable. */
  maxSide?: number;
  /** JPEG quality, 0 to 1. */
  quality?: number;
  /** Re-encode even a small file. Used when a first upload already failed. */
  force?: boolean;
}

export async function shrinkImage(file: File, options: ShrinkOptions = {}): Promise<File> {
  const { maxSide = 1600, quality = 0.82, force = false } = options;

  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/heic" || file.type === "image/heif") return file;
  if (!force && file.size <= SKIP_UNDER_BYTES) return file;

  const source = await loadBitmap(file);
  if (!source) return file;

  const naturalWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const naturalHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!naturalWidth || !naturalHeight) return file;

  const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  try {
    let blob = await encode(source, width, height, quality);
    if (blob && blob.size > TARGET_BYTES) {
      blob = (await encode(source, width, height, Math.max(0.45, quality - 0.2))) ?? blob;
    }
    // A forced re-encode exists to make the file smaller, so never hand back a
    // bigger one just because it failed that test.
    if (!blob) return file;
    if (!force && blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}
