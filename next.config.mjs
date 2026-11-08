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
    ];
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
