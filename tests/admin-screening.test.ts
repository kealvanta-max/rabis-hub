import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filterMembers, matchesFilter, needsReview, MEMBER_FILTERS } from "@/lib/admin-query";

/**
 * The KYC pipeline's fallback is "send it to Rabi". That path only exists if the
 * admin panel can (a) surface the case, (b) say why it is there, and (c) show
 * what the machine actually concluded. None of that used to be true: submissions
 * were written with `kycReviewStatus` and nothing in the UI ever read it, so an
 * inconclusive screening was indistinguishable from one that passed.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const member = (over: Partial<Parameters<typeof needsReview>[0]>) => ({
  name: "Akosua Mensah",
  email: "akosua@example.com",
  status: "pending",
  // Every real submission carries this, whatever the AI said.
  kycReviewStatus: "manual_review_required",
  ...over,
});

describe("which applications reach the review queue", () => {
  it("includes a case the AI held", () => {
    expect(needsReview(member({ kycScreeningState: "manual_review_required" }))).toBe(true);
  });

  it("includes a case no provider could check", () => {
    expect(needsReview(member({ kycScreeningState: "verification_unavailable" }))).toBe(true);
  });

  it("includes a typed location even when the photos passed", () => {
    expect(needsReview(member({ kycScreeningState: "screened_pass", locationReview: true }))).toBe(true);
  });

  it("excludes a clean pending application", () => {
    expect(needsReview(member({ kycScreeningState: "screened_pass" }))).toBe(false);
  });

  it("excludes decided applications regardless of the screening state", () => {
    expect(needsReview(member({ status: "approved", kycScreeningState: "manual_review_required" }))).toBe(false);
    expect(needsReview(member({ status: "rejected", kycScreeningState: "rejected" }))).toBe(false);
  });
});

describe("the field that distinguishes pending cases", () => {
  /*
   * The bug this pins: the first version of `needsReview` read
   * `kycReviewStatus`, which the submission route writes as
   * `manual_review_required` on EVERY application, including a clean pass. The
   * filter would have matched all pending members and been worthless.
   */
  it("does not treat the always-set review status as a verdict", () => {
    const cleanPass = member({ kycReviewStatus: "manual_review_required", kycScreeningState: "screened_pass" });
    expect(needsReview(cleanPass)).toBe(false);
  });

  it("would have matched everything if it read the wrong field", () => {
    const all = [
      member({ kycScreeningState: "screened_pass" }),
      member({ kycScreeningState: "manual_review_required" }),
      member({ kycScreeningState: "verification_unavailable" }),
    ];
    // Reading the wrong field: 3 of 3.
    expect(all.filter((entry) => entry.kycReviewStatus === "manual_review_required")).toHaveLength(3);
    // Reading the right one: 2 of 3, which is the question Rabi is asking.
    expect(all.filter(needsReview)).toHaveLength(2);
  });
});

describe("the filter row", () => {
  const users = [
    member({ name: "Held", email: "held@example.com", kycScreeningState: "manual_review_required" }),
    member({ name: "Clean", email: "clean@example.com", kycScreeningState: "screened_pass" }),
    member({ name: "Legacy", email: "legacy@example.com", kycScreeningState: undefined }),
    member({ name: "Typed pin", email: "pin@example.com", kycScreeningState: "screened_pass", locationReview: true }),
    member({ name: "Approved", email: "yes@example.com", status: "approved", kycScreeningState: "screened_pass" }),
  ];

  it("offers the queue as a first-class filter", () => {
    expect(MEMBER_FILTERS.map((entry) => entry.id)).toContain("needs-review");
    expect(MEMBER_FILTERS.find((entry) => entry.id === "needs-review")?.label).toBe("Needs review");
  });

  it("counts exactly the applications an automated check could not clear", () => {
    expect(users.filter((user) => matchesFilter(user, "needs-review"))).toHaveLength(2);
  });

  it("finds applications with no screening record at all", () => {
    expect(users.filter((user) => matchesFilter(user, "no-screening"))).toHaveLength(1);
  });

  it("still filters by plain status", () => {
    expect(filterMembers(users, { status: "approved" })).toHaveLength(1);
    expect(filterMembers(users, { status: "pending" })).toHaveLength(4);
  });

  it("combines a queue filter with the search box", () => {
    expect(filterMembers(users, { status: "needs-review", search: "held" })).toHaveLength(1);
    expect(filterMembers(users, { status: "needs-review", search: "clean" })).toHaveLength(0);
  });

  it("returns everyone for the default filter", () => {
    expect(filterMembers(users, {})).toHaveLength(5);
  });
});

describe("what Rabi is shown", () => {
  const panel = read("src/components/admin/screening-panel.tsx");

  it("renders the AI record inside the detail sheet", () => {
    expect(read("src/components/admin/user-detail-modal.tsx")).toContain(
      "<ScreeningPanel record={user.kycScreeningChecks?.vision} />"
    );
  });

  it("never presents a pass as an approval", () => {
    // The strongest positive outcome still tells the reviewer to look.
    const pass = panel.slice(panel.indexOf("screened_pass:"));
    const block = pass.slice(0, pass.indexOf("manual_review_required:"));
    expect(block).toContain("cannot confirm identity");
    expect(block).toContain("approve only after you have looked");
    // There is no "approved" verdict in the state map: only Rabi can approve.
    expect(block).not.toMatch(/title: "Approved/);
  });

  it("translates machine reasons into sentences", () => {
    expect(panel).toContain("does not contain a human face");
    expect(panel).toContain("quota ran out");
    expect(panel).toContain("rejected our key");
  });

  it("blames the service, not the member, when no check was possible", () => {
    expect(panel).toContain("This is our failure, not the member's");
  });

  it("shows the individual signals so a disagreement can be located", () => {
    for (const label of ["What is in the selfie", "Ghana Card authenticity", "Selfie vs photo on the card"]) {
      expect(panel).toContain(label);
    }
  });

  it("handles a record that does not exist", () => {
    expect(panel).toContain("no AI screening record");
  });

  it("surfaces provider failover, which usually means a key is stale", () => {
    expect(panel).toContain("providers tried");
  });
});

describe("the record the panel reads is actually written", () => {
  const submit = read("src/app/api/signup/submit/route.ts");
  const types = read("src/lib/types.ts");

  it("is persisted under the documented field", () => {
    expect(submit).toContain("kycScreeningChecks: screeningChecks");
    expect(types).toContain("kycScreeningChecks?:");
  });

  it("keeps the signals, not only the verdict", () => {
    expect(submit).toContain("signals: visionResult.signals ?? null");
    expect(types).toContain("signals?: {");
  });

  it("stamps when the check ran", () => {
    expect(submit).toContain("at: new Date().toISOString()");
  });
});
