import type { FaceDetector } from "@mediapipe/tasks-vision";

export interface FaceDetectionResult {
  isHuman: boolean;
  confidence: number;
  message: string;
  /** True when the check could not run (network/model failure) and the image was accepted for manual review. */
  skipped?: boolean;
}

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detectorPromise: Promise<FaceDetector> | null = null;
let detectorInstance: FaceDetector | null = null;

/**
 * Lazily creates a MediaPipe face detector.
 *
 * We reuse the same MediaPipe runtime that powers the liveness scan
 * (face-scan.tsx) instead of pulling in a second, unmaintained face library.
 */
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

export async function detectHumanFace(imageUrl: string): Promise<FaceDetectionResult> {
  try {
    const [detector, bitmap] = await withTimeout(
      Promise.all([
        getDetector(),
        (async () => {
          const response = await fetch(imageUrl, { mode: "cors" });
          if (!response.ok) throw new Error(`Image fetch failed (${response.status})`);
          return createImageBitmap(await response.blob());
        })(),
      ]),
      20000,
      "Face detection"
    );

    const result = detector.detect(bitmap);
    bitmap.close?.();

    const best = result.detections?.[0];
    const confidence = best?.categories?.[0]?.score ?? 0;

    if (best) {
      return {
        isHuman: true,
        confidence: Math.round(confidence * 100),
        message: "Human face detected.",
      };
    }

    return {
      isHuman: false,
      confidence: 0,
      message:
        "No human face detected. Please upload a clear photo of your face (head and shoulders, good lighting).",
    };
  } catch (error) {
    console.error("Face detection failed:", error);
    // Technical failure (offline CDN, CORS, WebGL unavailable…). Don't block a
    // real signup because of it — flag the photo for manual admin review.
    return {
      isHuman: true,
      confidence: 0,
      skipped: true,
      message:
        "Automatic face check is unavailable right now. Your photo will be reviewed manually by an admin.",
    };
  }
}
