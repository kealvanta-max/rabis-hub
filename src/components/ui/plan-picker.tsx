"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles, Users, TrendingUp } from "lucide-react";
import { plans, achieverTiers, type CustomPlan } from "@/lib/plans-data";
import { cn } from "@/lib/utils";

interface PlanPickerProps {
  value: string;
  onChange: (planId: string) => void;
  customPlans?: CustomPlan[];
}

interface PlanCard {
  id: string;
  amount: number;
  cadence: string;
  payout: number;
  slots?: number;
  note?: string;
}

interface Category {
  key: string;
  label: string;
  hint: string;
  cards: PlanCard[];
}

const cedis = (value: number) =>
  `GH₵${value.toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;

const fromStandard = (items: { id: string; amt: number; freq: string; ret: number; slots?: number }[]) =>
  items.map((plan) => ({
    id: plan.id,
    amount: plan.amt,
    cadence: plan.freq,
    payout: plan.ret,
    slots: plan.slots,
  }));

/**
 * Plan selection built for a phone screen in one hand.
 *
 * Instead of a 15-row native `<select>` the member picks a *category* (one tap)
 * and then a plan card (one tap). Every card shows the two numbers that matter:
 * what you pay, and what you receive.
 */
export default function PlanPicker({ value, onChange, customPlans = [] }: PlanPickerProps) {
  const categories = useMemo<Category[]>(() => {
    const list: Category[] = [
      {
        key: "daily",
        label: "Daily",
        hint: "Small daily contributions, paid out at the end of the cycle.",
        cards: fromStandard(plans.daily),
      },
      {
        key: "weekly",
        label: "Weekly",
        hint: "One payment a week, the most popular way to save.",
        cards: fromStandard(plans.weekly),
      },
      {
        key: "months",
        label: "6 Months",
        hint: "Lock in for six months and collect a bigger payout.",
        cards: fromStandard(plans.months),
      },
      {
        key: "longterm",
        label: "Monthly",
        hint: "Long-term members saving hundreds of cedis a month.",
        cards: fromStandard(plans.longterm),
      },
      {
        key: "achiever",
        label: "Achiever",
        hint: "Save GH₵1 more each day. The longest cycles pay the most.",
        cards: achieverTiers.map((tier) => ({
          id: `achiever-${tier.days}`,
          amount: tier.days,
          cadence: `${tier.days} days`,
          payout: tier.ret,
          note: "GH₵1 increments per day",
        })),
      },
    ];

    if (customPlans.length > 0) {
      list.push({
        key: "custom",
        label: "Custom",
        hint: "Special plans created for this cycle by Rabi.",
        cards: customPlans.map((plan) => ({
          id: plan.id,
          amount: Number(plan.amt) || 0,
          // Only the name is guaranteed now; a half-decided plan must still be
          // selectable, so absent fields degrade to honest labels.
          cadence: plan.freq || "Flexible",
          payout: Number(plan.ret) || 0,
          slots: plan.slots,
          note: plan.name,
        })),
      });
    }

    return list;
  }, [customPlans]);

  const initialCategory = useMemo(() => {
    const match = categories.find((category) => category.cards.some((card) => card.id === value));
    return match?.key ?? categories[0].key;
  }, [categories, value]);

  const [activeKey, setActiveKey] = useState(initialCategory);
  const active = categories.find((category) => category.key === activeKey) ?? categories[0];
  const selectedCard = active.cards.find((card) => card.id === value);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <label className="block text-sm font-medium text-gray-300">Choose a plan</label>
        <span className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Step 1 of 2</span>
      </div>

      {/* Category chips */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {categories.map((category) => {
          const isActive = category.key === active.key;
          return (
            <button
              key={category.key}
              type="button"
              onClick={() => setActiveKey(category.key)}
              aria-pressed={isActive}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300",
                isActive
                  ? "glass-emerald text-emerald-100"
                  : "border border-white/10 bg-white/[0.04] text-gray-400 hover:text-gray-200"
              )}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-gray-400">{active.hint}</p>

      {/* Plan cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {active.cards.map((card) => {
          const isSelected = card.id === value;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onChange(card.id)}
              aria-pressed={isSelected}
              className={cn(
                "group relative overflow-hidden rounded-2xl p-3.5 text-left transition-all duration-300",
                isSelected
                  ? "glass-emerald ring-1 ring-emerald-300/60"
                  : "border border-white/10 bg-white/[0.035] hover:border-emerald-400/40 hover:bg-white/[0.06]"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-xl leading-none text-white">{cedis(card.amount)}</p>
                  <p className="mt-1 text-[11px] font-medium text-gray-400">/ {card.cadence}</p>
                </div>
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                    isSelected
                      ? "border-emerald-300 bg-emerald-400 text-[#02160C]"
                      : "border-white/25 text-transparent group-hover:border-emerald-300/60"
                  )}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-emerald-300">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-sm font-bold">{cedis(card.payout)}</span>
              </div>

              <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                <span>payout</span>
                {card.slots ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {card.slots} slots
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    1 seat / cycle
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selection summary */}
      <div
        className={cn(
          "rounded-2xl border px-4 py-3 text-xs transition-colors",
          selectedCard
            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
            : "border-white/10 bg-white/[0.03] text-gray-400"
        )}
      >
        {selectedCard ? (
          <span>
            <strong className="font-semibold">{cedis(selectedCard.amount)}</strong> every{" "}
            {selectedCard.cadence.toLowerCase()} → you receive{" "}
            <strong className="font-semibold">{cedis(selectedCard.payout)}</strong> at payout.
          </span>
        ) : (
          <span>Pick a plan above to continue.</span>
        )}
      </div>
    </div>
  );
}
