import type { FaceDetector } from "@mediapipe/tasks-vision";
import type { FaceCheck } from "@/lib/kyc-verification";

export interface FaceDetectionResult extends FaceCheck {
  isHuman: boolean;
  message: string;
  /** True when the check could not run (network/model failure). */
  skipped?: boolean;
}

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detectorPromise: Promise<FaceDetector> | null = null;
let detectorInstance: FaceDetector | null = null;

async function getDetector(): Promise<FaceDetector> {
  if (detectorInstance) return detectorInstance;
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
      detectorInstance = detector;
      return detector;
    })();
  }
  try {
    return await detectorPromise;
  } catch (error) {
    detectorPromise = null; // allow a later retry
    throw error;
  }
}

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

/**
 * Detects faces in a photo. Accepts a remote URL, a Blob or a File so the check
 * can run on the *local* file before anything is uploaded.
 */
export async function detectHumanFace(image: string | Blob): Promise<FaceDetectionResult> {
  try {
    const [detector, bitmap] = await withTimeout(
      Promise.all([
        getDetector(),
        (async () => {
          if (typeof image === "string") {
            const response = await fetch(image, { mode: "cors" });
            if (!response.ok) throw new Error(`Image fetch failed (${response.status})`);
            return createImageBitmap(await response.blob());
          }
          return createImageBitmap(image);
        })(),
      ]),
      20000,
      "Face detection"
    );

    const result = detector.detect(bitmap);
    const detections = result.detections ?? [];
    const imageArea = bitmap.width * bitmap.height;

    let areaRatio = 0;
    for (const detection of detections) {
      const box = detection.boundingBox;
      if (!box || !imageArea) continue;
      areaRatio = Math.max(areaRatio, (box.width * box.height) / imageArea);
    }

    const confidence = detections[0]?.categories?.[0]?.score ?? 0;
    bitmap.close?.();

    return {
      isHuman: detections.length > 0,
      faceCount: detections.length,
      areaRatio,
      confidence,
      message:
        detections.length === 0
          ? "No human face detected."
          : `${detections.length} face${detections.length > 1 ? "s" : ""} detected.`,
    };
  } catch (error) {
    console.error("Face detection failed:", error);
    // Technical failure (offline CDN, WebGL unavailable…). Don't block a real
    // signup because of it — flag the photo for manual admin review.
    return {
      isHuman: true,
      faceCount: 0,
      areaRatio: 0,
      confidence: 0,
      skipped: true,
      message:
        "Automatic face check is unavailable right now. Your photo will be reviewed manually by an admin.",
    };
  }
}

/** Snapshot of pixels for the duplicate-image guard (9×8 greyscale). */
export async function fingerprintImage(image: Blob): Promise<{ hash: string; width: number; height: number }> {
  const { differenceHash } = await import("@/lib/kyc-verification");
  const bitmap = await createImageBitmap(image);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    return { hash: "", width, height };
  }
  context.drawImage(bitmap, 0, 0, 9, 8);
  bitmap.close?.();
  const { data } = context.getImageData(0, 0, 9, 8);
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push(Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]));
  }
  return { hash: differenceHash(pixels, 9, 8), width, height };
}
