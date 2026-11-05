import { describe, expect, it } from "vitest";

import {
  contributionSummary,
  humaniseLastContribution,
  progressPercent,
  remainingToTarget,
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

