"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  getUserRounds,
  getUserPaymentReports,
  reportPayment,
  type PaymentReport,
  type SusuRound,
} from "@/lib/payment-tracker";
import { getPlanAmount, getPlanLabel } from "@/lib/plans-data";
import { useCustomPlans } from "@/hooks/use-custom-plans";
import { PaymentsSkeleton } from "@/components/ui/skeleton";
import { useToastContext } from "@/components/layout/toast-provider";
import { formatDate, formatDateTime } from "@/lib/utils";
import Navigation from "@/components/layout/navigation";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";

export default function UserPaymentsPage() {
  const { user, userData, loading: authLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToastContext();
  const { customPlans } = useCustomPlans();

  const [rounds, setRounds] = useState<SusuRound[]>([]);
  const [reports, setReports] = useState<PaymentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportingRound, setReportingRound] = useState<string | null>(null);
  const [momoRef, setMomoRef] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [activeRounds, history] = await Promise.all([
        getUserRounds(user.uid),
        getUserPaymentReports(user.uid),
      ]);
      setRounds(activeRounds);
      setReports(history);
    } catch (error) {
      console.error("Failed to load rounds", error);
      addToast("Could not load your Susu rounds. Please refresh and try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth?mode=signin");
      return;
    }

    if (user) {
      loadData();
    }
  }, [user, authLoading, router, loadData]);

  const handleReport = async (round: SusuRound) => {
    if (!user) return;
    setReportingRound(round.id);
    try {
      const amount = getPlanAmount(round.planId, customPlans);
      await reportPayment(round.id, user.uid, userData?.name || user.displayName || user.email || "Member", amount, momoRef[round.id]);
      setMomoRef((prev) => ({ ...prev, [round.id]: "" }));
      addToast("Payment reported. An admin will confirm it shortly.", "success");
      await loadData();
    } catch (error) {
      console.error(error);
      addToast(error instanceof Error ? error.message : "Failed to report payment", "error");
    } finally {
      setReportingRound(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#020C06] text-white">
        <PaymentsSkeleton />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#020C06] text-white">
      <Navigation />

      <main className="max-w-4xl mx-auto px-6 pt-32 pb-24">
        <div className="mb-8">
          <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")} className="mb-6">
            ← Back to Dashboard
          </Button>
          <h1 className="text-3xl font-display mb-2">My Payment Tracking</h1>
          <p className="text-gray-400">Track your active rounds and report payments directly.</p>
        </div>

        {rounds.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <p className="text-gray-400 mb-4">
              You are not enrolled in any active Susu rounds yet. Once the admin creates a round for your plan, it will
              appear here.
            </p>
            <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {rounds.map((round) => {
              const mySlot = round.slots.find((slot) => slot.userId === user.uid);
              if (!mySlot) return null;

              const isPaid = mySlot.paidRounds?.includes(round.roundNumber);
              const isPending = mySlot.selfReported && !isPaid;

              return (
                <div key={round.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
                        {getPlanLabel(round.planId, customPlans)}
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded uppercase tracking-wider font-bold">
                          Round {round.roundNumber}
                        </span>
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">
                        Cashout Date: {formatDate(round.cashoutDate)} · Your slot #{mySlot.position} of{" "}
                        {round.totalSlots || round.slots.length}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Pay <span className="text-primary font-semibold">GH₵{getPlanAmount(round.planId, customPlans).toLocaleString()}</span>{" "}
                        to <span className="text-gray-300 font-medium">{round.momoNumber}</span> ({round.momoName}) — use your full name as the MoMo reference.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {isPaid ? (
                        <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                          <span className="text-lg">✅</span> Payment Confirmed
                        </div>
                      ) : isPending ? (
                        <div className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin"></span>{" "}
                          Pending Confirmation
                        </div>
                      ) : (
                        <div className="bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                          <span className="text-lg">❌</span> Not Paid
                        </div>
                      )}
                    </div>
                  </div>

                  {!isPaid && !isPending && (
                    <div className="p-6 bg-primary/5 flex flex-col md:flex-row gap-4 items-end">
                      <div className="flex-1 w-full">
                        <Input
                          label="Mobile Money Reference (Optional)"
                          value={momoRef[round.id] || ""}
                          onChange={(e) => setMomoRef((prev) => ({ ...prev, [round.id]: e.target.value }))}
                          placeholder="e.g. 123456789"
                        />
                      </div>
                      <div className="w-full md:w-auto">
                        <Button
                          onClick={() => handleReport(round)}
                          loading={reportingRound === round.id}
                          className="w-full"
                        >
                          I Have Paid
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="p-6 bg-black/20">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">
                      Round {round.roundNumber} Status
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {[...(round.slots || [])]
                        .sort((a, b) => a.position - b.position)
                        .map((slot) => (
                          <div
                            key={slot.userId}
                            className={`p-3 rounded-lg border flex items-center gap-3 ${
                              slot.userId === user.uid
                                ? "bg-primary/10 border-primary/30"
                                : "bg-white/5 border-white/5"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center font-bold text-xs text-gray-400">
                              #{slot.position}
                            </div>
                            <div className="flex-1 truncate text-sm font-medium">
                              {slot.userId === user.uid ? "You" : slot.userName}
                            </div>
                            <div>
                              {slot.nextToReceive
                                ? "🛑"
                                : slot.paidRounds?.includes(round.roundNumber)
                                ? "✅"
                                : slot.selfReported
                                ? "⏳"
                                : "❌"}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {reports.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-bold text-white mb-4">Payment History</h2>
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
              <div className="divide-y divide-white/5">
                {reports.map((report) => {
                  const round = rounds.find((r) => r.id === report.roundId);
                  return (
                    <div key={report.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {round ? getPlanLabel(round.planId, customPlans) : "Susu round"} · Round{" "}
                          {report.roundNumber ?? round?.roundNumber ?? "—"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(report.reportedAt)}
                          {report.momoRef ? ` · Ref: ${report.momoRef}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-gray-200">
                          GH₵{Number(report.amount || 0).toLocaleString()}
                        </span>
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                            report.confirmed
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {report.confirmed ? "Confirmed" : "Awaiting admin"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
