import { createSign, generateKeyPairSync } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ClerkTokenError,
  clearJwksCache,
  jwksUrlFor,
  verifyClerkSessionToken,
} from "@/lib/clerk-jwt";

const ISSUER = "https://rabis-hub.clerk.accounts.dev";
const KID = "ins_test_key";

let privateKey: string;
let jwks: { keys: Record<string, unknown>[] };

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signToken(
  payload: Record<string, unknown>,
  opts: { kid?: string; alg?: string; key?: string } = {}
) {
  const header = { alg: opts.alg ?? "RS256", kid: opts.kid ?? KID, typ: "JWT" };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${body}`);
  const signature = signer.sign(opts.key ?? privateKey);
  return `${head}.${body}.${b64url(signature)}`;
}

const fakeFetch = (impl: (url: string) => Response | Promise<Response>) =>
  ((url: string) => Promise.resolve(impl(url))) as unknown as typeof fetch;

const jwksResponse = () =>
  new Response(JSON.stringify(jwks), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const baseClaims = () => ({
  sub: "user_2abc",
  sid: "sess_2xyz",
  iss: ISSUER,
  exp: Math.floor(Date.now() / 1000) + 300,
});

beforeAll(() => {
  const { privateKey: priv, publicKey: pub } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  privateKey = priv.export({ format: "pem", type: "pkcs8" }).toString();
  const jwk = pub.export({ format: "jwk" }) as Record<string, unknown>;
  jwks = { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };
});

beforeEach(() => clearJwksCache());

describe("verifyClerkSessionToken", () => {
  it("accepts a correctly signed token and returns its claims", async () => {
    const token = signToken(baseClaims());
    const claims = await verifyClerkSessionToken(token, {
      issuer: ISSUER,
      fetchImpl: fakeFetch(jwksResponse),
    });
    expect(claims.sub).toBe("user_2abc");
    expect(claims.sid).toBe("sess_2xyz");
  });

  it("derives the JWKS url from the issuer", () => {
    expect(jwksUrlFor("https://x.clerk.accounts.dev/")).toBe(
      "https://x.clerk.accounts.dev/.well-known/jwks.json"
    );
  });

  it("rejects a tampered payload (signature mismatch)", async () => {
    const token = signToken(baseClaims());
    const [h, , s] = token.split(".");
    const forged = b64url(JSON.stringify({ ...baseClaims(), sub: "user_attacker" }));
    await expect(
      verifyClerkSessionToken(`${h}.${forged}.${s}`, {
        issuer: ISSUER,
        fetchImpl: fakeFetch(jwksResponse),
      })
    ).rejects.toMatchObject({ reason: "bad-signature" });
  });

  it("rejects a token signed by a different key", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
      format: "pem",
      type: "pkcs8",
    });
    const token = signToken(baseClaims(), { key: other.toString() });
    await expect(
      verifyClerkSessionToken(token, { issuer: ISSUER, fetchImpl: fakeFetch(jwksResponse) })
    ).rejects.toBeInstanceOf(ClerkTokenError);
  });

  it("rejects an expired token", async () => {
    const token = signToken({ ...baseClaims(), exp: Math.floor(Date.now() / 1000) - 600 });
    await expect(
      verifyClerkSessionToken(token, { issuer: ISSUER, fetchImpl: fakeFetch(jwksResponse) })
    ).rejects.toMatchObject({ reason: "expired" });
  });

  it("honours the clock-skew tolerance", async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const token = signToken({ ...baseClaims(), exp });
    await expect(
      verifyClerkSessionToken(token, {
        issuer: ISSUER,
        fetchImpl: fakeFetch(jwksResponse),
        tolerance: 60,
      })
    ).resolves.toMatchObject({ sub: "user_2abc" });
  });

  it("rejects a token from another issuer", async () => {
    const token = signToken({ ...baseClaims(), iss: "https://evil.example.com" });
    await expect(
      verifyClerkSessionToken(token, { issuer: ISSUER, fetchImpl: fakeFetch(jwksResponse) })
    ).rejects.toMatchObject({ reason: "bad-issuer" });
  });

  it("rejects non-RS256 algorithms (algorithm-confusion defence)", async () => {
    const token = signToken(baseClaims(), { alg: "HS256" });
    await expect(
      verifyClerkSessionToken(token, { issuer: ISSUER, fetchImpl: fakeFetch(jwksResponse) })
    ).rejects.toMatchObject({ reason: "unsupported-alg" });
  });

  it("rejects an unknown key id", async () => {
    const token = signToken(baseClaims(), { kid: "nope" });
    await expect(
      verifyClerkSessionToken(token, { issuer: ISSUER, fetchImpl: fakeFetch(jwksResponse) })
    ).rejects.toMatchObject({ reason: "no-key" });
  });

  it("fails closed when the JWKS endpoint is down", async () => {
    const token = signToken(baseClaims());
    await expect(
      verifyClerkSessionToken(token, {
        issuer: ISSUER,
        fetchImpl: fakeFetch(() => new Response("nope", { status: 503 })),
      })
    ).rejects.toMatchObject({ reason: "jwks-unavailable" });
  });

  it("rejects garbage and empty strings without throwing unexpectedly", async () => {
    for (const bad of ["", "not.a.jwt", "a.b", "...."]) {
      await expect(
        verifyClerkSessionToken(bad, { issuer: ISSUER, fetchImpl: fakeFetch(jwksResponse) })
      ).rejects.toBeInstanceOf(ClerkTokenError);
    }
  });

  it("caches the JWKS across calls", async () => {
    let calls = 0;
    const counting: typeof fetch = (async (url: string) => {
      if (String(url).includes("jwks")) calls += 1;
      return jwksResponse();
    }) as unknown as typeof fetch;

    const token = signToken(baseClaims());
    await verifyClerkSessionToken(token, { issuer: ISSUER, fetchImpl: counting });
    await verifyClerkSessionToken(token, { issuer: ISSUER, fetchImpl: counting });
    expect(calls).toBe(1);
  });
});
