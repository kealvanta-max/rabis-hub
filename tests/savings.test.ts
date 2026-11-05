import { describe, expect, it } from "vitest";

import {
  advanceLimit,
  contributionSummary,
  humaniseLastContribution,
  progressPercent,
  remainingToTarget,
  sortAdvanceRequests,
  validateAdvance,
} from "@/lib/savings";

const NOW = new Date("2026-11-05T12:00:00");

describe("contributionSummary", () => {
  it("handles a member who has paid nothing", () => {
    expect(contributionSummary(undefined, NOW)).toEqual({
      count: 0,
      total: 0,
      thisMonth: 0,
      lastWeek: 0,
    });
    expect(contributionSummary([], NOW).count).toBe(0);
  });

  it("totals everything, this month, and the last seven days", () => {
    const summary = contributionSummary(
      [
        { date: "2026-09-01", amount: 100 },
        { date: "2026-11-01", amount: 50 },
        { date: "2026-11-04", amount: 23 },
      ],
      NOW
    );
    expect(summary.count).toBe(3);
    expect(summary.total).toBe(173);
    expect(summary.thisMonth).toBe(73);
    expect(summary.lastWeek).toBe(73);
    expect(summary.last).toBe("2026-11-04");
  });

  it("ignores junk entries instead of producing NaN", () => {
    const summary = contributionSummary(
      [
        { date: "2026-11-01", amount: 50 },
        { date: "2026-11-02", amount: Number.NaN },
        { date: "2026-11-03", amount: -20 },
      ],
      NOW
    );
    expect(summary.total).toBe(50);
    expect(summary.count).toBe(1);
  });
});

describe("progress", () => {
  it("is 0 when no target is set", () => {
    expect(progressPercent(500, undefined)).toBe(0);
    expect(progressPercent(500, 0)).toBe(0);
  });

  it("clamps to 0–100 and never divides by zero", () => {
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(400, 200)).toBe(100);
    expect(progressPercent(-10, 200)).toBe(0);
  });

  it("says how much is left, or null when there is no target", () => {
    expect(remainingToTarget(50, 200)).toBe(150);
    expect(remainingToTarget(400, 200)).toBe(0);
    expect(remainingToTarget(50, undefined)).toBeNull();
  });
});

describe("humaniseLastContribution", () => {
  it("speaks like a person, not a timestamp", () => {
    expect(humaniseLastContribution(undefined, NOW)).toBe("No contributions recorded yet");
    expect(humaniseLastContribution("2026-11-05", NOW)).toBe("Today");
    expect(humaniseLastContribution("2026-11-04", NOW)).toBe("Yesterday");
    expect(humaniseLastContribution("2026-11-01", NOW)).toBe("4 days ago");
    expect(humaniseLastContribution("2026-08-12", NOW)).toContain("2026");
  });
});

describe("Advance Susu", () => {
  it("caps the request at half of what has been received", () => {
    expect(advanceLimit(0)).toBe(0);
    expect(advanceLimit(173)).toBe(86);
    expect(advanceLimit(Number.NaN)).toBe(0);
  });

  it("explains itself when there is nothing to advance against", () => {
    const result = validateAdvance("50", "school fees", 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No contributions recorded/i);
  });

  it("blocks more than the cap and says what the cap is", () => {
    const result = validateAdvance("500", "school fees", 200);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("GH₵100");
  });

  it("requires a short reason", () => {
    expect(validateAdvance("50", "x", 200).ok).toBe(false);
    expect(validateAdvance("50", "school fees", 200).ok).toBe(true);
    expect(validateAdvance("50", "a".repeat(301), 200).ok).toBe(false);
  });

  it("rejects empty, zero and negative amounts", () => {
    expect(validateAdvance("", "school fees", 200).ok).toBe(false);
    expect(validateAdvance("0", "school fees", 200).ok).toBe(false);
    expect(validateAdvance("-5", "school fees", 200).ok).toBe(false);
  });

  it("surfaces pending requests first, newest first within a status", () => {
    const sorted = sortAdvanceRequests([
      { status: "approved", createdAt: { seconds: 300 } },
      { status: "pending", createdAt: { seconds: 100 } },
      { status: "pending", createdAt: { seconds: 500 } },
    ]);
    expect(sorted.map((r) => r.createdAt)).toEqual([
      { seconds: 500 },
      { seconds: 100 },
      { seconds: 300 },
    ]);
  });
});
