import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Security regression fences.
 *
 * Each test pins a fix for a real vulnerability that existed in this codebase.
 * If someone "simplifies" the code and re-opens one of them, CI fails before the
 * change can reach production.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("email relay", () => {
  it("requires a verified ID token before sending", () => {
    const route = read("src/app/api/email/route.ts");
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain('{ status: 401 }');
  });

  it("enforces the recipient policy", () => {
    const route = read("src/app/api/email/route.ts");
    expect(route).toContain("canSendTo(actor, to, ownerEmails())");
    expect(route).toContain('{ status: 403 }');
  });

  it("strips active content from member-authored mail", () => {
    const route = read("src/app/api/email/route.ts");
    expect(route).toContain("stripActiveContent");
    expect(route).toContain("javascript:");
  });

  it("sends the bearer token from the client", () => {
    const client = read("src/lib/notifications.ts");
    expect(client).toContain("getIdToken()");
    expect(client).toContain("Authorization: `Bearer ${token}`");
  });
});

describe("document uploads", () => {
  it("never posts to Cloudinary directly from the browser", () => {
    const client = read("src/lib/cloudinary.ts");
    expect(client).not.toContain("api.cloudinary.com");
    expect(client).not.toContain("upload_preset");
    expect(client).toContain('fetch("/api/upload"');
  });

  it("signs the upload server-side with the API secret", () => {
    const route = read("src/app/api/upload/route.ts");
    expect(route).toContain("CLOUDINARY_API_SECRET");
    expect(route).toContain("createHmac".replace("createHmac", "createHash"));
    expect(route).toContain("signature");
    expect(route).toContain("authenticateRequest(request)");
  });

  it("caps size and file type", () => {
    const route = read("src/app/api/upload/route.ts");
    expect(route).toContain("MAX_BYTES");
    expect(route).toContain("ALLOWED_TYPES");
    expect(route).toContain("413");
    expect(route).toContain("415");
  });
});

describe("error relay", () => {
  it("caps the request body", () => {
    const route = read("src/app/api/errors/route.ts");
    expect(route).toContain("MAX_BODY_BYTES");
    expect(route).toContain("413");
  });

  it("scrubs personal data before forwarding to Sentry", () => {
    const route = read("src/app/api/errors/route.ts");
    expect(route).toContain("[email]");
    expect(route).toContain("[phone]");
    expect(route).toContain("[token]");
  });
});

describe("transport + browser hardening", () => {
  const config = read("next.config.mjs");

  it("ships a content security policy", () => {
    expect(config).toContain("Content-Security-Policy");
    // Framing is limited to this site and the review preview host, never *.
    expect(config).toContain("frame-ancestors 'self' https://*.e2b.app");
    expect(config).not.toContain("frame-ancestors *");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("base-uri 'self'");
  });

  it("ships the rest of the header baseline", () => {
    expect(config).toContain("Strict-Transport-Security");
    expect(config).toContain("X-Content-Type-Options");
    expect(config).toContain("Referrer-Policy");
    expect(config).toContain("Permissions-Policy");
  });

  it("keeps the framework banner out of responses", () => {
    expect(config).toContain("poweredByHeader: false");
  });
});

describe("firestore rules", () => {
  const rules = read("firestore.rules");

  it("only honours verified owner addresses", () => {
    expect(rules).toContain("email_verified == true");
  });

  it("forces new members to stay pending", () => {
    expect(rules).toMatch(/request\.resource\.data\.status == 'pending'/);
  });

  it("blocks members from changing their own status", () => {
    expect(rules).toContain("request.resource.data.status == resource.data.status");
  });

  it("validates required profile fields on create", () => {
    expect(rules).toContain("hasAll(['name', 'email', 'phone', 'plan', 'status'])");
  });
});
