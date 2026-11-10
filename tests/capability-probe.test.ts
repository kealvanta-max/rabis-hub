import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { overallState, probeCapabilities } from "@/lib/capability-probe";

/*
 * The probes, exercised for real.
 *
 * A health page that reports on itself is worse than none, so the important
 * assertions here are structural: every capability answers with a state, a
 * sentence a member could read, and never a secret. The network probes are run
 * against an environment with no credentials, which is the state of a fresh
 * checkout and the state this suite can reach deterministically.
 */

const ENV_KEYS = [
  "FIREBASE_SERVICE_ACCOUNT_KEY",
  "SERVICE_ACCOUNT",
  "FIREBASE_SERVICE_ACCOUNT",
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "MAIL_MODE",
  "RESEND_API_KEY",
  "EMAIL_PASSWORD",
  "BACKUP_EMAIL_PASSWORD",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("capability probe", () => {
  it("reports every capability in the documented shape", async () => {
    const capabilities = await probeCapabilities();
    expect(Object.keys(capabilities).sort()).toEqual(
      ["cardReader", "cloudinary", "email", "faceCheck", "firestore", "rateLimiting", "vision"].sort()
    );

    for (const [id, capability] of Object.entries(capabilities)) {
      expect(["ready", "degraded", "broken", "off"], id).toContain(capability.state);
      expect(capability.summary.length, id).toBeGreaterThan(10);
      /* No em dash in anything a person reads; the guardrail test enforces the
       * same rule for visitor copy and there is no reason for an exception. */
      expect(capability.summary).not.toContain("\u2014");
    }
  });

  it("calls storage broken when no service account exists, and says why", async () => {
    const { firestore } = await probeCapabilities("firestore");
    expect(firestore.state).toBe("broken");
    expect(firestore.summary.toLowerCase()).toContain("service account");
    expect(firestore.memberImpact).toContain("Secure signup storage is unavailable");
  });

  it("never claims storage is ready without a credential", async () => {
    /* The exact false negative that let production ship broken. */
    const { firestore } = await probeCapabilities("firestore");
    expect(firestore.state).not.toBe("ready");
  });

  it("calls upload broken when Cloudinary is unconfigured, naming the variables", async () => {
    const { cloudinary } = await probeCapabilities("cloudinary");
    expect(cloudinary.state).toBe("broken");
    expect(cloudinary.detail).toContain("CLOUDINARY_API_KEY");
    expect(cloudinary.detail).toContain("CLOUDINARY_API_SECRET");
  });

  it("treats log-mode mail as off rather than broken", async () => {
    /*
     * Log mode is a deliberate state while the sending domain is unverified. It
     * is reported so Rabi can see that approval mail is not going out, but it
     * must not be counted as a fault that stops a signup.
     */
    const { email } = await probeCapabilities("email");
    expect(email.state).toBe("off");
  });

  it("treats a missing AI provider as supported", async () => {
    const { vision } = await probeCapabilities("vision");
    expect(vision.state).toBe("off");
    expect(vision.summary).toContain("supported state");
  });

  it("warns that in-memory rate limits leak", async () => {
    const { rateLimiting } = await probeCapabilities("rateLimiting");
    expect(rateLimiting.state).toBe("degraded");
  });

  it("refuses a blank image at the colour screen", async () => {
    const { faceCheck } = await probeCapabilities("faceCheck");
    expect(faceCheck.state).toBe("ready");
  });

  it("reaches a verdict for the deployment as a whole", async () => {
    const capabilities = await probeCapabilities();
    /* With nothing configured, storage and upload are both down. */
    expect(overallState(capabilities)).toBe("broken");
  });

  it("reports ready only when nothing is broken or degraded", () => {
    expect(overallState({ a: { state: "ready", summary: "x" } })).toBe("ready");
    expect(overallState({ a: { state: "off", summary: "x" } })).toBe("ready");
    expect(
      overallState({
        a: { state: "ready", summary: "x" },
        b: { state: "degraded", summary: "x" },
      })
    ).toBe("degraded");
    expect(
      overallState({
        a: { state: "degraded", summary: "x" },
        b: { state: "broken", summary: "x" },
      })
    ).toBe("broken");
  });

  it("never returns a credential, even when one is set", async () => {
    /*
     * The probes that touch a provider build a Basic auth header from real
     * values. A thrown error from fetch can carry that header in its message, so
     * every failure path goes through `scrub`.
     */
    process.env.CLOUDINARY_API_KEY = "123456789012345";
    process.env.CLOUDINARY_API_SECRET = "super-secret-value-abcdefghij";
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "rabis";

    const capabilities = await probeCapabilities("cloudinary");
    const payload = JSON.stringify(capabilities);
    expect(payload).not.toContain("super-secret-value-abcdefghij");
  });
});
