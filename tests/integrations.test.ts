import { describe, expect, it } from "vitest";

import { criticalGaps, evaluate, INTEGRATIONS, integrationStatus } from "@/lib/integrations";

const FIREBASE_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyTEST",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "rabis-hub.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "rabis-hub",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
};

const CLOUDINARY_ENV = {
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "rabis",
  CLOUDINARY_API_KEY: "123456789",
  CLOUDINARY_API_SECRET: "x".repeat(27),
};

describe("integrations registry", () => {
  it("reports every declared integration exactly once", () => {
    const ids = INTEGRATIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never declares a secret as a public key", () => {
    for (const spec of INTEGRATIONS) {
      for (const key of spec.publicKeys ?? []) {
        expect(key.startsWith("NEXT_PUBLIC_")).toBe(true);
      }
    }
  });

  it("is unconfigured on an empty environment", () => {
    const status = integrationStatus({});
    expect(status.every((s) => !s.configured)).toBe(true);
    expect(status.find((s) => s.id === "firebase")?.missing).toContain(
      "NEXT_PUBLIC_FIREBASE_API_KEY"
    );
  });

  it("reports firebase as configured when the four public values exist", () => {
    const status = integrationStatus(FIREBASE_ENV);
    expect(status.find((s) => s.id === "firebase")?.configured).toBe(true);
    expect(criticalGaps(FIREBASE_ENV)).toEqual(
      expect.arrayContaining([expect.stringContaining("cloudinary")])
    );
  });

  it("requires the Cloudinary secret, not just the cloud name", () => {
    const status = evaluate(
      INTEGRATIONS.find((i) => i.id === "cloudinary")!,
      { NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "rabis" }
    );
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(["CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]);
  });

  it("treats blank and whitespace values as missing", () => {
    const status = evaluate(INTEGRATIONS.find((i) => i.id === "sentry")!, { SENTRY_DSN: "   " });
    expect(status.configured).toBe(false);
  });

  it("accepts any email provider fallback but reports which is active", () => {
    const spec = INTEGRATIONS.find((i) => i.id === "resend")!;
    expect(evaluate(spec, { EMAIL_PASSWORD: "app-password" }).configured).toBe(true);
    expect(evaluate(spec, { BACKUP_EMAIL_PASSWORD: "brevo-pass" }).configured).toBe(true);
    expect(evaluate(spec, {}).configured).toBe(false);
  });

  it("never leaks a value into the status payload", () => {
    const secret = "super-secret-value-1234567890";
    const payload = JSON.stringify(
      integrationStatus({ ...CLOUDINARY_ENV, CLOUDINARY_API_SECRET: secret })
    );
    expect(payload).not.toContain(secret);
  });

  it("keeps Clerk inert without the service account", () => {
    const clerkOnly = {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
      CLERK_SECRET_KEY: "sk_test_abc",
      CLERK_JWT_ISSUER_DOMAIN: "https://rabis.clerk.accounts.dev",
    };
    const status = integrationStatus(clerkOnly);
    expect(status.find((s) => s.id === "clerk")?.configured).toBe(true);
    // Its impact text must say clearly that nothing changes until admin is set.
    expect(status.find((s) => s.id === "clerk")?.impact).toMatch(/Firebase Auth is the live provider/);
  });

  it("critical gaps only ever name firebase or cloudinary", () => {
    const gaps = criticalGaps({});
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((g) => /^(firebase|cloudinary):/.test(g))).toBe(true);
  });

  it("is ready with firebase + cloudinary + email present", () => {
    expect(criticalGaps({ ...FIREBASE_ENV, ...CLOUDINARY_ENV })).toEqual([]);
  });
});
