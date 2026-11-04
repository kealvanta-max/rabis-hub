"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  getActiveRounds,
  getPendingReports,
  createRound,
  confirmPayment,
  advanceRound,
  confirmPayout,
  exportRoundDataAsCSV,
  type PaymentReport,
  type SusuRound,
} from "@/lib/payment-tracker";
import { collection, query, where, getDocs, db } from "@/lib/db";
import { getAdminPlanOptions, getPlanLabel, getPlanSlots, type CustomPlan } from "@/lib/plans-data";
import { useCustomPlans } from "@/hooks/use-custom-plans";
import { useToastContext } from "@/components/layout/toast-provider";
import { formatDate, formatDateTime, toDateInputValue } from "@/lib/utils";
import Navigation from "@/components/layout/navigation";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Modal from "@/components/ui/modal";

interface ApprovedUser {
  id: string;
  name: string;
  plan?: string;
  plans?: string[];
}

export default function AdminPaymentsPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToastContext();
  const { customPlans } = useCustomPlans();

  const [rounds, setRounds] = useState<SusuRound[]>([]);
  const [pendingReports, setPendingReports] = useState<PaymentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRound, setBusyRound] = useState<string | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);

  // New Round Form
  const [newPlan, setNewPlan] = useState("");
  const [newTotalSlots, setNewTotalSlots] = useState("10");
  const [newMomoNum, setNewMomoNum] = useState("0244990995");
  const [newMomoName, setNewMomoName] = useState("Rabiatu Awal");
  const [newCashoutDate, setNewCashoutDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return toDateInputValue(date);
  });
  const [creating, setCreating] = useState(false);

  const loadRounds = useCallback(async () => {
    try {
      const [data, reports] = await Promise.all([getActiveRounds(), getPendingReports()]);
      setRounds(data);
      setPendingReports(reports);
    } catch (error) {
      console.error(error);
      addToast("Unable to load Susu rounds. Check your connection and Firestore rules.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.replace("/auth?mode=signin");
      return;
    }

    if (isAdmin) {
      loadRounds();
    }
  }, [user, isAdmin, authLoading, router, loadRounds]);

  const handleCreateRound = async () => {
    if (!newPlan) {
      addToast("Choose a plan for this round.", "error");
      return;
    }

    const parsedSlots = Number.parseInt(newTotalSlots, 10);
    if (!Number.isFinite(parsedSlots) || parsedSlots < 2) {
      addToast("A round needs at least 2 slots.", "error");
      return;
    }

    setCreating(true);
    try {
      // Multi-plan members store their plan ids in `plans`, so filter client
      // side instead of relying on a single `plan` field equality query.
      const approvedSnap = await getDocs(
        query(collection(db, "users"), where("status", "==", "approved"))
      );

      const eligible: ApprovedUser[] = approvedSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ApprovedUser, "id">) }))
        .filter((u) => {
          const plans = Array.isArray(u.plans) ? u.plans : [];
          return u.plan === newPlan || plans.includes(newPlan);
        });

      if (eligible.length === 0) {
        addToast(
          `No approved members are on ${getPlanLabel(newPlan, customPlans)} yet. Approve members first.`,
          "error"
        );
        return;
      }

      const selected = eligible.slice(0, parsedSlots);
      const cashout = new Date(`${newCashoutDate}T12:00:00`);

      await createRound({
        planId: newPlan,
        planName: getPlanLabel(newPlan, customPlans),
        roundNumber: 1,
        cashoutDate: Number.isNaN(cashout.getTime()) ? new Date() : cashout,
        momoNumber: newMomoNum,
        momoName: newMomoName,
        totalSlots: selected.length,
        slots: selected.map((member, index) => ({
          userId: member.id,
          userName: member.name,
          position: index + 1,
          paidRounds: [],
          selfReported: false,
          adminConfirmed: false,
          nextToReceive: index === 0,
          payoutConfirmed: false,
        })),
      });

      addToast(
        `Round started with ${selected.length} member${selected.length === 1 ? "" : "s"}.`,
        "success"
      );
      setCreateModalOpen(false);
      setNewPlan("");
      await loadRounds();
    } catch (error) {
      console.error("Failed to create round", error);
      addToast("Failed to create the round. Please try again.", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async (
    roundId: string,
    userId: string,
    currentRoundNum: number,
    reportId?: string
  ) => {
    setBusyRound(`${roundId}-${userId}`);
    try {
      let resolvedReportId = reportId ?? null;

      if (!resolvedReportId) {
        const reportsSnap = await getDocs(
          query(
            collection(db, "payment-reports"),
            where("roundId", "==", roundId),
            where("userId", "==", userId),
            where("confirmed", "==", false)
          )
        );
        resolvedReportId = reportsSnap.empty ? null : reportsSnap.docs[0].id;
      }

      await confirmPayment(roundId, resolvedReportId, user!.uid, currentRoundNum, userId);
      addToast("Payment confirmed.", "success");
      await loadRounds();
    } catch (error) {
      console.error(error);
      addToast("Could not confirm this payment.", "error");
    } finally {
      setBusyRound(null);
    }
  };

  const handleAdvance = async (round: SusuRound) => {
    const unpaid = round.slots.filter((slot) => !slot.paidRounds?.includes(round.roundNumber));
    const message =
      unpaid.length > 0
        ? `${unpaid.length} member(s) have not been marked as paid for round ${round.roundNumber}. Advance anyway?`
        : `Advance "${getPlanLabel(round.planId, customPlans)}" to round ${round.roundNumber + 1}?`;

    if (!window.confirm(message)) return;

    setBusyRound(round.id);
    try {
      await advanceRound(round.id);
      addToast("Round advanced.", "success");
      await loadRounds();
    } catch (error) {
      console.error("Failed to advance round:", error);
      addToast("Failed to advance the round.", "error");
    } finally {
      setBusyRound(null);
    }
  };

  const handlePayout = async (roundId: string, userId: string, name: string) => {
    if (!window.confirm(`Mark the payout to ${name} as received?`)) return;
    setBusyRound(`${roundId}-${userId}`);
    try {
      await confirmPayout(roundId, userId);
      addToast("Payout confirmed.", "success");
      await loadRounds();
    } catch (error) {
      console.error("Failed to confirm payout:", error);
      addToast("Failed to confirm the payout.", "error");
    } finally {
      setBusyRound(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#020C06] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#020C06] text-white">
        <Navigation />
        <main className="max-w-xl mx-auto px-6 pt-40 text-center">
          <h1 className="text-2xl font-display mb-3">Admin access required</h1>
          <p className="text-gray-400 mb-6">Sign in with an administrator account to manage Susu rounds.</p>
          <Button onClick={() => router.replace("/auth?mode=signin")}>Go to sign in</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020C06] text-white">
      <Navigation />

      <main className="max-w-6xl mx-auto px-6 pt-32 pb-24">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <Button variant="secondary" size="sm" onClick={() => router.push("/admin")} className="mb-4">
              ← Back to Admin Panel
            </Button>
            <h1 className="text-3xl font-display mb-2">Susu Round Management</h1>
            <p className="text-gray-400">Track payments, manage slots, and confirm cashouts.</p>
          </div>

          <Button onClick={() => setCreateModalOpen(true)}>+ Start New Round</Button>
        </div>

        {pendingReports.length > 0 && (
          <div className="mb-10 bg-amber-500/[0.06] border border-amber-500/25 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-amber-500/20 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-amber-200">Payment reports awaiting confirmation</h2>
                <p className="text-xs text-amber-200/70">
                  Members tapped “I Have Paid”. Confirm each report to mark their slot as paid.
                </p>
              </div>
              <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full">
                {pendingReports.length} pending
              </span>
            </div>
            <div className="divide-y divide-amber-500/10">
              {pendingReports.map((report) => {
                const round = rounds.find((r) => r.id === report.roundId);
                const roundLabel = round ? getPlanLabel(round.planId, customPlans) : "Susu round";
                const roundNumber = report.roundNumber ?? round?.roundNumber ?? 1;

                return (
                  <div key={report.id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{report.userName}</p>
                      <p className="text-xs text-gray-400">
                        {roundLabel} · Round {roundNumber} · GH₵{Number(report.amount || 0).toLocaleString()}
                        {report.momoRef ? ` · Ref ${report.momoRef}` : ""}
                      </p>
                      <p className="text-[11px] text-gray-500">{formatDateTime(report.reportedAt)}</p>
                    </div>
                    <Button
                      size="sm"
                      loading={busyRound === `${report.roundId}-${report.userId}`}
                      onClick={() => handleConfirm(report.roundId, report.userId, roundNumber, report.id)}
                    >
                      Confirm payment
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {rounds.map((round) => {
            const sortedSlots = [...(round.slots || [])].sort((a, b) => a.position - b.position);
            const paidCount = sortedSlots.filter((slot) => slot.paidRounds?.includes(round.roundNumber)).length;

            return (
              <div key={round.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10 bg-primary/5 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-3 flex-wrap">
                      {getPlanLabel(round.planId, customPlans)}
                      <span className="text-xs bg-primary text-black px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                        Round {round.roundNumber}
                      </span>
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      Payment MoMo: {round.momoNumber} ({round.momoName}) • Cashout: {formatDate(round.cashoutDate)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {paidCount}/{sortedSlots.length} members paid for this round
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const csv = exportRoundDataAsCSV(round);
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `susu-round-${round.planId}-${round.roundNumber}.csv`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 100);
                      }}
                    >
                      Export Report
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busyRound === round.id}
                      onClick={() => handleAdvance(round)}
                    >
                      Advance Round
                    </Button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sortedSlots.map((slot) => {
                      const isPaid = slot.paidRounds?.includes(round.roundNumber);
                      const isReported = slot.selfReported;

                      return (
                        <div
                          key={slot.userId}
                          className={`p-4 rounded-xl border ${
                            slot.nextToReceive ? "border-primary bg-primary/10" : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-bold text-gray-500">#{slot.position}</span>
                            {slot.nextToReceive && (
                              <span className="text-xs bg-primary text-black px-2 py-0.5 rounded font-bold">
                                NEXT TO RECEIVE 🛑
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-lg mb-4 truncate">{slot.userName}</p>

                          <div className="space-y-2">
                            {isPaid ? (
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <span className="text-lg">✅</span> Paid
                              </span>
                            ) : isReported ? (
                              <Button
                                size="sm"
                                loading={busyRound === `${round.id}-${slot.userId}`}
                                onClick={() => handleConfirm(round.id, slot.userId, round.roundNumber)}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                              >
                                Confirm Payment ⏳
                              </Button>
                            ) : (
                              <div className="w-full flex gap-2 items-center">
                                <span className="text-red-400 font-bold flex items-center gap-1 flex-1">
                                  <span className="text-lg">❌</span> Pending
                                </span>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  loading={busyRound === `${round.id}-${slot.userId}`}
                                  onClick={() => handleConfirm(round.id, slot.userId, round.roundNumber)}
                                >
                                  Force ✅
                                </Button>
                              </div>
                            )}

                            {slot.nextToReceive && !slot.payoutConfirmed && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                loading={busyRound === `${round.id}-${slot.userId}`}
                                onClick={() => handlePayout(round.id, slot.userId, slot.userName)}
                              >
                                Mark Payout Received
                              </Button>
                            )}
                            {slot.payoutConfirmed && (
                              <p className="text-xs text-emerald-500">Payout confirmed ✓</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {rounds.length === 0 && (
            <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
              <p className="text-gray-400 mb-4">No active Susu rounds found.</p>
              <Button onClick={() => setCreateModalOpen(true)}>Create the first round</Button>
            </div>
          )}
        </div>
      </main>

      <Modal isOpen={isCreateModalOpen} onClose={() => setCreateModalOpen(false)} title="Start New Susu Round">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Plan</label>
            <select
              value={newPlan}
              onChange={(e) => {
                const planId = e.target.value;
                setNewPlan(planId);
                if (planId) setNewTotalSlots(String(getPlanSlots(planId, customPlans as CustomPlan[])));
              }}
              className="w-full px-4 py-3 bg-[#051A10]/60 border border-[#065F46] rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              <option value="">Select a plan...</option>
              {getAdminPlanOptions(customPlans as CustomPlan[]).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Input
            label="Total Slots (approved members only)"
            type="number"
            min={2}
            value={newTotalSlots}
            onChange={(e) => setNewTotalSlots(e.target.value)}
          />
          <Input
            label="Cashout Date"
            type="date"
            value={newCashoutDate}
            onChange={(e) => setNewCashoutDate(e.target.value)}
          />
          <Input label="MoMo Number for Payment" value={newMomoNum} onChange={(e) => setNewMomoNum(e.target.value)} />
          <Input label="MoMo Name" value={newMomoName} onChange={(e) => setNewMomoName(e.target.value)} />
          <Button onClick={handleCreateRound} loading={creating} className="w-full mt-4">
            Start Round
          </Button>
          <p className="text-xs text-gray-500">
            Only members with the <strong>approved</strong> status who are on the selected plan are added to the round.
          </p>
        </div>
      </Modal>
    </div>
  );
}
