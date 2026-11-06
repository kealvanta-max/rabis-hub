import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Security regression fences.
 *
 * Each test pins a fix for a real vulnerability that existed in this codebase.
 * If someone "simplifies" the code and re-opens one of them, CI fails before the
 * change can reach production.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Every file under a directory, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(relative));
    else out.push(relative);
  }
  return out;
}


describe("email relay", () => {
  it("requires a verified ID token before sending", () => {
    const route = read("src/app/api/email/route.ts");
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain('{ status: 401 }');
  });

  it("enforces the recipient policy", () => {
    const route = read("src/app/api/email/route.ts");
    expect(route).toContain("canSendTo(actor, to)");
    expect(route).toContain('{ status: 403 }');
  });

  it("strips active content from member-authored mail", () => {
    const route = read("src/app/api/email/route.ts");
    expect(route).toContain("stripActiveContent");
    expect(route).toContain("javascript:");
  });

  it("sends the bearer token from the client", () => {
    const client = read("src/lib/notify-client.ts");
    expect(client).toContain("getIdToken()");
    expect(client).toContain("Authorization: `Bearer ${token}`");
  });

  it("keeps one send path, and it logs instead of sending until the domain exists", () => {
    // Two independent provider ladders is how the old relay and the old
    // browser templates drifted apart. Everything now goes through sendMail.
    const mailer = read("src/lib/mailer.ts");
    expect(mailer).toContain("MAIL_MODE");
    expect(mailer).toContain("LOG MODE, NOT SENT");
    expect(read("src/app/api/email/route.ts")).toContain("sendMail(");
  });

  it("no longer builds member email in the browser", () => {
    // The templates that fired from an admin tab and swallowed every error.
    expect(() => read("src/lib/notifications.ts")).toThrow();
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
    expect(route).toContain("createHash");
    expect(route).toContain("signature");
    // Identity is still checked when a token is present, but signup uploads
    // happen before the account exists, so it cannot be a hard requirement.
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain("upload:v2:ip:");
  });

  it("caps size and decides the file type from its bytes", () => {
    const route = read("src/app/api/upload/route.ts");
    expect(route).toContain("MAX_UPLOAD_BYTES");
    expect(route).toContain("sniffFileKind");
    expect(route).toContain("413");
    expect(route).toContain("415");
    expect(route).not.toContain("upload_preset =");
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

describe("copy guardrails", () => {
  const UI_GLOB = ["src/app", "src/components", "src/lib"];

  it("never shows an em dash to a visitor", () => {
    // Rabi reads these strings as signals that a machine wrote them.
    const offenders: string[] = [];

    for (const root of UI_GLOB) {
      for (const file of walk(root)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        for (const line of read(file).split("\n")) {
          const trimmed = line.trimStart();
          // Comments are invisible to visitors, so they are allowed to keep one.
          if (/^(https?:\/\/)?\//.test(trimmed) || trimmed.startsWith("*") || trimmed.startsWith("{/*")) continue;
          if (line.includes("—")) offenders.push(file);
        }
      }
    }

    expect(Array.from(new Set(offenders))).toEqual([]);
  });

  it("keeps Advance Susu out of the product", () => {
    const sources = walk("src").filter((file) => /\.(ts|tsx)$/.test(file));
    const hits = sources.filter((file) => /advanceRequests|Advance Susu|advanceLimit/.test(read(file)));
    expect(hits).toEqual([]);
  });

  it("sends operators straight to the admin dashboard", () => {
    const dashboard = read("src/app/dashboard/page.tsx");
    expect(dashboard).toContain('router.replace("/admin")');
    expect(dashboard).not.toContain("This is the owner account");
  });
});
