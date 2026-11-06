import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { FaceCheck } from "@/lib/kyc-verification";

export interface FaceDetectionResult extends FaceCheck {
  isHuman: boolean;
  message: string;
  /** True when the check could not run (network/model failure). */
  skipped?: boolean;
}

/**
 * Where the MediaPipe runtime comes from.
 *
 * `/kyc/mediapipe` is copied out of the installed package by
 * `scripts/vendor-kyc-assets.mjs`, so the runtime version always matches the
 * JavaScript API and both come from our own domain. It used to be a hard-coded
 * `cdn.jsdelivr.net/...@0.10.12` link while the API was 0.10.35, and our
 * Content-Security-Policy blocked that origin anyway, which is why the face check
 * silently never ran and a photo of a dog reached a human admin.
 */
const LOCAL_WASM = "/kyc/mediapipe";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Full 468-point human face mesh (plus iris) — animals cannot produce it. */
const MIN_HUMAN_LANDMARKS = 468;

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let landmarkerInstance: FaceLandmarker | null = null;

export interface LandmarkerOptions {
  runningMode: "IMAGE" | "VIDEO";
  numFaces: number;
  blendshapes?: boolean;
}

/**
 * Build a landmarker, trying the local runtime first and the CDN second, GPU
 * first and CPU second. Any one of the four can be the one that works on a given
 * phone, and a member should not lose her signup to the wrong guess.
 */
export async function createFaceLandmarker({
  runningMode,
  numFaces,
  blendshapes = true,
}: LandmarkerOptions): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

  const attempts: { wasm: string; delegate: "GPU" | "CPU"; label: string }[] = [
    { wasm: LOCAL_WASM, delegate: "GPU", label: "local/GPU" },
    { wasm: LOCAL_WASM, delegate: "CPU", label: "local/CPU" },
    { wasm: CDN_WASM, delegate: "GPU", label: "cdn/GPU" },
    { wasm: CDN_WASM, delegate: "CPU", label: "cdn/CPU" },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const fileset = await FilesetResolver.forVisionTasks(attempt.wasm);
      return await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: attempt.delegate },
        runningMode,
        numFaces,
        outputFaceBlendshapes: blendshapes,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
      });
    } catch (error) {
      lastError = error;
      console.warn(`Face landmarker unavailable (${attempt.label}):`, (error as Error)?.message ?? error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Face model could not start");
}

async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const landmarker = await createFaceLandmarker({
        runningMode: "IMAGE",
        numFaces: 3,
        blendshapes: true,
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
 * Longest edge handed to the face model.
 *
 * A modern phone photo is 4000 pixels wide. Decoding one of those and feeding it
 * to the WebAssembly landmarker is what made the check fail on real handsets and
 * then fall back to "an admin will review it", which is how a photo of a dog
 * reached the review queue. The model only needs 1024 pixels to find a face, so
 * the image is scaled down first. Smaller, faster, and it stops failing.
 */
const MAX_DETECT_EDGE = 1024;

async function decodeForDetection(image: string | Blob): Promise<ImageBitmap> {
  const source =
    typeof image === "string"
      ? await (async () => {
          const response = await fetch(image, { mode: "cors" });
          if (!response.ok) throw new Error(`Image fetch failed (${response.status})`);
          return response.blob();
        })()
      : image;

  const bitmap = await createImageBitmap(source);
  const longestEdge = Math.max(bitmap.width, bitmap.height);

  if (longestEdge <= MAX_DETECT_EDGE) return bitmap;

  try {
    const scale = MAX_DETECT_EDGE / longestEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return bitmap;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // Build the small copy BEFORE releasing the original. If this browser cannot
    // turn a canvas into a bitmap, the full-size original is still usable, and
    // returning a closed bitmap would throw for no reason.
    const scaled = await createImageBitmap(canvas);
    bitmap.close?.();
    return scaled;
  } catch {
    // Downscaling is an optimisation, never a reason to fail the check.
    return bitmap;
  }
}

/**
 * Human-face gate for the KYC selfie.
 *
 * A plain face *detector* also fires on dogs, cats and mascots (a Labrador once
 * passed verification). The FaceLandmarker only produces a 468-point human mesh
 * for a real human face, so an animal fails the landmark test outright.
 *
 * Two rules make it hold up in the field:
 *
 * 1. the photo is downscaled before it reaches the model, so a big phone camera
 *    cannot make the check run out of memory;
 * 2. a failure is retried once with a freshly built landmarker, because the GPU
 *    delegate sometimes refuses the first context on mid-range Android.
 *
 * If it still cannot run, the result is `isHuman: false`. The caller treats that
 * as "not provable", which blocks the photo. It is never "probably fine".
 */
export async function detectHumanFace(image: string | Blob): Promise<FaceDetectionResult> {
  let bitmap: ImageBitmap | null = null;
  try {
    const [landmarker, decoded] = await withTimeout(
      Promise.all([getLandmarker(), decodeForDetection(image)]),
      25000,
      "Face check"
    );

    bitmap = decoded;
    let result;
    try {
      result = landmarker.detect(bitmap);
    } catch (firstError) {
      // A dead GPU context throws once and works after a rebuild. Retry before
      // giving up on the photo.
      console.warn("Face check failed once, rebuilding the model:", (firstError as Error)?.message);
      landmarkerInstance = null;
      landmarkerPromise = null;
      const retry = await withTimeout(getLandmarker(), 20000, "Face check retry");
      result = retry.detect(bitmap);
    }
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
    // A phone that cannot run the model is a known condition, not a bug, and it
    // must not look like an error in the console.
    console.warn("Face check could not run:", (error as Error)?.message ?? error);
    /*
     * Fail CLOSED.
     *
     * This used to return isHuman: true with a note that an admin would review
     * the photo, and that single line is how a dog reached the review queue: the
     * check could not run, so the photo was accepted. An unprovable photo is not
     * an acceptable photo. The member is asked to try again, and a real face
     * passes on the second attempt now that the image is downscaled.
     */
    return {
      isHuman: false,
      faceCount: 0,
      areaRatio: 0,
      confidence: 0,
      skipped: true,
      message:
        "We could not confirm a face in that photo. Move somewhere brighter, check your connection and take the selfie again.",
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
