import type { PlanItem, AchieverTier } from "./types";

export const plans: Record<string, PlanItem[]> = {
  daily: [
    { id: "daily-6", name: "Daily GH₵6", amt: 6, freq: "5 Days", ret: 400, slots: 15 },
    { id: "daily-23", name: "Daily GH₵23", amt: 23, freq: "5 Days", ret: 1500, slots: 14 },
    { id: "daily-26", name: "Daily GH₵26", amt: 26, freq: "5 Days", ret: 1850, slots: 15 },
    { id: "daily-18", name: "Daily GH₵18", amt: 18, freq: "5 Days", ret: 1250, slots: 15 },
    { id: "daily-12", name: "Daily GH₵12", amt: 12, freq: "4 Days", ret: 660, slots: 15 },
    { id: "daily-24", name: "Daily GH₵24", amt: 24, freq: "5 Days", ret: 1700, slots: 15 },
    { id: "daily-30", name: "Daily GH₵30", amt: 30, freq: "20 Days", ret: 5800, slots: 10 },
  ],
  weekly: [
    { id: "weekly-150", name: "Weekly GH₵150", amt: 150, freq: "Weekly", ret: 2150, slots: 15 },
    { id: "weekly-200", name: "Weekly GH₵200", amt: 200, freq: "Weekly", ret: 2900, slots: 15 },
    { id: "weekly-300", name: "Weekly GH₵300", amt: 300, freq: "Weekly", ret: 4300, slots: 15 },
  ],
  months: [
    { id: "months-35", name: "6M GH₵35", amt: 35, freq: "6 Months", ret: 6000 },
    { id: "months-20", name: "6M GH₵20", amt: 20, freq: "6 Months", ret: 3500 },
  ],
  longterm: [
    { id: "monthly-600", name: "Monthly GH₵600", amt: 600, freq: "Monthly", ret: 7000, slots: 12 },
    { id: "monthly-700", name: "Monthly GH₵700", amt: 700, freq: "Monthly", ret: 8200, slots: 12 },
    { id: "monthly-1000", name: "Monthly GH₵1000", amt: 1000, freq: "Monthly", ret: 11500, slots: 12 },
  ],
};

export const categoryImages = {
  daily: "/images/daily_ghana.png",
  weekly: "/images/weekly_ghana.png",
  months: "/images/months_ghana.png",
  longterm: "/images/longterm_ghana.png",
  achiever: "/images/achiever_ghana.png",
};


export const achieverTiers: AchieverTier[] = [
  { days: 100, ret: 4800 },
  { days: 200, ret: 19500 },
  { days: 300, ret: 44500 },
];

export const allPlanIds = [
  "daily-6", "daily-23", "daily-26", "daily-18", "daily-12", "daily-24", "daily-30",
  "weekly-150", "weekly-200", "weekly-300",
  "months-35", "months-20",
  "achiever-100", "achiever-200", "achiever-300",
  "monthly-600", "monthly-700", "monthly-1000",
];

export const planLabels: Record<string, string> = {
  "daily-6": "Daily GH₵6",
  "daily-23": "Daily GH₵23",
  "daily-26": "Daily GH₵26",
  "daily-18": "Daily GH₵18",
  "daily-12": "Daily GH₵12",
  "daily-24": "Daily GH₵24",
  "daily-30": "Daily GH₵30",
  "weekly-150": "Weekly GH₵150",
  "weekly-200": "Weekly GH₵200",
  "weekly-300": "Weekly GH₵300",
  "months-35": "6M GH₵35",
  "months-20": "6M GH₵20",
  "achiever-100": "Achiever 100D",
  "achiever-200": "Achiever 200D",
  "achiever-300": "Achiever 300D",
  "monthly-600": "Monthly GH₵600",
  "monthly-700": "Monthly GH₵700",
  "monthly-1000": "Monthly GH₵1000",
};

export function getPlanOptions() {
  return [
    {
      label: "Daily Starter",
      options: plans.daily.map((p) => ({
        value: p.id,
        label: `GH₵${p.amt} @ ${p.freq} = GH₵${p.ret.toLocaleString()}`,
      })),
    },
    {
      label: "Steady Grower (Weekly)",
      options: plans.weekly.map((p) => ({
        value: p.id,
        label: `GH₵${p.amt} ${p.freq} = GH₵${p.ret.toLocaleString()}`,
      })),
    },
    {
      label: "After Months",
      options: plans.months.map((p) => ({
        value: p.id,
        label: `GH₵${p.amt} @ ${p.freq} = GH₵${p.ret.toLocaleString()}`,
      })),
    },
    {
      label: "High Achiever",
      options: achieverTiers.map((t) => ({
        value: `achiever-${t.days}`,
        label: `GH₵1 Increment @ ${t.days} Days = GH₵${t.ret.toLocaleString()}`,
      })),
    },
    {
      label: "Long Term (Monthly)",
      options: plans.longterm.map((p) => ({
        value: p.id,
        label: `GH₵${p.amt} ${p.freq} = GH₵${p.ret.toLocaleString()}`,
      })),
    },
  ];
}
