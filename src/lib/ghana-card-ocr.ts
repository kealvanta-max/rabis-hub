/**
 * Browser-side OCR for KYC documents.
 *
 * Tesseract is ~7 MB of engine and language data, so the worker is created on
 * demand and then reused for the front, the back and any retry.
 *
 * Everything it needs is served from our own domain by
 * `scripts/vendor-kyc-assets.mjs`. It used to come from `cdn.jsdelivr.net` and
 * `tessdata.projectnaptha.com` at the exact moment a member picked a photo, and
 * our Content-Security-Policy does not allow either origin, so the read failed on
 * every single card and every document fell through to manual review with the
 * useless message "we could not read the card automatically on this connection".
 * The CDN is kept as a fallback for the rare case our local copy does not fit.
 */

export interface OcrTextResult {
  text: string;
  confidence: number;
}

const LOCAL_WORKER = "/kyc/tesseract/worker.min.js";
const LOCAL_CORE = "/kyc/tesseract/core";
const LOCAL_LANG = "/kyc/tesseract/lang";

/** A phone that cannot finish in this long is better served by a human. */
const OCR_TIMEOUT_MS = 45000;

let recognitionCount = 0;
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function createWorker(preferLocal: boolean) {
  const { createWorker } = await import("tesseract.js");

  if (!preferLocal) return createWorker("eng", 1, { logger: () => undefined });

  return createWorker("eng", 1, {
    workerPath: LOCAL_WORKER,
    corePath: LOCAL_CORE,
    langPath: LOCAL_LANG,
    // Same-origin worker: no blob fetch, nothing for the CSP to refuse.
    workerBlobURL: false,
    logger: () => undefined,
  });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        return await withTimeout(createWorker(true), 20000, "Card reader");
      } catch (error) {
        console.warn("Local card reader unavailable, falling back to CDN:", (error as Error)?.message);
        return await withTimeout(createWorker(false), 20000, "Card reader");
      }
    })();
  }

  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null; // a later attempt may succeed
    throw error;
  }
}

export async function recognizeDocument(image: File | Blob | string): Promise<OcrTextResult> {
  const source = typeof image === "string" ? image : URL.createObjectURL(image as Blob);

  try {
    const worker = await getWorker();
    const { data } = await withTimeout(worker.recognize(source), OCR_TIMEOUT_MS, "Card read");

    recognitionCount += 1;
    return {
      text: data.text ?? "",
      confidence: Math.round(data.confidence ?? 0),
    };
  } catch (error) {
    // The worker may be half-built or wedged; drop it so the next document starts
    // from a clean state instead of failing forever.
    workerPromise = null;
    throw error instanceof Error ? error : new Error("Card read failed");
  } finally {
    if (typeof image !== "string") URL.revokeObjectURL(source);
  }
}

export function getOcrRunCount() {
  return recognitionCount;
}
