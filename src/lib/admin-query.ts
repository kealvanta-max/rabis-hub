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
  /**
   * Always `manual_review_required` on a fresh submission, whatever the AI said:
   * the decision belongs to a human, so the field records the *process*, not the
   * outcome. Never use it to tell one pending application from another.
   */
  kycReviewStatus?: string;
  /** The actual automated verdict: screened_pass, manual_review_required, … */
  kycScreeningState?: string;
  /** Set when the pin was typed or missing. */
  locationReview?: boolean;
}

/**
 * The filter set shown above the member list.
 *
 * `needs-review` exists because "pending" is not the same question as "the
 * machine could not decide". A pending member whose photos passed the visual
 * check looks identical in the list to one the AI held, and the second is the
 * one Rabi should open first.
 */
export type MemberFilter = "all" | "pending" | "approved" | "rejected" | "needs-review" | "no-screening";

export const MEMBER_FILTERS: { id: MemberFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "needs-review", label: "Needs review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

/**
 * True when the automated pass did not clear the application.
 *
 * This reads `kycScreeningState`, not `kycReviewStatus`. Every submission is
 * written with `kycReviewStatus: "manual_review_required"` because approval
 * always needs a human, so that field is the same for a clean pass and a dog
 * photo and cannot distinguish them. The screening state is the verdict.
 *
 * A member with no screening state at all predates screening; that is the
 * `no-screening` filter, not this one.
 */
export function needsReview(member: MemberLike): boolean {
  if (member.status !== "pending") return false;
  if (member.locationReview === true) return true;
  return (
    member.kycScreeningState === "manual_review_required" ||
    member.kycScreeningState === "verification_unavailable"
  );
}

export function matchesFilter(member: MemberLike, filter: string): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs-review":
      return needsReview(member);
    case "no-screening":
      // Submitted before screening existed: no verdict to trust, so look by eye.
      return member.status === "pending" && !member.kycScreeningState;
    default:
      return member.status === filter;
  }
}

export function filterMembers<T extends MemberLike>(
  members: T[],
  { status = "all", search = "" }: { status?: string; search?: string }
): T[] {
  const term = search.trim().toLowerCase();

  return members.filter((member) => {
    if (!matchesFilter(member, status)) return false;
    if (!term) return true;
    return (
      member.name?.toLowerCase().includes(term) || member.email?.toLowerCase().includes(term)
    );
  });
}
