/**
 * Server-side human-face detection.
 *
 * This is the piece the selfie screen was missing. Everything before it measured
 * *colour*: how much of the frame is skin-toned. Colour cannot distinguish a
 * human face from a beige wall, and it was measured getting both wrong —
 * a wooden door scored "skin", a smiling face in a park scored "not skin".
 *
 * Here the question is answered by a model that was trained to find faces, and
 * it runs on the server, on the original bytes, before any AI provider is
 * consulted and without the member's phone being involved. A photograph of a
 * screen, a printout, a wall or a room produces no detection at all.
 *
 * Runtime choices, and why
 * ------------------------
 * - TensorFlow.js + the **WebAssembly** backend: pure wasm, no native modules.
 *   `tfjs-node` needs platform binaries that do not exist in a serverless
 *   function, and WebGL does not exist there either. WASM is the one that works
 *   in both this sandbox and on Vercel, which is why it can be trusted.
 * - MediaPipe's landmarker, which the browser already uses, needs WebGL and a
 *   DOM; it cannot run here. That is why this is a different model rather than
 *   the same one moved to the server.
 * - Two detectors, different architectures. Agreement is worth more than one
 *   score, and `tiny_face_detector` caught a genuine face that SSD scored below
 *   threshold.
 *
 * Measured separation on real files before this was wired in:
 *
 *   real people, including dark skin   0.69 – 0.999
 *   drawn face, rooms, cards, screens  0.00 – 0.137
 *
 * The threshold sits at 0.42, near the geometric middle, and anything below it
 * is *not* a refusal on its own — see `judgeSelfiePhoto`.
 */

import path from "node:path";

export interface FaceBox {
  /** Fractions of the image, so callers never have to know the pixel size. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetection {
  /** True when at least one detector was confident there is a human face. */
  human: boolean;
  /** Highest score seen, whichever detector produced it. 0 when nothing ran. */
  score: number;
  /** Every detection above the reporting floor, for the admin's screen. */
  boxes: FaceBox[];
  /**
   * "unavailable" is not "no face". When the model cannot run, a caller must
   * fall back to manual review rather than refuse the member.
   */
  status: "detected" | "none" | "unavailable";
  detail?: string;
}

/**
 * Below this the detector is not convinced. Chosen from the measurements above:
 * the lowest genuine face scored 0.69 and the highest non-face 0.137, so 0.42
 * leaves a wide margin on both sides instead of shaving the distribution.
 */
export const FACE_CONFIDENCE_FLOOR = 0.42;

/** Detections we keep for the admin view even when they are not conclusive. */
const REPORT_FLOOR = 0.15;

interface FaceApi {
  nets: {
    ssdMobilenetv1: { loadFromDisk: (dir: string) => Promise<void> };
    tinyFaceDetector: { loadFromDisk: (dir: string) => Promise<void> };
  };
  SsdMobilenetv1Options: new (options: { minConfidence: number }) => unknown;
  TinyFaceDetectorOptions: new (options: {
    inputSize: number;
    scoreThreshold: number;
  }) => unknown;
  detectAllFaces: (
    tensor: unknown,
    options: unknown
  ) => Promise<Array<{ score?: number; box: { x: number; y: number; width: number; height: number } }>>;
}

interface TfApi {
  setBackend: (name: string) => Promise<boolean>;
  ready: () => Promise<void>;
  getBackend: () => string;
  tensor3d: (data: Uint8Array, shape: [number, number, number]) => TfTensor;
  disposeVariables?: () => void;
}

interface TfTensor {
  slice: (begin: number[], size: number[]) => TfTensor;
  dispose: () => void;
}

interface Runtime {
  tf: TfApi;
  api: FaceApi;
}

let runtimePromise: Promise<Runtime> | null = null;

/**
 * Load the models once per process.
 *
 * A cold function pays ~1s for this; every later request reuses it. The promise
 * is cached rather than the result so that two requests arriving together during
 * a cold start do not both initialise TensorFlow and exhaust memory.
 */
async function loadRuntime(modelDir: string): Promise<Runtime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    /*
     * Required, not imported. These are CommonJS packages with optional native
     * bindings, and importing them at module scope makes every route that
     * mentions screening pay for TensorFlow even when it never looks at an
     * image. The comment on each line is the reason it stays this way.
     */
    /*
     * The narrow packages, not the `@tensorflow/tfjs` meta-package.
     *
     * The meta-package re-exports every backend including the WebGL one and the
     * browser bundles, and it adds 140 MB to the deployed function — a quarter of
     * the uncompressed limit for code that is never executed here. Core plus the
     * wasm backend is ~12 MB and is exactly what runs.
     */
    const wasm = require("@tensorflow/tfjs-backend-wasm") as {
      setWasmPaths: (prefix: string) => void;
    };
    require("@tensorflow/tfjs-backend-cpu");
    const tf = require("@tensorflow/tfjs-core") as TfApi;
    const faces = require("@vladmandic/face-api/dist/face-api.node-wasm.js") as FaceApi;

    // The kernels ship in `public/kyc/face` (see scripts/vendor-face-detector.mjs)
    // and are read from disk here rather than fetched over the network: this must
    // work when the deployment has no outbound access, which is exactly when a
    // security check is most needed.
    wasm.setWasmPaths(path.join(process.cwd(), "public", "kyc", "face") + path.sep);

    await tf.setBackend("wasm");
    await tf.ready();

    await faces.nets.ssdMobilenetv1.loadFromDisk(modelDir);
    await faces.nets.tinyFaceDetector.loadFromDisk(modelDir);

    return { tf, api: faces };
  })().catch((error: unknown) => {
    // Do not cache a failure: a transient OOM on a cold start should not disable
    // the check for the life of the instance.
    runtimePromise = null;
    throw error;
  });

  return runtimePromise;
}

/**
 * Detect human faces in an already-decoded raster.
 *
 * `pixels` is RGBA, which is what `jpeg-js` returns, so callers pass the buffer
 * they already have instead of re-fetching anything.
 */
export async function detectFaces(
  pixels: Uint8Array,
  width: number,
  height: number
): Promise<FaceDetection> {
  if (width < 32 || height < 32 || pixels.length < width * height * 4) {
    return { human: false, score: 0, boxes: [], status: "none" };
  }

  const modelDir = path.join(process.cwd(), "node_modules", "@vladmandic", "face-api", "model");

  let runtime: Runtime;
  try {
    runtime = await loadRuntime(modelDir);
  } catch (error) {
    /*
     * A missing model is not a verdict about the member. It is reported as
     * unavailable so the caller sends the photo to Rabi instead of refusing a
     * real person because a file was not copied.
     */
    return {
      human: false,
      score: 0,
      boxes: [],
      status: "unavailable",
      detail: error instanceof Error ? error.message : "face model failed to load",
    };
  }

  const { tf, api } = runtime;

  /*
   * Large phone photos are a waste of wasm cycles at this point: the detector
   * resizes internally anyway, and a 4000px frame costs seconds of CPU to
   * produce the same answer as a 1280px one. Shrinking first keeps a slow phone
   * upload inside the function's time budget.
   */
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const targetWidth = Math.max(32, Math.round(width * scale));
  const targetHeight = Math.max(32, Math.round(height * scale));

  let tensor: TfTensor | null = null;

  try {
    /*
     * Downscale before the model sees it. The detector resizes internally
     * anyway, so a 4000px phone photo would cost seconds of wasm CPU to produce
     * the same answer as a 1280px one, and a slow upload can run out of time.
     */
    let usablePixels = pixels;
    let usableWidth = width;
    let usableHeight = height;
    if (scale < 1) {
      usablePixels = await resampleRgba(pixels, width, height, targetWidth, targetHeight);
      usableWidth = targetWidth;
      usableHeight = targetHeight;
    }

    const rgba = tf.tensor3d(usablePixels, [usableHeight, usableWidth, 4]) as TfTensor;
    // Drop the alpha channel: the detector expects three.
    tensor = rgba.slice([0, 0, 0], [usableHeight, usableWidth, 3]) as TfTensor;
    rgba.dispose();

    const detections = await Promise.all([
      api.detectAllFaces(tensor, new api.SsdMobilenetv1Options({ minConfidence: REPORT_FLOOR })),
      api.detectAllFaces(
        tensor,
        new api.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: REPORT_FLOOR })
      ),
    ]);

    const scored = detections
      .flat()
      .map((detection) => ({
        score: typeof detection.score === "number" ? detection.score : 0,
        box: detection.box,
      }))
      .filter((detection) => detection.score >= REPORT_FLOOR);

    const best = scored.reduce((top, detection) => Math.max(top, detection.score), 0);
    const boxes = scored.map(({ box }) => ({
      x: box.x / usableWidth,
      y: box.y / usableHeight,
      width: box.width / usableWidth,
      height: box.height / usableHeight,
    }));

    return {
      human: best >= FACE_CONFIDENCE_FLOOR,
      score: Number(best.toFixed(3)),
      boxes,
      status: best >= FACE_CONFIDENCE_FLOOR ? "detected" : "none",
    };
  } catch (error) {
    return {
      human: false,
      score: 0,
      boxes: [],
      status: "unavailable",
      detail: error instanceof Error ? error.message : "face detection failed",
    };
  } finally {
    try {
      tensor?.dispose();
    } catch {
      // Disposal after a failed kernel can itself throw; nothing to do about it.
    }
  }
}

/** Box-filter downscale of RGBA pixels. Small images must never be upscaled. */
async function resampleRgba(
  pixels: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number
): Promise<Uint8Array> {
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const xRatio = width / targetWidth;
  const yRatio = height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const yStart = Math.floor(y * yRatio);
    const yEnd = Math.min(height, Math.max(yStart + 1, Math.floor((y + 1) * yRatio)));
    for (let x = 0; x < targetWidth; x += 1) {
      const xStart = Math.floor(x * xRatio);
      const xEnd = Math.min(width, Math.max(xStart + 1, Math.floor((x + 1) * xRatio)));

      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = yStart; sy < yEnd; sy += 1) {
        for (let sx = xStart; sx < xEnd; sx += 1) {
          const at = (sy * width + sx) * 4;
          r += pixels[at];
          g += pixels[at + 1];
          b += pixels[at + 2];
          count += 1;
        }
      }

      const to = (y * targetWidth + x) * 4;
      out[to] = Math.round(r / count);
      out[to + 1] = Math.round(g / count);
      out[to + 2] = Math.round(b / count);
      out[to + 3] = 255;
    }
  }

  return out;
}
