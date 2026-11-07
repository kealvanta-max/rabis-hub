/**
 * A quick, local look at a photo of a card, before any text is read.
 *
 * OCR will happily return confident nonsense from a photo of a photocopy, a
 * photo of a screen, or a smear. The cheap pixel checks below catch the four
 * ways a real member actually fails: too dark, too blurry, a stripe of glare
 * over the details, or a photo of another screen. All of it runs on the device,
 * in one canvas pass, roughly thirty milliseconds.
 */

export interface PhotoAssessment {
  ok: boolean;
  /** Variance of the Laplacian. Higher is sharper. */
  sharpness: number;
  /** Share of the frame that is blown out to near white. */
  glare: number;
  /** Average luminance, 0 to 255. */
  brightness: number;
  /** Share of pixels sitting at one extreme or the other, a screen photo tell. */
  extremes: number;
  /** True when the photo is usable but worth a human look. */
  review: boolean;
  message?: string;
  reasons: string[];
}

const MAX_EDGE = 720;

const BLURRY = "The card looks blurry. Hold the phone steady, let the camera focus, then take the photo again.";
const GLARE =
  "The back of your card is too blurry or has glare. Please move to a well-lit area and retake the photo.";
const DARK = "That photo is too dark to read. Move somewhere with more light and try again.";
const SCREEN =
  "That looks like a photo of a screen rather than the card itself. Please photograph the physical card.";

function toGray(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    // Rec. 601 luma, which matches what the eye treats as brightness.
    gray[pixel] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

export async function assessDocumentPhoto(file: File | Blob): Promise<PhotoAssessment> {
  const fallback: PhotoAssessment = {
    ok: true,
    sharpness: 0,
    glare: 0,
    brightness: 128,
    extremes: 0,
    review: true,
    reasons: ["analysis-unavailable"],
  };

  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return fallback;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;

    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const gray = toGray(data, width, height);

    let sum = 0;
    let glareCount = 0;
    let extremesCount = 0;
    for (let pixel = 0; pixel < gray.length; pixel += 1) {
      const value = gray[pixel];
      sum += value;
      if (value > 246) glareCount += 1;
      if (value > 246 || value < 9) extremesCount += 1;
    }

    const brightness = sum / gray.length;
    const glare = glareCount / gray.length;
    const extremes = extremesCount / gray.length;

    /*
     * Laplacian variance. A sharp edge in either direction contributes a large
     * square, so a real card with printed text and a guilloche pattern scores in
     * the hundreds, and a defocused photo scores in the low tens.
     */
    let lapSum = 0;
    let lapSquares = 0;
    let counted = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const centre = gray[y * width + x];
        const lap =
          4 * centre -
          gray[(y - 1) * width + x] -
          gray[(y + 1) * width + x] -
          gray[y * width + x - 1] -
          gray[y * width + x + 1];
        lapSum += lap;
        lapSquares += lap * lap;
        counted += 1;
      }
    }

    const mean = counted ? lapSum / counted : 0;
    const sharpness = counted ? lapSquares / counted - mean * mean : 0;

    const reasons: string[] = [];
    let message: string | undefined;
    let review = false;

    if (brightness < 46) {
      reasons.push("too-dark");
      message = DARK;
    }

    if (glare > 0.055) {
      reasons.push("glare");
      message = GLARE;
    }

    if (sharpness < 62) {
      reasons.push("blurry");
      message = GLARE;
    }

    // A photo of a screen loses its mid tones: almost everything is either lit
    // or black. Flagged for a human rather than refused, because a genuinely
    // high contrast card photo can look similar.
    if (extremes > 0.82) {
      reasons.push("possible-screen");
      review = true;
      message = message ?? SCREEN;
    }

    const ok = !reasons.includes("too-dark") && !reasons.includes("glare") && !reasons.includes("blurry");

    return { ok, sharpness: Math.round(sharpness), glare, brightness: Math.round(brightness), extremes, review, message, reasons };
  } catch {
    return fallback;
  } finally {
    bitmap?.close?.();
  }
}
