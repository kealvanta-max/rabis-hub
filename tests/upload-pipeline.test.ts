import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Behaviour that only shows up in production, pinned so a future refactor cannot
 * quietly reintroduce the two bugs that cost Rabi a week: a signup upload that
 * demanded a login the member did not yet have, and a rate limit that punished
 * her for retrying a broken credential.
 */
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("upload route", () => {
  const route = read("src/app/api/upload/route.ts");

  it("never demands a token, because signup uploads precede the account", () => {
    expect(route).toContain("authenticateRequest(request)");
    expect(route).not.toMatch(/if \(!actor\)\s*\{?\s*return NextResponse\.json\(\{ error: "Sign in required" \}/);
    expect(route).toContain("upload:ip:");
  });

  it("budgets enough attempts that retrying a broken key cannot lock a member out", () => {
    const anon = route.match(/upload:ip:\$\{clientIp\(request\)\}`,\s*(\d+)/);
    expect(anon).not.toBeNull();
    expect(Number(anon?.[1])).toBeGreaterThanOrEqual(1000);
  });

  it("counts the phone, not only the carrier NAT address it shares", () => {
    const device = route.match(/upload:dev:\$\{device\}`,\s*(\d+),\s*(\d+)/);
    expect(device).not.toBeNull();
    // A whole signup is four uploads, so sixty an hour is retries and nothing else.
    expect(Number(device?.[1])).toBeGreaterThanOrEqual(40);
    expect(route).toContain("x-rabis-device");
  });

  it("never blocks the first upload of a member on a shared address", () => {
    // No hard wall may exist below a full signup plus retries.
    const pattern = /rateLimit\(`upload:[^`]+`,\s*(\d+)/g;
    const numbers: number[] = [];
    let found = pattern.exec(route);
    while (found) {
      numbers.push(Number(found[1]));
      found = pattern.exec(route);
    }
    expect(numbers.length).toBeGreaterThan(0);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(40);
    expect(route).toContain("Retry-After");
  });

  it("signs only the parameters it sends, and sends no upload transformation", () => {
    expect(route).toContain("createHash");
    expect(route).toContain("signature");
    expect(route).not.toContain('params.transformation');
  });
});

describe("storage self-test", () => {
  const route = read("src/app/api/upload/diagnose/route.ts");

  it("is restricted to an owner account", () => {
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain("ADMIN_EMAILS");
    expect(route).toContain("403");
  });

  it("reports names and verdicts, never values", () => {
    expect(route).toContain("hasApiSecret");
    expect(route).toContain("apiSecretLength");
    expect(route).not.toMatch(/secret:\s*apiSecret/);
    expect(route).not.toMatch(/apiSecret\s*[:,]/);
  });

  it("proves both endpoints members upload to, not just photos", () => {
    expect(route).toContain('probe("image"');
    expect(route).toContain('probe("video"');
    expect(route).toContain("/${endpoint}/upload");
    expect(route).toContain("AUTH_FAILURE");
  });
});

describe("the browser tells the limiter who it is", () => {
  const client = read("src/lib/cloudinary.ts");
  const device = read("src/lib/device-id.ts");

  it("sends a device id with every upload", () => {
    expect(client).toContain("getDeviceId()");
    expect(client).toContain("x-rabis-device");
  });

  it("keeps the id stable and survives blocked storage", () => {
    expect(device).toContain("localStorage");
    expect(device).toContain("catch");
    expect(device).toContain("randomUUID");
  });

  it("retries a dropped connection with a smaller file, never a rejection", () => {
    expect(client).toContain("ATTEMPTS");
    expect(client).toMatch(/maxSide: 1024/);
    expect(client).toContain("isPermanent");
    expect(client).toContain('code === "cloudinary-rejected"');
  });

  it("fetches no extra chunk to find the signed-in member", () => {
    // A stale deploy used to 404 this dynamic import and lose the upload.
    expect(client).not.toContain('import("firebase/auth")');
    expect(client).toContain('from "@/lib/firebase"');
  });
});

describe("signup cannot be blocked by storage", () => {
  const page = read("src/app/auth/page.tsx");
  const modal = read("src/components/admin/user-detail-modal.tsx");

  it("offers the WhatsApp handover when an upload fails", () => {
    expect(page).toContain("onFailure");
    expect(page).toContain("sendDocsOnWhatsApp");
    expect(page).toContain("documentsDeferred");
  });

  it("tells the owner which members owe documents", () => {
    expect(modal).toContain("documentsDeferred");
    expect(modal).toContain("Documents promised on WhatsApp");
  });
});

describe("production can be asked which build it is", () => {
  const health = read("src/app/api/health/route.ts");

  it("reports the commit Vercel deployed", () => {
    expect(health).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(health).toContain("build:");
  });
});
