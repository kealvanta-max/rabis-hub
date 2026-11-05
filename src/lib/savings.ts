/**
 * Savings tracking and Advance Susu — pure maths, no Firestore.
 *
 * Rabi still collects money on WhatsApp and Mobile Money; nothing here takes a
 * payment. The admin records what she received (one tap), the member sees the
 * running total, and an "advance" is a *request* she can approve or decline.
 */

export interface Contribution {
  /** ISO date (yyyy-mm-dd) of the money hitting Rabi's account. */
  date: string;
  amount: number;
  note?: string;
}

export interface ContributionSummary {
  count: number;
  total: number;
  /** ISO date of the most recent contribution, or null. */
  last?: string;
  /** Total recorded in the current calendar month. */
  thisMonth: number;
  /** Amount received in the last 7 days. */
  lastWeek: number;
}

function daysAgo(iso: string, now: Date): number | null {
  const then = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

export function contributionSummary(
  contributions: Contribution[] | undefined,
  now: Date = new Date()
): ContributionSummary {
  const list = (contributions ?? []).filter(
    (entry) => entry && Number.isFinite(entry.amount) && entry.amount > 0
  );

  if (list.length === 0) return { count: 0, total: 0, thisMonth: 0, lastWeek: 0 };

  const total = list.reduce((sum, entry) => sum + entry.amount, 0);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    count: list.length,
    total,
    last: sorted[sorted.length - 1]?.date,
    thisMonth: list
      .filter((entry) => entry.date.startsWith(monthKey))
      .reduce((sum, entry) => sum + entry.amount, 0),
    lastWeek: list
      .filter((entry) => {
        const age = daysAgo(entry.date, now);
        return age !== null && age >= 0 && age < 7;
      })
      .reduce((sum, entry) => sum + entry.amount, 0),
  };
}

/** 0–100, clamped. `target <= 0` means "no target set" and returns 0. */
export function progressPercent(total: number, target: number | undefined): number {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((total / target) * 100)));
}

export function remainingToTarget(total: number, target: number | undefined): number | null {
  if (!target || target <= 0) return null;
  return Math.max(0, target - total);
}

/** "Today", "Yesterday", "6 days ago", "12 Aug 2026". */
export function humaniseLastContribution(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "No contributions recorded yet";
  const age = daysAgo(iso, now);
  if (age === null) return "Date unknown";
  if (age <= 0) return "Today";
  if (age === 1) return "Yesterday";
  if (age < 7) return `${age} days ago`;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * How much of her own money a member could ask to withdraw early.
 * Half of what has actually been received — conservative on purpose, because
 * the other half is what funds the payout she is saving toward.
 */
export function advanceLimit(totalContributed: number): number {
  if (!Number.isFinite(totalContributed) || totalContributed <= 0) return 0;
  return Math.floor(totalContributed / 2);
}

export interface AdvanceRequest {
  id?: string;
  userId: string;
  userName: string;
  plan?: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "declined";
  createdAt?: unknown;
  decidedAt?: unknown;
  adminNote?: string;
}

export interface AdvanceValidation {
  ok: boolean;
  error?: string;
}

export function validateAdvance(
  amountInput: string,
  reason: string,
  totalContributed: number
): AdvanceValidation {
  const amount = Number(amountInput);

  if (!amountInput.trim()) return { ok: false, error: "How much do you need?" };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter an amount greater than 0." };
  }

  const limit = advanceLimit(totalContributed);
  if (limit === 0) {
    return {
      ok: false,
      error: "No contributions recorded yet — once Rabi has received your first payment this opens up.",
    };
  }
  if (amount > limit) {
    return { ok: false, error: `You can request up to GH₵${limit} right now.` };
  }
  if (reason.trim().length < 5) {
    return { ok: false, error: "Tell Rabi briefly why you need it (a few words is enough)." };
  }
  if (reason.trim().length > 300) {
    return { ok: false, error: "Keep the reason under 300 characters." };
  }

  return { ok: true };
}

/** Newest first, pending at the top for the admin. */
export function sortAdvanceRequests<T extends { status: string; createdAt?: unknown }>(list: T[]): T[] {
  const weight = (status: string) => (status === "pending" ? 0 : 1);
  return [...list].sort((a, b) => {
    const byStatus = weight(a.status) - weight(b.status);
    if (byStatus !== 0) return byStatus;
    const at = (value: unknown) =>
      typeof value === "object" && value && "seconds" in value
        ? Number((value as { seconds: number }).seconds)
        : 0;
    return at(b.createdAt) - at(a.createdAt);
  });
}
