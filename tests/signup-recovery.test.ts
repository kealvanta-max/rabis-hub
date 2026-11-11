import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkProjectAlignment, configuredBrowserProject } from "@/lib/project-alignment";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const recover = read("src/app/api/signup/recover/route.ts");
const dashboard = read("src/app/dashboard/page.tsx");
const authPage = read("src/app/auth/page.tsx");
const health = read("src/app/api/health/route.ts");
const authContext = read("src/context/auth-context.tsx");

/*
 * Bug 2: "Your login works but your registration has not reached us."
 *
 * Two separate faults produced that screen, and the fixes only work together:
 *
 *   1. the server wrote to one Firebase project while the browser read another,
 *      so every write succeeded and every read came back empty
 *   2. when a signup failed halfway, the rollback left a working login with no
 *      profile, and the only button on the card re-read the missing document
 *
 * The first fault is proven by comparing two project ids, which is pure logic
 * and is tested directly below. The second is a route contract, tested against
 * the source the way the rest of this suite tests routes.
 */

describe("project alignment, the fault that hid every write", () => {
  it("calls two ids that match aligned", () => {
    const result = checkProjectAlignment("rabis-hub", "rabis-hub");
    expect(result.state).toBe("aligned");
    expect(result.fix).toBeUndefined();
  });

  it("calls two ids that differ a mismatch, and names both", () => {
    /*
     * This is the production failure: the service account belonged to one
     * project and the published config pointed at another. Naming both is the
     * whole point, because the reader has two variables open side by side.
     */
    const result = checkProjectAlignment("rabis-saving-hub", "rabis-hub-production");
    expect(result.state).toBe("mismatch");
    expect(result.summary).toContain("rabis-hub-production");
    expect(result.summary).toContain("rabis-saving-hub");
    expect(result.fix).toContain("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  });

  it("treats a missing side as unknown, never as a mismatch", () => {
    /*
     * A deployment with no service account is broken for a different reason and
     * /api/health already says so precisely. Reporting it here too would send
     * someone editing a variable that is not the problem.
     */
    expect(checkProjectAlignment("rabis-hub", null).state).toBe("unknown");
    expect(checkProjectAlignment(null, "rabis-hub").state).toBe("unknown");
    expect(checkProjectAlignment(undefined, undefined).state).toBe("unknown");
  });

  it("ignores whitespace, which is how these values usually arrive", () => {
    expect(checkProjectAlignment(" rabis-hub\n", "rabis-hub ").state).toBe("aligned");
    expect(checkProjectAlignment("   ", "rabis-hub").state).toBe("unknown");
  });

  it("never puts a secret in the summary", () => {
    /*
     * The public project id is not a secret; a private key is. The check only
     * ever receives project ids, and this pins that no key-shaped value can
     * reach the admin health body through this path.
     */
    const result = checkProjectAlignment("a", "b");
    expect(result.summary).not.toContain("PRIVATE KEY");
    expect(result.fix).not.toContain("PRIVATE KEY");
  });

  it("reads the browser project from the variable Next actually exposes", () => {
    expect(configuredBrowserProject({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "rabis-hub" })).toBe("rabis-hub");
    // The misspelled variant is a real hazard: one project id, one underscore.
    expect(configuredBrowserProject({ NEXT_PUBLIC_FIREBASE_PROJECTID: "rabis-hub" })).toBe("rabis-hub");
    expect(configuredBrowserProject({})).toBeNull();
  });

  it("is wired into the health check, so a mismatch is visible to Rabi", () => {
    expect(health).toContain("checkProjectAlignment");
    expect(health).toContain("projectAlignment");
    // Presence-only gap detection passed during the whole outage.
    expect(health).toContain("firebase-admin: project mismatch");
  });
});

describe("the recovery route", () => {
  it("requires a signed-in member", () => {
    expect(recover).toContain("authenticateRequest(request)");
    expect(recover).toContain("status: 401");
  });

  it("takes identity from the verified token, never from the request", () => {
    /*
     * If the uid came from the body, any signed-in member could create a profile
     * under someone else's id. The only trusted identity is the token.
     */
    expect(recover).toContain("actor.uid");
    expect(recover).toContain("ref.create(");
    expect(recover).not.toContain("body.uid");
    expect(recover).not.toMatch(/\.doc\(\s*boundedText/);
  });

  it("does not overwrite an application that already exists", () => {
    // `create` refuses an existing document; `set` would silently replace one.
    expect(recover).toContain(".create({");
    expect(recover).not.toContain(".set({");
    expect(recover).toContain("already-registered");
  });

  it("creates a stub that cannot be mistaken for a verified application", () => {
    /*
     * Recovery happens with no Ghana Card, no selfie and no liveness evidence.
     * The record must say that in a way an admin cannot skim past, and it must
     * never arrive in a state that looks approved.
     */
    expect(recover).toContain('status: "pending"');
    expect(recover).toContain("manual_review_required");
    expect(recover).toContain("verification_unavailable");
    expect(recover).toContain("registration-recovered-without-documents");
    expect(recover).toContain("kycRecoveredWithoutDocuments: true");
    expect(recover).not.toContain('status: "approved"');
    expect(recover).not.toContain('status: "active"');
  });

  it("says so plainly when storage is unreachable instead of blaming the member", () => {
    expect(recover).toContain('code: "storage-unavailable"');
    expect(recover).toContain("This is not something you did");
  });

  it("is rate limited, because it writes a document", () => {
    expect(recover).toContain("rateLimit(");
    expect(recover).toContain('"signup-recover"');
    expect(recover).toContain("status: 429");
  });
});

describe("the dead end itself", () => {
  it("the dashboard no longer offers a button that re-reads a missing document", () => {
    /*
     * `refreshProfile` re-reads the same absent document, so the old "Try again"
     * could not succeed by construction. The card now calls the route that
     * creates the record.
     */
    expect(dashboard).toContain("/api/signup/recover");
    expect(dashboard).toContain("Restore my registration");
    expect(dashboard).toContain("user.getIdToken()");
  });

  it("keeps Message Rabi as the fallback, for when recovery fails too", () => {
    const card = dashboard.slice(dashboard.indexOf("Restore my registration"));
    expect(card).toContain("wa.me/233504701032");
  });

  it("stops claiming the interruption was a connection problem", () => {
    /*
     * The old copy said "This is usually a brief connection problem", which was
     * false: the write had already succeeded, or the account had been rolled
     * back. A member who is told it is her connection retries forever.
     */
    expect(dashboard).not.toContain("usually a brief connection problem");
  });

  it("does not promise a recovery succeeds before the server says so", () => {
    // UI must show the real verdict, never a hardcoded success string.
    expect(dashboard).toContain("if (!response.ok)");
    expect(dashboard).toContain("recoverError");
  });

  it("explains the rollback in the signup page instead of a bare try-again", () => {
    expect(authPage).toContain("recent login");
    expect(authPage).toContain("deleteUser(createdUser)");
  });

  it("only re-reads the profile when the record already exists", () => {
    /*
     * `recovered: false` means the document was there and the page was stale.
     * That is the one case where a re-read is the right follow-up.
     */
    expect(authContext).toContain("refreshProfile");
    expect(dashboard).toContain("result.recovered === false");
  });
});
