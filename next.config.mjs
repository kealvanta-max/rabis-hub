/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
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
    const commonSecurityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
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
