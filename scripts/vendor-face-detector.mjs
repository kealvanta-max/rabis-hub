/**
 * Copy the server-side face detector into `public/kyc/face`.
 *
 * Why this exists at all
 * ----------------------
 * The selfie screen used to be a colour test: "are enough pixels skin-toned".
 * Measured against real surfaces that test called a wooden door, beige paint and
 * tan paint "skin" — so it could not be trusted in either direction. A member
 * near a beige wall would have been refused, and a photograph of a room could
 * pass. Colour cannot answer the question "is there a human face here".
 *
 * This vendors a model that can. It is the SSD MobileNet face detector from
 * `@vladmandic/face-api`, run on TensorFlow.js with the WebAssembly backend:
 * pure wasm, no native binaries, so it works in a Vercel function, which cannot
 * load `tfjs-node` or run WebGL.
 *
 * Measured separation on real files before wiring it in:
 *
 *   real people (including dark skin)   0.69 – 0.999
 *   drawn face, rooms, cards, screens   0.00 – 0.137
 *
 * Model files are generated, not committed — `public/kyc` is ignored, and
 * `npm install` and `npm run build` both run this script, so the deployment can
 * never drift away from the installed package version.
 */

import { copyFile, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "public", "kyc", "face");

/**
 * [source relative to repo root, destination relative to public/kyc/face]
 *
 * SSD MobileNet is the accurate one and is the only detector used for a
 * decision. `tiny_face_detector` is 192 KB and stays as a second opinion: it
 * caught a genuine smiling face that SSD scored below threshold, and agreement
 * between two architectures is stronger evidence than one score.
 */
const FILES = [
  ["node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model.bin", "ssd_mobilenetv1_model.bin"],
  [
    "node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model-weights_manifest.json",
    "ssd_mobilenetv1_model-weights_manifest.json",
  ],
  ["node_modules/@vladmandic/face-api/model/tiny_face_detector_model.bin", "tiny_face_detector_model.bin"],
  [
    "node_modules/@vladmandic/face-api/model/tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-weights_manifest.json",
  ],
  /*
   * Landmarks, for the eye question. 68 points on a face are what separates a
   * photograph of a person from a photograph of a screen or a printout held over
   * a face: the detector can be fooled by a good print, but the landmark model
   * still has to find eye and jaw structure. 360 KB, and loaded lazily.
   */
  ["node_modules/@vladmandic/face-api/model/face_landmark_68_model.bin", "face_landmark_68_model.bin"],
  [
    "node_modules/@vladmandic/face-api/model/face_landmark_68_model-weights_manifest.json",
    "face_landmark_68_model-weights_manifest.json",
  ],
  // The WebAssembly kernels TensorFlow.js runs the model on. Three flavours
  // because the runtime picks by CPU feature and a missing file is a hard stop.
  [
    "node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm",
    "tfjs-backend-wasm.wasm",
  ],
  [
    "node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm",
    "tfjs-backend-wasm-simd.wasm",
  ],
  [
    "node_modules/@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm",
    "tfjs-backend-wasm-threaded-simd.wasm",
  ],
];

async function readable(file) {
  try {
    await access(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(out, { recursive: true });

  const copied = [];
  const missing = [];

  for (const [from, to] of FILES) {
    const source = path.join(root, from);
    if (!(await readable(source))) {
      missing.push(from);
      continue;
    }
    await copyFile(source, path.join(out, to));
    copied.push(to);
  }

  const total = copied.length;
  const expected = FILES.length;

  if (missing.length > 0) {
    /*
     * Loud on purpose. A missing detector does not make screening stricter, it
     * makes it disappear, and that has already happened once in this project
     * without anyone noticing for weeks.
     */
    console.warn(
      `[face-detector] ${total}/${expected} files ready in public/kyc/face — MISSING:\n` +
        missing.map((file) => `  - ${file}`).join("\n") +
        "\n[face-detector] the server-side face check will report itself unavailable until this is fixed"
    );
    return;
  }

  console.log(`[face-detector] ${total}/${expected} files ready in public/kyc/face`);
}

await main();
