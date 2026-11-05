import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { FaceCheck } from "@/lib/kyc-verification";

export interface FaceDetectionResult extends FaceCheck {
  isHuman: boolean;
  message: string;
  /** True when the check could not run (network/model failure). */
  skipped?: boolean;
}

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Full 468-point human face mesh (plus iris) — animals cannot produce it. */
const MIN_HUMAN_LANDMARKS = 468;

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let landmarkerInstance: FaceLandmarker | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        numFaces: 3,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
      });
      landmarkerInstance = landmarker;
      return landmarker;
    })();
  }
  try {
    return await landmarkerPromise;
  } catch (error) {
    landmarkerPromise = null; // allow a later retry
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

interface Landmark {
  x: number;
  y: number;
}

/** Normalised bounding box of one face mesh, as a fraction of the photo. */
function meshAreaRatio(landmarks: Landmark[]): number {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

/**
 * Human-face gate for the KYC selfie.
 *
 * A plain face *detector* also fires on dogs, cats and mascots (a Labrador once
 * passed verification). The FaceLandmarker only produces a 468-point human mesh
 * for a real human face, so an animal now fails this check.
 */
export async function detectHumanFace(image: string | Blob): Promise<FaceDetectionResult> {
  let bitmap: ImageBitmap | null = null;
  try {
    const [landmarker, decoded] = await withTimeout(
      Promise.all([
        getLandmarker(),
        (async () => {
          if (typeof image === "string") {
            const response = await fetch(image, { mode: "cors" });
            if (!response.ok) throw new Error(`Image fetch failed (${response.status})`);
            return createImageBitmap(await response.blob());
          }
          return createImageBitmap(image);
        })(),
      ]),
      25000,
      "Face check"
    );

    bitmap = decoded;
    const result = landmarker.detect(bitmap);
    const meshes = (result.faceLandmarks ?? []).filter(
      (landmarks) => (landmarks?.length ?? 0) >= MIN_HUMAN_LANDMARKS
    );

    const areaRatio = meshes.reduce((best, mesh) => Math.max(best, meshAreaRatio(mesh)), 0);
    const faceCount = meshes.length;

    return {
      isHuman: faceCount > 0,
      faceCount,
      areaRatio,
      confidence: faceCount > 0 ? 0.95 : 0,
      message:
        faceCount === 0
          ? "No human face detected in that photo."
          : faceCount > 1
          ? `${faceCount} faces detected, a selfie must show only you.`
          : "Human face detected.",
    };
  } catch (error) {
    console.error("Face check failed:", error);
    // Technical failure (offline CDN, WebGL unavailable…). Don't block a real
    // signup because of it — flag the photo for manual admin review instead.
    return {
      isHuman: true,
      faceCount: 0,
      areaRatio: 0,
      confidence: 0,
      skipped: true,
      message:
        "The automatic face check could not run on this connection. Rabi will review your photo manually.",
    };
  } finally {
    bitmap?.close?.();
  }
}

/** Snapshot of pixels for the duplicate-image guard (9×8 greyscale). */
export async function fingerprintImage(
  image: Blob
): Promise<{ hash: string; width: number; height: number; brightness: number; contrast: number }> {
  const { differenceHash } = await import("@/lib/kyc-verification");
  const bitmap = await createImageBitmap(image);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    return { hash: "", width, height, brightness: 128, contrast: 52 };
  }
  context.drawImage(bitmap, 0, 0, 9, 8);
  bitmap.close?.();
  const { data } = context.getImageData(0, 0, 9, 8);
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push(Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]));
  }
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const variance =
    pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length;

  return {
    hash: differenceHash(pixels, 9, 8),
    width,
    height,
    brightness: Math.round(mean),
    contrast: Math.round(Math.sqrt(variance)),
  };
}
