/**
 * Pure admin helpers — the parts of the dashboard worth testing without a
 * browser: which plans belong to which group, and which members match a filter.
 */

export interface PlanGroup {
  id: string;
  label: string;
  hint: string;
}

export const PLAN_GROUPS: PlanGroup[] = [
  { id: "daily", label: "Daily plans", hint: "Collected every day" },
  { id: "weekly", label: "Weekly plans", hint: "Collected every week" },
  { id: "months", label: "6-month plans", hint: "Longer commitment" },
  { id: "achiever", label: "Achiever plans", hint: "Tiered returns" },
  { id: "monthly", label: "Monthly plans", hint: "Collected every month" },
  { id: "other", label: "Other plans", hint: "Custom plans" },
];

/** `daily-12` → `daily`; anything unrecognised falls into "other". */
export function planGroupOf(planId: string): string {
  const prefix = planId.split("-")[0];
  return PLAN_GROUPS.some((group) => group.id === prefix) ? prefix : "other";
}

export function groupPlanEntries(
  entries: [string, string][],
  query = ""
): (PlanGroup & { items: [string, string][] })[] {
  const search = query.trim().toLowerCase();
  const filtered = search
    ? entries.filter(([key, label]) => label.toLowerCase().includes(search) || key.includes(search))
    : entries;

  return PLAN_GROUPS.map((group) => ({
    ...group,
    items: filtered.filter(([key]) => planGroupOf(key) === group.id),
  })).filter((group) => group.items.length > 0);
}

export interface MemberLike {
  name: string;
  email: string;
  status: string;
}

export function filterMembers<T extends MemberLike>(
  members: T[],
  { status = "all", search = "" }: { status?: string; search?: string }
): T[] {
  const term = search.trim().toLowerCase();

  return members.filter((member) => {
    if (status !== "all" && member.status !== status) return false;
    if (!term) return true;
    return (
      member.name?.toLowerCase().includes(term) || member.email?.toLowerCase().includes(term)
    );
  });
}
