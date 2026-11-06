/**
 * Copy the on-device KYC models into `public/kyc` before the app is built.
 *
 * The Ghana Card reader (Tesseract) and the human-face check (MediaPipe) used to
 * load their runtimes from `cdn.jsdelivr.net` and `tessdata.projectnaptha.com` at
 * the moment a member picked a photo. Three things were wrong with that:
 *
 * 1. Our own Content-Security-Policy does not allow those origins, so the loads
 *    were blocked on every deployment. Every card went to manual review with
 *    "we could not read the card", and a photo of a dog was accepted for review
 *    because the face model never ran.
 * 2. The MediaPipe runtime was pinned to 0.10.12 while the installed JavaScript
 *    API is 0.10.35. A wasm/API version skew is not something to debug on a
 *    member's phone.
 * 3. A third-party CDN is one blocked route away from switching KYC off for the
 *    whole country.
 *
 * Serving them from our own domain fixes all three: same version, same origin, no
 * external dependency. The CDN stays as a fallback in the client for the rare
 * browser our copies do not fit.
 *
 * The files are generated, not committed. `npm install` and `npm run build` both
 * run this, so Vercel always ships a matching set.
 */

import { copyFile, mkdir, access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "public", "kyc");

/** Files we copy, as [source, destination] pairs relative to the repo root. */
const FILES = [
  // MediaPipe face landmarker runtime. SIMD and non-SIMD builds, because the
  // browser chooses at runtime and a 404 there turns the face check off.
  ["node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js", "mediapipe/vision_wasm_internal.js"],
  ["node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm", "mediapipe/vision_wasm_internal.wasm"],
  ["node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js", "mediapipe/vision_wasm_nosimd_internal.js"],
  ["node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm", "mediapipe/vision_wasm_nosimd_internal.wasm"],

  // Tesseract worker.
  ["node_modules/tesseract.js/dist/worker.min.js", "tesseract/worker.min.js"],

  // Tesseract engine, LSTM build (what we ask for) in both SIMD flavours.
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "tesseract/core/tesseract-core-lstm.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract/core/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm", "tesseract/core/tesseract-core-simd-lstm.wasm"],
  [
    "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "tesseract/core/tesseract-core-simd-lstm.wasm.js",
  ],

  // English model, "best_int" build: 2.9 MB instead of 11 MB and still reads a
  // card number without guessing.
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "tesseract/lang/eng.traineddata.gz"],
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

    const destination = path.join(out, to);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    copied.push(to);
  }

  if (missing.length) {
    // Never fail an install over this: the client falls back to the CDN path.
    console.warn(`[kyc-assets] ${missing.length} file(s) missing, the CDN fallback will be used:`);
    for (const file of missing) console.warn(`  - ${file}`);
  }

  let bytes = 0;
  for (const file of copied) {
    try {
      bytes += (await stat(path.join(out, file))).size;
    } catch {
      /* ignore */
    }
  }

  console.log(
    `[kyc-assets] ${copied.length}/${FILES.length} files ready in public/kyc (${(bytes / 1024 / 1024).toFixed(1)} MB)`
  );
}

main().catch((error) => {
  console.warn("[kyc-assets] skipped:", error?.message ?? error);
});
