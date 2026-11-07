"use client";

import { useMemo } from "react";
import {
  Users,
  UserCheck,
  Clock,
  UserX,
  TrendingUp,
  CalendarDays,
  Megaphone,
} from "lucide-react";
import type { Timestamp } from "firebase/firestore";
import { getPlanLabel } from "@/lib/plans-data";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  plan?: string;
  plans?: string[];
  status?: "pending" | "approved" | "rejected";
  createdAt?: Timestamp | null;
  whatsappLink?: string;
}

interface InsightsPanelProps {
  users: Member[];
  announcements: { id: string; title?: string; message?: string; createdAt?: Timestamp | null }[];
  onOpenUser?: (id: string) => void;
}

const DAY = 24 * 60 * 60 * 1000;

function toMillis(value?: Timestamp | null): number | null {
  if (!value) return null;
  if (typeof (value as Timestamp).toMillis === "function") return (value as Timestamp).toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

function within(millis: number | null, ms: number) {
  if (millis === null) return false;
  return Date.now() - millis <= ms;
}

/**
 * Behaviour dashboard: what members actually do, built from the same Firestore
 * registrations the admin already reviews — no third-party dependency, so it
 * works from day one (PostHog adds session-level detail on top).
 */
export default function InsightsPanel({ users, announcements, onOpenUser }: InsightsPanelProps) {
  const stats = useMemo(() => {
    const total = users.length;
    const approved = users.filter((u) => u.status === "approved").length;
    const pending = users.filter((u) => u.status === "pending" || !u.status).length;
    const rejected = users.filter((u) => u.status === "rejected").length;

    const stamps = users.map((u) => toMillis(u.createdAt));
    const today = stamps.filter((ms) => within(ms, DAY)).length;
    const week = stamps.filter((ms) => within(ms, 7 * DAY)).length;
    const month = stamps.filter((ms) => within(ms, 30 * DAY)).length;

    const approvalRate = approved + rejected > 0 ? Math.round((approved / (approved + rejected)) * 100) : 0;

    const planCounts = new Map<string, number>();
    for (const user of users) {
      const planIds = user.plans?.length ? user.plans : user.plan ? [user.plan] : [];
      for (const planId of planIds) planCounts.set(planId, (planCounts.get(planId) ?? 0) + 1);
    }
    const topPlans = Array.from(planCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, count }));

    // Last 7 days as a simple sparkline-friendly series.
    const daily = Array.from({ length: 7 }).map((_, index) => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const start = dayStart.getTime() - (6 - index) * DAY;
      const end = start + DAY;
      return {
        label: new Date(start).toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2),
        count: stamps.filter((ms) => ms !== null && ms >= start && ms < end).length,
      };
    });

    const recent = [...users]
      .sort((a, b) => (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0))
      .slice(0, 5);

    return { total, approved, pending, rejected, today, week, month, approvalRate, topPlans, daily, recent };
  }, [users]);

  const peak = Math.max(1, ...stats.daily.map((d) => d.count));

  return (
    <div className="space-y-5">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Applications" value={stats.total} icon={Users} accent="emerald" hint={`${stats.month} this month`} />
        <StatCard label="Approved" value={stats.approved} icon={UserCheck} accent="emerald" hint={`${stats.approvalRate}% approval rate`} />
        <StatCard label="Waiting" value={stats.pending} icon={Clock} accent="amber" hint="needs your review" />
        <StatCard label="Declined" value={stats.rejected} icon={UserX} accent="rose" hint="contacted support" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Weekly activity */}
        <div className="glass-soft rounded-2xl p-5 lg:col-span-3">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">New members this week</p>
              <p className="text-xs text-gray-400">{stats.week} applications in the last 7 days</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              <TrendingUp className="h-3 w-3" />
              {stats.today} today
            </span>
          </div>

          <div className="flex h-32 items-end gap-2">
            {stats.daily.map((day) => (
              <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="relative flex h-full w-full items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600/40 to-emerald-400/90 transition-all duration-500"
                    style={{ height: `${Math.max(6, (day.count / peak) * 100)}%` }}
                    title={`${day.count} application${day.count === 1 ? "" : "s"}`}
                  />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{day.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/5 pt-4 text-center">
            <MiniStat label="Today" value={stats.today} />
            <MiniStat label="7 days" value={stats.week} />
            <MiniStat label="30 days" value={stats.month} />
          </div>
        </div>

        {/* Funnel */}
        <div className="glass-soft rounded-2xl p-5 lg:col-span-2">
          <p className="text-sm font-semibold text-white">Application funnel</p>
          <p className="text-xs text-gray-400">Where people are right now</p>

          <div className="mt-5 space-y-4">
            <FunnelBar label="Applied" value={stats.total} total={stats.total} tone="from-emerald-500 to-emerald-300" />
            <FunnelBar label="Approved" value={stats.approved} total={stats.total} tone="from-emerald-400 to-teal-300" />
            <FunnelBar label="Waiting" value={stats.pending} total={stats.total} tone="from-amber-500 to-yellow-300" />
            <FunnelBar label="Declined" value={stats.rejected} total={stats.total} tone="from-rose-500 to-orange-400" />
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="relative grid h-28 w-28 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#34d399 ${stats.approvalRate * 3.6}deg, rgba(255,255,255,0.07) 0deg)`,
              }}
            >
              <div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-[#06130c]">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{stats.approvalRate}%</p>
                  <p className="text-[9px] uppercase tracking-widest text-gray-400">approved</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Popular plans */}
        <div className="glass-soft rounded-2xl p-5">
          <p className="text-sm font-semibold text-white">Most requested plans</p>
          <p className="text-xs text-gray-400">What members choose when they sign up</p>

          <div className="mt-4 space-y-3">
            {stats.topPlans.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No plans yet.</p>}
            {stats.topPlans.map((plan) => (
              <div key={plan.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs text-gray-300">{getPlanLabel(plan.id)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300"
                    style={{ width: `${(plan.count / Math.max(1, stats.topPlans[0].count)) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-bold text-white">{plan.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Latest activity */}
        <div className="glass-soft rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Latest activity</p>
              <p className="text-xs text-gray-400">Newest applications first</p>
            </div>
            <CalendarDays className="h-4 w-4 text-gray-400" />
          </div>

          <div className="mt-4 space-y-2">
            {stats.recent.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Nothing yet.</p>}
            {stats.recent.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onOpenUser?.(member.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{member.name || "Unnamed"}</p>
                  <p className="truncate text-[11px] text-gray-400">
                    {member.createdAt ? formatDate(member.createdAt) : "-"} · {getPlanLabel(member.plan || "")}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    member.status === "approved" && "bg-emerald-400/15 text-emerald-300",
                    member.status === "rejected" && "bg-rose-400/15 text-rose-300",
                    (!member.status || member.status === "pending") && "bg-amber-400/15 text-amber-300"
                  )}
                >
                  {member.status || "pending"}
                </span>
              </button>
            ))}
          </div>

          {announcements.length > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] text-gray-400">
              <Megaphone className="h-3.5 w-3.5 text-emerald-300" />
              {announcements.length} announcement{announcements.length === 1 ? "" : "s"} live on member dashboards
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "amber" | "rose";
  hint: string;
}) {
  const tones = {
    emerald: "text-emerald-300 bg-emerald-400/10",
    amber: "text-amber-300 bg-amber-400/10",
    rose: "text-rose-300 bg-rose-400/10",
  } as const;

  return (
    <div className="glass-soft rounded-2xl p-4">
      <div className={cn("mb-3 inline-flex rounded-xl p-2", tones[accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  );
}

function FunnelBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-gray-300">{label}</span>
        <span className="text-gray-400">
          {value} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className={cn("h-full rounded-full bg-gradient-to-r", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
