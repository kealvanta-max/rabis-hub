import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describeGpsFailure, GHANA_BOUNDS, isInGhana } from "@/lib/geolocation";

/**
 * The location step used to be able to trap a member: one high accuracy attempt
 * with a fifteen second timeout, a red box when it failed, and a disabled
 * Continue button. Indoors, that is a dead end.
 *
 * These pin the replacement behaviour, because "it worked on my phone" is not a
 * test and Rabi cannot debug a signup flow from WhatsApp.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const geolocation = read("src/lib/geolocation.ts");
const hook = read("src/hooks/use-geolocation.ts");
const page = read("src/app/auth/page.tsx");
const rules = read("firestore.rules");

describe("asking for a location", () => {
  it("waits twenty seconds, not fifteen", () => {
    expect(geolocation).toContain("const TIMEOUT_MS = 20000");
    expect(geolocation).toContain("timeout: TIMEOUT_MS");
    expect(geolocation).not.toContain("timeout: 15000");
  });

  it("tries GPS first, then the network", () => {
    const first = geolocation.indexOf("enableHighAccuracy: true");
    const second = geolocation.indexOf("enableHighAccuracy: false");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it("does not retry after a refusal", () => {
    // Code 1 is a decision. Asking twice only annoys the member.
    expect(geolocation).toContain('if (code === "denied") throw new GpsError("denied"');
  });

  it("explains a refusal in words a member can act on", () => {
    const denied = describeGpsFailure("denied");
    expect(denied).toContain("lock icon");
    expect(denied.toLowerCase()).toContain("type your area");
  });

  it("keeps the timeout message soft", () => {
    const timeout = describeGpsFailure("timeout");
    expect(timeout).toContain("You can proceed");
    expect(timeout.toLowerCase()).not.toContain("timed out. please enable");
  });
});

describe("believable coordinates", () => {
  it("accepts Accra", () => {
    expect(isInGhana(5.6037, -0.187)).toBe(true);
  });

  it("accepts Tamale and the coast", () => {
    expect(isInGhana(9.4008, -0.8393)).toBe(true);
    expect(isInGhana(4.9, -1.75)).toBe(true);
  });

  it("rejects a pin in London, which is what a location changer produces", () => {
    expect(isInGhana(51.5072, -0.1276)).toBe(false);
  });

  it("rejects null island", () => {
    expect(isInGhana(0, 0)).toBe(false);
  });

  it("flags rather than discards", () => {
    // A member travelling is a conversation for Rabi, not a rejection.
    expect(geolocation).toContain("suspicious");
    expect(geolocation).toContain("Position is outside Ghana.");
    expect(GHANA_BOUNDS.maxLat).toBeGreaterThan(GHANA_BOUNDS.minLat);
  });
});

describe("never a dead end", () => {
  it("reports that the form can always continue", () => {
    expect(hook).toContain("canContinue: true");
    expect(hook).toContain("needsReview:");
  });

  it("does not disable the continue button on a location", () => {
    const step4 = page.slice(page.indexOf("STEP 4"), page.indexOf("STEP 5"));
    expect(step4).not.toContain("disabled={!canStep5}");
    expect(page).not.toContain("canStep5");
  });

  it("only offers manual area entry after three failed location attempts", () => {
    const step4 = page.slice(page.indexOf("STEP 4"), page.indexOf("STEP 5"));
    expect(page).toContain("gpsAttempts >= 3");
    expect(step4).toContain("Attempt ");
    expect(step4).toContain("of 3");
    expect(step4).not.toContain("skipLocation");
    expect(step4).not.toContain("Skip for now");
  });

  it("collects an area when the phone will not share a pin", () => {
    const step4 = page.slice(page.indexOf("STEP 4"), page.indexOf("STEP 5"));
    expect(step4).toContain('id="signup-area"');
    expect(step4).toContain('update("location"');
  });

  it("uses amber, not red, for a soft failure", () => {
    const step4 = page.slice(page.indexOf("STEP 4"), page.indexOf("STEP 5"));
    expect(step4).not.toContain("border-red-500");
    expect(step4).toContain("border-amber-400/30");
  });
});

describe("what the record says afterwards", () => {
  it("stores how the location was obtained", () => {
    expect(page).toContain("locationSource:");
    expect(page).toContain("locationAccuracy:");
    expect(page).toContain("locationReview:");
    expect(page).toContain('"Unknown, pending"');
  });

  it("stores location outcomes through the server and keeps client writes locked", () => {
    const submit = read("src/app/api/signup/submit/route.ts");
    expect(submit).toContain("locationSource:");
    expect(submit).toContain("locationAccuracy:");
    expect(submit).toContain("locationReview:");
    const userRules = rules.slice(rules.indexOf("match /users/"), rules.indexOf("match /settings/"));
    expect(userRules).toContain("allow create: if false;");
    const applicantWrite = userRules.slice(userRules.indexOf("affectedKeys().hasOnly(["));
    const allowlist = applicantWrite.slice(0, applicantWrite.indexOf("])") );
    for (const field of ["locationSource", "locationAccuracy", "locationReview"]) {
      expect(allowlist).not.toContain(`'${field}'`);
    }
  });

  it("tells the admin to look", () => {
    expect(read("src/components/admin/user-detail-modal.tsx")).toContain("Needs review");
  });
});
