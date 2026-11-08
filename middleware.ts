import { NextRequest, NextResponse } from "next/server";

function contentSecurityPolicy(nonce: string): string {
  const directives = [
    "default-src 'self'",
    // Nonce authorizes Next's per-response bootstrap scripts. wasm-unsafe-eval
    // is retained for in-browser model/WASM runtimes; unsafe-eval is dev-only.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""} blob: https://cdn.jsdelivr.net https://*.posthog.com https://apis.google.com`,
    "script-src-attr 'none'",
    // Inline style attributes are intentionally blocked. Any UI using React's
    // style prop must be migrated to classes/CSS variables delivered by CSS.
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

export function middleware(request: NextRequest) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(18));
  const nonce = btoa(String.fromCharCode(...Array.from(nonceBytes)));
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the request CSP to attach this nonce to its generated scripts.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", request.nextUrl.pathname.startsWith("/admin") ? "DENY" : "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), magnetometer=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image).*)"],
};
