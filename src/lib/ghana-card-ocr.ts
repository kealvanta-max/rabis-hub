/**
 * Browser-side OCR for KYC documents.
 *
 * Tesseract is ~1 MB of WASM, so it is imported **on demand** — the signup page
 * only pays for it on the step where a card is actually scanned.
 */

export interface OcrTextResult {
  text: string;
  confidence: number;
}

let recognitionCount = 0;

export async function recognizeDocument(image: File | Blob | string): Promise<OcrTextResult> {
  const { default: Tesseract } = await import("tesseract.js");

  const source =
    typeof image === "string" ? image : URL.createObjectURL(image as Blob);

  try {
    const result = await Tesseract.recognize(source, "eng", {
      // Keep the console quiet; failures are handled by the caller.
      logger: () => undefined,
    });
    recognitionCount += 1;
    return {
      text: result.data.text ?? "",
      confidence: Math.round(result.data.confidence ?? 0),
    };
  } finally {
    if (typeof image !== "string") URL.revokeObjectURL(source);
  }
}

export function getOcrRunCount() {
  return recognitionCount;
}
