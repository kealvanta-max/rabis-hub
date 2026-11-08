import { NextRequest, NextResponse } from "next/server";

/**
 * Per-request security headers.
 *
 * This file lives in `src/` on purpose. Next.js only compiles a middleware that
 * sits at the project root *or* inside the configured source directory. When the
 * app moved to `src/` and this file stayed behind at the repository root, the
 * build silently produced an empty middleware manifest: no CSP, no nonce, no
 * HSTS, no frame protection, no permissions policy. Nothing failed, so nobody
 * noticed, and every consequence was blamed on the features downstream:
 *
 * - the cropper rendered a black frame, because its geometry came from a
 *   nonce-authorized stylesheet and the nonce header was never set;
 * - the login page had no clickjacking protection;
 * - `postMessage` targets and camera/geolocation permissions were unguarded.
 *
 * `tests/security-guardrails.test.ts` now asserts the file is compiled into the
 * build, so this cannot silently regress again.
 */

/** Headers that never change per request. */
const STATIC_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "X-DNS-Prefetch-Control": "off",
};

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  const directives = [
    "default-src 'self'",
    // Nonce authorizes Next's per-response bootstrap scripts. wasm-unsafe-eval
    // is retained for in-browser model/WASM runtimes; unsafe-eval is dev-only.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""} blob: https://cdn.jsdelivr.net https://*.posthog.com https://apis.google.com`,
    "script-src-attr 'none'",
    /*
     * Inline style ATTRIBUTES stay blocked: the app never needs them, because
     * components that animate publish CSS custom properties through the DOM
     * (see `src/components/ui/css-vars.tsx`) instead of a `style` attribute.
     * Inline style ELEMENTS are allowed only with the per-request nonce.
     */
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'none'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://i.pravatar.cc https://firebasestorage.googleapis.com https://tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "media-src 'self' blob: https://res.cloudinary.com https://firebasestorage.googleapis.com",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "child-src 'self' blob: https://cdn.jsdelivr.net",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com https://*.google.com",
    "connect-src 'self' https://apis.google.com https://firebasestorage.googleapis.com https://tessdata.projectnaptha.com https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://api.cloudinary.com https://res.cloudinary.com https://storage.googleapis.com https://cdn.jsdelivr.net https://*.posthog.com https://*.ingest.sentry.io https://nominatim.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...Array.from(bytes)));
}

export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the request CSP to attach this nonce to its generated scripts.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of Object.entries(STATIC_HEADERS)) {
    response.headers.set(key, value);
  }

  const isAdminArea = request.nextUrl.pathname.startsWith("/admin");
  response.headers.set("X-Frame-Options", isAdminArea ? "DENY" : "SAMEORIGIN");

  /*
   * KYC evidence and session data must never sit in a shared cache. API routes
   * and authenticated pages answer with `private, no-store` so a proxy or a
   * shared browser cannot replay somebody else's documents or decisions.
   */
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || path.startsWith("/admin") || path.startsWith("/dashboard") || path.startsWith("/auth")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }

  return response;
}

export const config = {
  // Everything except hashed build assets, images and static metadata files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|manifest.json|brand_logo|images/|kyc/).*)"],
};
