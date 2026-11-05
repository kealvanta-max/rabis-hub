/**
 * Custom susu plans — the model, the validation and the lookups Rabi's admin
 * needs. Kept pure so the rules can be tested without a browser or Firestore.
 *
 * A custom plan may omit money fields. Rabi creates plans while talking to a
 * member on WhatsApp; blocking her because "Target Return" is blank is how you
 * lose the sale. Nothing is guessed on her behalf: an absent return renders as
 * "Flexible" rather than a fabricated figure.
 */

import { planLabels, plans, type CustomPlan } from "@/lib/plans-data";

export type { CustomPlan };

const WA_LINK = /^https:\/\/(chat\.whatsapp\.com|www\.whatsapp\.com|whatsapp\.com|wa\.me)\/\S+$/i;

/** Blank is valid (no link yet); anything else must be a WhatsApp URL. */
export function isValidWhatsappLink(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || WA_LINK.test(trimmed);
}

/** Normalise what a human pastes: trim, add https://, strip trailing junk. */
export function normaliseWhatsappLink(value: string): string {
  let trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`;
  return trimmed.replace(/[),.;]+$/, "");
}

/**
 * Stable, human-readable id. Two plans called "Daily GH₵50" must not collide,
 * and the id must never change again — WhatsApp links and member documents are
 * keyed by it.
 */
export function slugPlanId(name: string, taken: string[] = []): string {
  const base =
    name
      .toLowerCase()
      .replace(/gh₵|ghs|₵/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "plan";

  const id = `custom-${base}`;
  if (!taken.includes(id)) return id;

  let n = 2;
  while (taken.includes(`${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

/** Every built-in plan id → its label, plus whatever Rabi has created. */
export function planEntries(customPlans: CustomPlan[] = []): [string, string][] {
  const builtIn = Object.entries(planLabels);
  const custom = customPlans
    .filter((plan) => plan && plan.id)
    .map((plan) => [plan.id, plan.name || plan.id] as [string, string]);
  const seen = new Set(builtIn.map(([id]) => id));
  return [...builtIn, ...custom.filter(([id]) => !seen.has(id))];
}

export function planLabelOf(planId: string, customPlans: CustomPlan[] = []): string {
  return planLabels[planId] ?? customPlans.find((plan) => plan.id === planId)?.name ?? planId;
}

/** Built-in payout for a plan id, read from the static plan table. */
export function builtInReturn(planId: string): number | undefined {
  for (const group of Object.values(plans)) {
    const match = group.find((plan) => plan.id === planId);
    if (match) return match.ret;
  }
  return undefined;
}

export function planReturnOf(planId: string, customPlans: CustomPlan[] = []): number | undefined {
  const custom = customPlans.find((plan) => plan.id === planId);
  if (custom) return typeof custom.ret === "number" && custom.ret > 0 ? custom.ret : undefined;
  return builtInReturn(planId);
}

/**
 * Which WhatsApp group a member on this plan should join.
 * Order matters: the plan's own link is the newest truth, `waLinks` is the
 * older global map, and the last resort is the admin's main group.
 */
export function planWhatsappLink(
  planId: string,
  customPlans: CustomPlan[] = [],
  waLinks: Record<string, string> = {}
): string {
  const fromPlan = customPlans.find((plan) => plan.id === planId)?.whatsappLink?.trim();
  if (fromPlan) return fromPlan;
  return (waLinks[planId] || "").trim();
}

/** First link found across a member's plans (members can hold several). */
export function memberWhatsappLink(
  planIds: string[],
  customPlans: CustomPlan[] = [],
  waLinks: Record<string, string> = {}
): string {
  for (const planId of planIds) {
    const link = planWhatsappLink(planId, customPlans, waLinks);
    if (link) return link;
  }
  return "";
}

export interface PlanInput {
  name: string;
  amt: string;
  freq: string;
  ret: string;
  slots: string;
  whatsappLink: string;
}

export interface PlanValidation {
  ok: boolean;
  /** Field-keyed messages, shown inline under the offending input. */
  errors: Partial<Record<keyof PlanInput, string>>;
  plan?: CustomPlan;
}

/**
 * Deliberately forgiving: only the *name* is mandatory. Everything else is
 * optional and validated only if the admin typed something. This is the whole
 * "she wants flexibility" requirement, expressed as code.
 */
export function validatePlanInput(input: PlanInput, existing: string[] = []): PlanValidation {
  const errors: Partial<Record<keyof PlanInput, string>> = {};

  const name = input.name.trim();
  if (name.length < 2) errors.name = "Give the plan a name (at least 2 characters).";
  if (name.length > 60) errors.name = "That name is too long — keep it under 60 characters.";

  const amt = input.amt.trim() ? Number(input.amt) : undefined;
  if (amt !== undefined && (!Number.isFinite(amt) || amt <= 0)) {
    errors.amt = "Contribution must be a number greater than 0.";
  }

  const ret = input.ret.trim() ? Number(input.ret) : undefined;
  if (ret !== undefined && (!Number.isFinite(ret) || ret <= 0)) {
    errors.ret = "Return must be a number greater than 0 — or leave it blank.";
  }

  const slots = input.slots.trim() ? Number(input.slots) : undefined;
  if (slots !== undefined && (!Number.isInteger(slots) || slots <= 0)) {
    errors.slots = "Slots must be a whole number — or leave it blank for no limit.";
  }

  if (!isValidWhatsappLink(input.whatsappLink)) {
    errors.whatsappLink = "Paste the group invite link (chat.whatsapp.com/…) or leave it empty.";
  }

  const ok = Object.keys(errors).length === 0;

  return {
    ok,
    errors,
    plan: ok
      ? {
          id: slugPlanId(name, existing),
          name,
          ...(amt !== undefined ? { amt } : {}),
          ...(input.freq.trim() ? { freq: input.freq.trim() } : {}),
          ...(ret !== undefined ? { ret } : {}),
          ...(slots !== undefined ? { slots } : {}),
          ...(normaliseWhatsappLink(input.whatsappLink)
            ? { whatsappLink: normaliseWhatsappLink(input.whatsappLink) }
            : {}),
        }
      : undefined,
  };
}

/** One-tap frequency presets so she types numbers, not labels. */
export const FREQUENCY_PRESETS = ["Daily", "Weekly", "Monthly", "Every 5 days", "Every 20 days"] as const;

/** What the member will actually see on the site — shown live in the form. */
export function planPreview(plan: CustomPlan): {
  title: string;
  rate: string;
  payout: string;
  slots: string;
} {
  return {
    title: plan.name || "Untitled plan",
    rate: plan.amt ? `GH₵${plan.amt} · ${plan.freq || "flexible schedule"}` : "Amount agreed with Rabi",
    payout: plan.ret ? `GH₵${plan.ret}` : "Flexible — Rabi quotes this",
    slots: plan.slots ? `${plan.slots} slots` : "No slot limit",
  };
}
