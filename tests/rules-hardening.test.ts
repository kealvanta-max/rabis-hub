import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Security fences for the Firestore rules and trusted server boundary.
 *
 * These assert intent, not behaviour: they run without a Firestore emulator, so
 * they cannot prove the project is running this file. Deploy with
 * `npm run rules:deploy` and confirm with the owner-only probe at
 * `/api/security/rules-probe`, which asks the live database as a stranger.
 */

const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

const KYC_FIELDS = [
  "ghanaCardNumber",
  "ghanaCardFront",
  "ghanaCardBack",
  "passportPhoto",
  "faceScanVideo",
  "ghanaCardOcrResult",
  "gpsLat",
  "gpsLng",
  "gpsAddress",
];

describe("member privacy", () => {
  it("lets a member read only their own record", () => {
    expect(rules).toContain("allow read: if isSelf(uid) || isAdmin();");
  });

  it("has no wildcard allow anywhere", () => {
    expect(rules).not.toMatch(/allow\s+read\s*,\s*write\s*:/);
    expect(rules).not.toMatch(/allow\s+write:\s*if\s+true/);
  });

  it("gates admin access on a server-assigned custom claim only", () => {
    expect(rules).toContain("request.auth.token.admin == true");
    expect(rules).not.toContain("email_verified == true");
    expect(rules).not.toContain("email.lower() in");
  });
});

describe("server-owned identity records", () => {
  it("denies applicant-created profiles in Firestore", () => {
    expect(rules).toContain("allow create: if false;");
  });

  it("keeps client updates to ordinary profile fields only", () => {
    const userBlock = rules.slice(rules.indexOf("match /users/"), rules.indexOf("match /settings/"));
    const allowlistBlock = userBlock.slice(userBlock.indexOf("affectedKeys().hasOnly(["));
    const allowlist = allowlistBlock.slice(0, allowlistBlock.indexOf("])"));
    expect(allowlist).toContain("'name', 'phone', 'location', 'plan', 'plans'");
    for (const field of KYC_FIELDS) expect(allowlist).not.toContain(`'${field}'`);
    expect(userBlock).toContain("request.resource.data.status == resource.data.status");
  });

  it("locks KYC decisions, evidence and delivery fields out of direct admin writes", () => {
    const userBlock = rules.slice(rules.indexOf("match /users/"), rules.indexOf("match /settings/"));
    const protectedBlock = userBlock.slice(userBlock.indexOf("affectedKeys().hasAny(["));
    for (const field of [
      ...KYC_FIELDS,
      "status",
      "kycReviewStatus",
      "kycScreeningChecks",
      "evidenceHashes",
      "reviewerUid",
      "reviewedAt",
      "decisionEmailAt",
    ]) {
      expect(protectedBlock).toContain(`'${field}'`);
    }
  });

  it("keeps the AI verdict out of admin hands", () => {
    // The screening record is the only evidence of what the model actually
    // answered. An admin who could edit it could manufacture consent for a
    // decision, so the rules must list it with the other server-owned fields.
    const userBlock = rules.slice(rules.indexOf("match /users/"), rules.indexOf("match /settings/"));
    expect(userBlock).toContain("'kycScreeningChecks'");
  });

  it("creates profiles through the authenticated server submission route", () => {
    const route = readFileSync(new URL("../src/app/api/signup/submit/route.ts", import.meta.url), "utf8");
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain("transaction.create(ref");
    expect(route).toContain('kycReviewStatus: "manual_review_required"');
    expect(route).toContain("evidenceHashes");
  });
});

describe("the rest of the surface", () => {
  it("keeps announcements read-only for members", () => {
    const block = rules.slice(rules.indexOf("match /announcements/"));
    expect(block).toContain("allow read: if signedIn();");
    expect(block).toContain("allow write: if isAdmin();");
  });

  it("keeps reviews pending until an admin approves them", () => {
    expect(rules).toContain("request.resource.data.status == 'pending'");
    expect(rules).toContain("allow update, delete: if isAdmin();");
  });
});
