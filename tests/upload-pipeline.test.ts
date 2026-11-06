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
    expect(Number(anon?.[1])).toBeGreaterThanOrEqual(100);
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
