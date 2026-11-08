import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
  const middleware = read("src/middleware.ts");

  it("ships a per-request nonce CSP without unsafe-inline", () => {
    expect(middleware).toContain("crypto.getRandomValues");
    expect(middleware).toContain("nonce-${nonce}");
    expect(middleware).toContain('requestHeaders.set("Content-Security-Policy"');
    expect(middleware).toContain('response.headers.set("Content-Security-Policy"');
    expect(middleware).not.toContain("unsafe-inline");
    expect(middleware).toContain("style-src-attr 'none'");
    expect(config).not.toContain("Content-Security-Policy");
  });

  it("prevents framing and ships the rest of the header baseline", () => {
    expect(middleware).toContain('request.nextUrl.pathname.startsWith("/admin")');
    expect(middleware).toContain('isAdminArea ? "DENY" : "SAMEORIGIN"');
    expect(middleware).toContain("X-Content-Type-Options");
    expect(middleware).toContain("Referrer-Policy");
    expect(middleware).toContain("Permissions-Policy");
    expect(middleware).toContain("Strict-Transport-Security");
    expect(middleware).toContain("object-src 'none'");
    expect(middleware).toContain("base-uri 'self'");
    expect(middleware).not.toContain("https://*.e2b.app");
  });

  it("keeps the framework banner out of responses", () => {
    expect(config).toContain("poweredByHeader: false");
  });

  it("puts the middleware where Next.js actually compiles it", () => {
    /*
     * The expensive bug this pins: `middleware.ts` sat at the repository root
     * while the app lived in `src/`. Next.js compiles middleware from the root
     * OR from `src/`, never from a root file that the `src` directory shadows,
     * and it does so without a warning. The result was an empty
     * `middleware-manifest.json` in production: no CSP, no nonce, no HSTS, no
     * frame protection. The cropper's black preview was the visible symptom.
     */
    expect(existsSync(join(process.cwd(), "src/middleware.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "middleware.ts"))).toBe(false);
    // And the build artefact proves it was compiled, when a build has run.
    const manifestPath = join(process.cwd(), ".next/server/middleware-manifest.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { middleware?: Record<string, unknown> };
      expect(Object.keys(manifest.middleware ?? {}).length).toBeGreaterThan(0);
    }
  });

  it("grants the nonce to style elements but never to style attributes", () => {
    // Inline style elements must carry the per-request nonce (Next needs it and
    // so does any component that legitimately ships one), while attributes stay
    // blocked so a style-injection attack has nowhere to land.
    expect(middleware).toContain("style-src 'self' 'nonce-${nonce}'");
    expect(middleware).toContain("style-src-attr 'none'");
  });

  it("never puts KYC evidence or sessions in a shared cache", () => {
    expect(middleware).toContain('path.startsWith("/api/")');
    expect(middleware).toContain("private, no-store");
  });
});

describe("firestore rules", () => {
  const rules = read("firestore.rules");

  it("authorizes only server-assigned admin claims", () => {
    expect(rules).toContain("request.auth.token.admin == true");
    expect(rules).not.toContain("email_verified == true");
    expect(rules).not.toContain("email.lower() in");
  });

  it("denies client-created member records; server route creates pending records", () => {
    expect(rules).toContain("allow create: if false;");
    expect(read("src/app/api/signup/submit/route.ts")).toContain('status: "pending"');
  });

  it("blocks members from changing their own status", () => {
    expect(rules).toContain("request.resource.data.status == resource.data.status");
  });

  it("routes member creation through the trusted server", () => {
    expect(rules).toContain("allow create: if false;");
    expect(read("src/app/api/signup/submit/route.ts")).toContain("transaction.create(ref");
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
