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
    /*
     * Content Security Policy.
     *
     * Permissive exactly where the stack genuinely needs it — `unsafe-inline`
     * for Next hydration, `wasm-unsafe-eval` + `blob:` workers for the on-device
     * MediaPipe / Tesseract models — but the page is still pinned to a known set
     * of origins, so injected script cannot exfiltrate a member's data to an
     * attacker's server.
     *
     * `frame-ancestors` allows the hosting preview domain (the app is embedded
     * there during review) while blocking every other site from framing it.
     */
    const csp = [
      "default-src 'self'",
      // `cdn.jsdelivr.net` is the fallback home of the on-device KYC runtimes. The
      // primary copy is same-origin under /kyc (see scripts/vendor-kyc-assets.mjs),
      // but a phone whose browser refused that copy must still be able to read a
      // card, and blocking the fallback turned KYC off for the whole country.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://*.posthog.com",
      "worker-src 'self' blob: https://cdn.jsdelivr.net",
      "child-src 'self' blob: https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://tile.openstreetmap.org https://*.basemaps.cartocdn.com",
      "font-src 'self' data:",
      "media-src 'self' blob: https://res.cloudinary.com",
      // Google sign-in popups and the Firebase auth handler frame.
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
      "connect-src 'self' https://tessdata.projectnaptha.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://api.cloudinary.com https://res.cloudinary.com https://storage.googleapis.com https://cdn.jsdelivr.net https://*.posthog.com https://*.ingest.sentry.io https://nominatim.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com",
      "frame-ancestors 'self' https://*.e2b.app",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    const commonSecurityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), magnetometer=()",
      },
      { key: "Content-Security-Policy", value: csp },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ];

    return [
      {
        // Public site, auth and dashboard pages. Deliberately no X-Frame-Options
        // so the app can be embedded in preview/hosting dashboards.
        source: "/:path*",
        headers: commonSecurityHeaders,
      },
      {
        // Admin panel: clickjacking protection. Framing is limited to the site
        // itself and the hosted preview domain so admins can still review the
        // panel in the preview environment. Remove `https://*.e2b.app` to lock
        // the panel to your own domain only.
        source: "/admin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.e2b.app",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
