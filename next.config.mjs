/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Ship smaller client bundles: only the icons/components actually imported
  // are pulled in, and application console noise is stripped from production.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
  },
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
