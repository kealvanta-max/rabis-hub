/**
 * Clerk session-token verification, without a dependency.
 *
 * Clerk signs a short-lived session JWT (RS256) with the keys published at
 * `https://<frontend-api>/.well-known/jwks.json`. We verify it with `node:crypto`
 * instead of pulling the Clerk SDK into the server bundle — the SDK is only
 * needed on the client, and this route has to keep working in the Firebase world
 * where Firestore rules still demand a *Firebase* token.
 *
 * Everything here is pure and injectable so it can be tested offline.
 */

import { createPublicKey, verify as cryptoVerify, type JsonWebKey, type KeyObject } from "node:crypto";

export interface ClerkClaims {
  /** Clerk user id (`user_...`). */
  sub: string;
  /** Session id (`sess_...`) when present. */
  sid?: string;
  iss?: string;
  exp?: number;
  nbf?: number;
}

export interface VerifyOptions {
  /** Expected `iss`, e.g. `https://your-app.clerk.accounts.dev`. */
  issuer: string;
  /** Overrides the derived JWKS URL (tests, self-hosted Clerk). */
  jwksUrl?: string;
  fetchImpl?: typeof fetch;
  /** Clock injection for expiry tests. */
  now?: () => number;
  /** Allowed clock skew in seconds. Default 60. */
  tolerance?: number;
}

export class ClerkTokenError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "malformed"
      | "unsupported-alg"
      | "no-key"
      | "bad-signature"
      | "expired"
      | "not-yet-valid"
      | "bad-issuer"
      | "no-subject"
      | "jwks-unavailable"
  ) {
    super(message);
    this.name = "ClerkTokenError";
  }
}

const cache = new Map<string, { keys: JsonWebKey[]; fetchedAt: number }>();
const JWKS_TTL_MS = 10 * 60 * 1000;

function base64UrlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

export function decodeSegment<T>(segment: string): T {
  return JSON.parse(base64UrlToBuffer(segment).toString("utf8")) as T;
}

export function jwksUrlFor(issuer: string): string {
  return `${issuer.replace(/\/+$/, "")}/.well-known/jwks.json`;
}

async function loadKeys(url: string, fetchImpl: typeof fetch, now: number): Promise<JsonWebKey[]> {
  const hit = cache.get(url);
  if (hit && now - hit.fetchedAt < JWKS_TTL_MS) return hit.keys;

  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new ClerkTokenError(`JWKS ${response.status}`, "jwks-unavailable");

  const body = (await response.json()) as { keys?: JsonWebKey[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (keys.length === 0) throw new ClerkTokenError("JWKS empty", "jwks-unavailable");

  cache.set(url, { keys, fetchedAt: now });
  return keys;
}

/** Verify a Clerk session JWT and return its claims. Throws `ClerkTokenError`. */
export async function verifyClerkSessionToken(
  token: string,
  options: VerifyOptions
): Promise<ClerkClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ClerkTokenError("not a JWT", "malformed");

  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: { alg?: string; kid?: string; typ?: string };
  let payload: ClerkClaims;
  try {
    header = decodeSegment(rawHeader);
    payload = decodeSegment<ClerkClaims>(rawPayload);
  } catch {
    throw new ClerkTokenError("undecodable JWT segment", "malformed");
  }

  if (header.alg !== "RS256") {
    throw new ClerkTokenError(`alg ${header.alg ?? "missing"} not allowed`, "unsupported-alg");
  }

  const now = (options.now ?? Date.now)();
  const tolerance = (options.tolerance ?? 60) * 1000;

  const keys = await loadKeys(
    options.jwksUrl ?? jwksUrlFor(options.issuer),
    options.fetchImpl ?? fetch,
    now
  );

  const jwk = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
  if (!jwk) throw new ClerkTokenError("no matching signing key", "no-key");

  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new ClerkTokenError("unusable JWK", "no-key");
  }

  const signed = Buffer.from(`${rawHeader}.${rawPayload}`);
  const valid = cryptoVerify("RSA-SHA256", signed, publicKey, base64UrlToBuffer(rawSignature));
  if (!valid) throw new ClerkTokenError("signature mismatch", "bad-signature");

  if (typeof payload.exp === "number" && now - tolerance > payload.exp * 1000) {
    throw new ClerkTokenError("token expired", "expired");
  }
  if (typeof payload.nbf === "number" && now + tolerance < payload.nbf * 1000) {
    throw new ClerkTokenError("token not yet valid", "not-yet-valid");
  }
  if (payload.iss && payload.iss.replace(/\/+$/, "") !== options.issuer.replace(/\/+$/, "")) {
    throw new ClerkTokenError("issuer mismatch", "bad-issuer");
  }
  if (!payload.sub) throw new ClerkTokenError("no subject", "no-subject");

  return payload;
}

/** Test seam: drop the cached JWKS (never called in production paths). */
export function clearJwksCache() {
  cache.clear();
}
