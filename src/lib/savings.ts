/**
 * Savings tracking, pure maths, no Firestore.
 *
 * Rabi collects money on WhatsApp and Mobile Money; nothing here takes a
 * payment. She records what she received (one tap), and the member sees the
 * running total and how far they have to go.
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

