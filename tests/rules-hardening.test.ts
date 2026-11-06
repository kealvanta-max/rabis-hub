import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Security fences for the deployed database rules.
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

  it("gates the admin check on a verified address", () => {
    expect(rules).toContain("request.auth.token.email_verified == true");
    expect(rules).toContain("request.auth.token.admin == true");
  });
});

describe("identity document lock", () => {
  it("only allows KYC fields to change while the application is pending", () => {
    // The clause that closes the swap: if the stored status is not pending, the
    // changed keys may not intersect the identity fields at all.
    expect(rules).toContain("resource.data.status == 'pending'");
    expect(rules).toContain("affectedKeys().hasAny([");
  });

  it("lists every identity field in the frozen set", () => {
    const frozenBlock = rules.slice(rules.indexOf("affectedKeys().hasAny(["));
    const frozen = frozenBlock.slice(0, frozenBlock.indexOf("])"));

    for (const field of KYC_FIELDS) {
      expect(frozen).toContain(`'${field}'`);
    }
  });

  it("still freezes the status on a self update", () => {
    expect(rules).toContain("request.resource.data.status == resource.data.status");
  });

  it("keeps email out of the writable set, so a member cannot change their identity", () => {
    const allowListBlock = rules.slice(rules.indexOf("affectedKeys().hasOnly(["));
    const allowList = allowListBlock.slice(0, allowListBlock.indexOf("])"));
    expect(allowList).not.toContain("'email'");
    expect(allowList).not.toContain("'status'");
    expect(allowList).not.toContain("'contributions'");
    expect(allowList).not.toContain("'whatsappLink'");
  });
});

describe("create time forgery", () => {
  it("refuses a pre-filled payments list", () => {
    expect(rules).toContain("!('contributions' in request.resource.data)");
  });

  it("refuses a pre-filled WhatsApp group link", () => {
    expect(rules).toContain("request.resource.data.whatsappLink == ''");
  });

  it("refuses pre-set delivery markers", () => {
    expect(rules).toContain("!('adminAlertAt' in request.resource.data)");
    expect(rules).toContain("!('decisionEmailAt' in request.resource.data)");
  });

  it("forces every new profile to start pending", () => {
    expect(rules).toMatch(/request\.resource\.data\.status == 'pending'/);
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
