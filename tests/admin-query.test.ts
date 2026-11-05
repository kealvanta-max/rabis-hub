import { describe, expect, it } from "vitest";
import { filterMembers, groupPlanEntries, planGroupOf } from "@/lib/admin-query";

const entries: [string, string][] = [
  ["daily-6", "Daily GH₵6"],
  ["daily-12", "Daily GH₵12"],
  ["weekly-150", "Weekly GH₵150"],
  ["months-35", "6M GH₵35"],
  ["achiever-100", "Achiever 100D"],
  ["monthly-600", "Monthly GH₵600"],
  ["custom-77", "My special plan"],
];

describe("plan grouping", () => {
  it("maps a plan id to its family", () => {
    expect(planGroupOf("daily-6")).toBe("daily");
    expect(planGroupOf("weekly-150")).toBe("weekly");
    expect(planGroupOf("achiever-300")).toBe("achiever");
  });

  it("sends unknown prefixes to 'other'", () => {
    expect(planGroupOf("custom-77")).toBe("other");
    expect(planGroupOf("nonsense")).toBe("other");
  });

  it("groups without losing a single plan", () => {
    const grouped = groupPlanEntries(entries);
    const total = grouped.reduce((sum, group) => sum + group.items.length, 0);
    expect(total).toBe(entries.length);
    expect(grouped.map((group) => group.id)).toEqual([
      "daily",
      "weekly",
      "months",
      "achiever",
      "monthly",
      "other",
    ]);
  });

  it("drops empty groups", () => {
    const grouped = groupPlanEntries([["daily-6", "Daily GH₵6"]]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].id).toBe("daily");
  });

  it("searches by label and by id", () => {
    expect(groupPlanEntries(entries, "weekly")[0].items).toHaveLength(1);
    // "GH₵6" is a prefix of GH₵600, so both matches are correct and expected.
    expect(groupPlanEntries(entries, "gh₵600").flatMap((g) => g.items)).toEqual([
      ["monthly-600", "Monthly GH₵600"],
    ]);
    expect(groupPlanEntries(entries, "custom-77")[0].id).toBe("other");
  });
});

const members = [
  { name: "Esmeralda Dumaah", email: "christarmy318@gmail.com", status: "pending" },
  { name: "Kwabena Osei", email: "kwabena@example.com", status: "approved" },
  { name: "T", email: "testuser@test.com", status: "rejected" },
];

describe("member filtering", () => {
  it("returns everyone by default", () => {
    expect(filterMembers(members, {})).toHaveLength(3);
  });

  it("filters by status", () => {
    expect(filterMembers(members, { status: "approved" })).toHaveLength(1);
    expect(filterMembers(members, { status: "approved" })[0].name).toBe("Kwabena Osei");
  });

  it("searches names case-insensitively", () => {
    expect(filterMembers(members, { search: "esmeralda" })[0].email).toBe("christarmy318@gmail.com");
  });

  it("searches emails too", () => {
    expect(filterMembers(members, { search: "TESTUSER" })[0].status).toBe("rejected");
  });

  it("combines status and search", () => {
    expect(filterMembers(members, { status: "pending", search: "kwabena" })).toHaveLength(0);
  });

  it("ignores surrounding whitespace", () => {
    // "t" hits the member named "T" plus the two emails that contain a t.
    expect(filterMembers(members, { search: "   T   " })).toHaveLength(2);
    expect(filterMembers(members, { search: "  esmeralda  " })).toHaveLength(1);
  });
});
