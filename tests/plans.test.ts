import { describe, expect, it } from "vitest";
import {
  achieverTiers,
  allStandardPlans,
  getAdminPlanOptions,
  getPlanAmount,
  getPlanLabel,
  getPlanOptions,
  getPlanSlots,
  plans,
  type CustomPlan,
} from "@/lib/plans-data";

const customPlans: CustomPlan[] = [
  { id: "custom-1", name: "Festive GH₵100", amt: 100, freq: "Weekly", ret: 1500, slots: 8 },
];

describe("plans catalogue", () => {
  it("exposes every standard plan exactly once", () => {
    const flattened = Object.values(plans).flat();
    expect(allStandardPlans).toHaveLength(flattened.length);
    const ids = allStandardPlans.map((plan) => plan.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups plan options for the signup form", () => {
    const groups = getPlanOptions();
    expect(groups).toHaveLength(5);
    expect(groups[0].options.length).toBe(plans.daily.length);
    expect(groups.some((group) => group.label === "High Achiever")).toBe(true);
    expect(groups.flatMap((group) => group.options).length).toBe(
      allStandardPlans.length + achieverTiers.length
    );
  });
});

describe("getPlanLabel", () => {
  it("resolves standard, achiever and custom plans", () => {
    expect(getPlanLabel("daily-6")).toBe("Daily GH₵6");
    expect(getPlanLabel("achiever-100")).toBe("Achiever 100D");
    expect(getPlanLabel("custom-1", customPlans)).toBe("Festive GH₵100");
  });

  it("falls back gracefully", () => {
    expect(getPlanLabel("custom-1")).toBe("custom-1");
    expect(getPlanLabel("")).toBe("No plan selected");
  });
});

describe("getPlanAmount", () => {
  it("returns the contribution for standard and custom plans", () => {
    expect(getPlanAmount("daily-23")).toBe(23);
    expect(getPlanAmount("monthly-1000")).toBe(1000);
    expect(getPlanAmount("custom-1", customPlans)).toBe(100);
  });

  it("uses the day count for achiever increments", () => {
    expect(getPlanAmount("achiever-100")).toBe(100);
    expect(getPlanAmount("achiever-300")).toBe(300);
  });

  it("returns 0 for unknown plans", () => {
    expect(getPlanAmount("does-not-exist")).toBe(0);
  });
});

describe("getPlanSlots", () => {
  it("uses the advertised slot count then defaults to 10", () => {
    expect(getPlanSlots("daily-30")).toBe(10);
    expect(getPlanSlots("monthly-600")).toBe(12);
    expect(getPlanSlots("custom-1", customPlans)).toBe(8);
    expect(getPlanSlots("unknown-plan")).toBe(10);
  });
});

describe("getAdminPlanOptions", () => {
  it("prepends a custom plan group when custom plans exist", () => {
    const groups = getAdminPlanOptions(customPlans);
    expect(groups[0].label).toBe("Custom Plans");
    expect(groups[0].options[0].value).toBe("custom-1");
  });

  it("returns only standard groups when there are no custom plans", () => {
    expect(getAdminPlanOptions()[0].label).not.toBe("Custom Plans");
  });
});
