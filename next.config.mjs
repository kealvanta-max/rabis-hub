/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * Server-side OCR needs something webpack cannot see:
   *
   *   - tesseract.js loads its own worker script by path at runtime, so it is
   *     externalized rather than bundled; a bundled copy finds no worker file.
   *
   * Without this, a bundled copy of tesseract.js cannot find its worker script,
   * `readImageText()` returns null in production, and every card quietly falls
   * back to Rabi — the "nothing is checked" behaviour this change exists to
   * remove.
   *
   * The English model is read from `public/kyc/tesseract/lang`, which
   * `scripts/vendor-kyc-assets.mjs` already ships, so no tracing entry is needed
   * (verified: the tracer does not follow the node_modules copy at all).
   */
  experimental: {
    // Ship smaller client bundles: only the icons/components actually imported
    // are pulled in.
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
    serverComponentsExternalPackages: ["tesseract.js", "tesseract.js-core"],

    /*
     * The face detector is loaded lazily from `node_modules` at request time, and
     * nothing in the import graph tells the bundler to ship it. Without these
     * three lines the deployment builds fine and then finds no model — screening
     * silently reports "unavailable" and every selfie falls through to manual
     * review, which is the exact failure this feature exists to end.
     */
    outputFileTracingIncludes: {
      /*
       * Narrow on purpose: only the two detectors that run, only the Node builds,
       * no source maps, no other models.
       *
       * The first attempt listed whole package directories and came to 194 MB —
       * every browser bundle, every map, and the age/gender/recognition models
       * this never loads. That is wasteful everywhere and close enough to the
       * function limit to be a build failure waiting to happen.
       */
      "/api/upload": [
        "./node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model.bin",
        "./node_modules/@vladmandic/face-api/model/ssd_mobilenetv1_model-weights_manifest.json",
        "./node_modules/@vladmandic/face-api/model/tiny_face_detector_model.bin",
        "./node_modules/@vladmandic/face-api/model/tiny_face_detector_model-weights_manifest.json",
        "./node_modules/@vladmandic/face-api/model/face_landmark_68_model.bin",
        "./node_modules/@vladmandic/face-api/model/face_landmark_68_model-weights_manifest.json",
        "./node_modules/@vladmandic/face-api/dist/face-api.node-wasm.js",
        "./node_modules/@tensorflow/tfjs-core/dist/tf-core.node.js",
        "./node_modules/@tensorflow/tfjs-core/dist/tf-core.node.js.map",
        "./node_modules/@tensorflow/tfjs-backend-wasm/dist/tf-backend-wasm.node.js",
        "./node_modules/@tensorflow/tfjs-backend-cpu/dist/tf-backend-cpu.node.js",
        "./node_modules/@tensorflow/tfjs-converter/dist/tf-converter.node.js",
        "./public/kyc/face/**",
      ],
    },
  },
  // Application console noise is stripped from production builds.
  compiler:
    process.env.NODE_ENV === "production"
      ? { removeConsole: { exclude: ["error", "warn"] } }
      : undefined,

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1536],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
  webpack: (config) => {
    // MediaPipe ships a UMD bundle that webpack flags with a harmless
    // "critical dependency" warning on every compile.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@mediapipe\/tasks-vision/ },
      // TensorFlow.js references optional native bindings this deployment does
      // not and cannot ship; the warnings are expected and harmless.
      { module: /@tensorflow/ },
    ];
    /*
     * `face-api.node-wasm` asks for the wasm backend by name at runtime. Marking
     * it external stops webpack trying to statically resolve a package it only
     * sees inside a `require` behind a try/catch.
     */
    config.externals = config.externals || [];
    if (Array.isArray(config.externals)) {
      config.externals.push(
        "@tensorflow/tfjs-core",
        "@tensorflow/tfjs-backend-wasm",
        "@tensorflow/tfjs-backend-cpu"
      );
    }
    return config;
  },
  async headers() {
    // CSP is emitted per request by middleware so each document gets a fresh
    // nonce. Keep only long-cache/static-resource headers here.
    return [
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/.well-known/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
