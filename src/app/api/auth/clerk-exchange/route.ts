import { NextResponse } from "next/server";

import { ClerkTokenError, verifyClerkSessionToken } from "@/lib/clerk-jwt";
import { adminAuth, isAdminConfigured } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clerk → Firebase token exchange.
 *
 * Firestore security rules cannot see a Clerk session: they evaluate
 * `request.auth`, which only a Firebase ID token produces. So instead of
 * replacing auth (and locking every member out of their own data), we let Clerk
 * be the front door and mint a *Firebase custom token* for the verified Clerk
 * user. The browser then calls `signInWithCustomToken`, and every existing rule,
 * admin screen and KYC write keeps working unchanged.
 *
 * Stays inert until `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY` and
 * `FIREBASE_SERVICE_ACCOUNT_KEY` are all present.
 */

const CLERK_API = "https://api.clerk.com/v1";

function bearer(request: Request): string | null {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function clerkEmail(userId: string, secret: string): Promise<string | null> {
  try {
    const response = await fetch(`${CLERK_API}/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = (await response.json()) as {
      email_addresses?: { id: string; email_address: string }[];
      primary_email_address_id?: string;
    };
    const primary = user.email_addresses?.find((e) => e.id === user.primary_email_address_id);
    return primary?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;
  } catch {
    return null; // email is a convenience here, never a reason to fail the exchange
  }
}

export async function POST(request: Request) {
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
  const secret = process.env.CLERK_SECRET_KEY;

  if (!issuer || !secret || !isAdminConfigured()) {
    return NextResponse.json(
      {
        error: "clerk-not-configured",
        hint: "Set CLERK_JWT_ISSUER_DOMAIN, CLERK_SECRET_KEY and FIREBASE_SERVICE_ACCOUNT_KEY. Firebase Auth remains the live provider until then.",
      },
      { status: 501 }
    );
  }

  const limited = await rateLimit(`clerk-exchange:${clientIp(request)}`, 20, 5 * 60_000);
  if (!limited.success) {
    return NextResponse.json(
      { error: "rate-limited", retryAfter: Math.ceil((limited.resetAt - Date.now()) / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limited.resetAt - Date.now()) / 1000)) } }
    );
  }

  const token = bearer(request);
  if (!token) return NextResponse.json({ error: "missing-session-token" }, { status: 401 });

  let claims;
  try {
    claims = await verifyClerkSessionToken(token, { issuer });
  } catch (error) {
    const reason = error instanceof ClerkTokenError ? error.reason : "malformed";
    return NextResponse.json({ error: "invalid-session", reason }, { status: 401 });
  }

  const uid = `clerk_${claims.sub}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const email = await clerkEmail(claims.sub, secret);

  try {
    const auth = adminAuth();
    try {
      await auth.updateUser(uid, email ? { email, emailVerified: true } : {});
    } catch {
      await auth.createUser(email ? { uid, email, emailVerified: true } : { uid });
    }
    const firebaseToken = await auth.createCustomToken(uid, { clerk_id: claims.sub });
    return NextResponse.json({ token: firebaseToken, uid, expiresIn: 3600 });
  } catch {
    // Never leak credential detail to the caller.
    return NextResponse.json({ error: "exchange-failed" }, { status: 500 });
  }
}
