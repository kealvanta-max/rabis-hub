"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { getUserRounds, reportPayment, SusuRound } from "@/lib/payment-tracker";
import { plans } from "@/lib/plans-data";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Navigation from "@/components/layout/navigation";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";

export default function UserPaymentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [rounds, setRounds] = useState<SusuRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportingRound, setReportingRound] = useState<string | null>(null);
  const [momoRef, setMomoRef] = useState("");
  const [userData, setUserData] = useState<any>(null);
  const [customPlans, setCustomPlans] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
      return;
    }

    if (user) {
      loadData();
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    try {
      const activeRounds = await getUserRounds(user!.uid);
      setRounds(activeRounds);
      
      const userSnap = await getDoc(doc(db, "users", user!.uid));
      if (userSnap.exists()) {
        setUserData(userSnap.data());
      }
      
      const customPlansSnap = await getDoc(doc(db, "settings", "customPlans"));
      if (customPlansSnap.exists() && customPlansSnap.data().plans) {
        setCustomPlans(customPlansSnap.data().plans);
      }
    } catch (err) {
      console.error("Failed to load rounds", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReport = async (roundId: string) => {
    if (!userData || !user) return;
    setReportingRound(roundId);
    try {
      const round = rounds.find(r => r.id === roundId);
      if (!round) throw new Error("Round not found");

      let amount = 0;
      if (round.planId.startsWith("achiever")) {
        amount = round.roundNumber; // Achiever increments by GH₵1 each round
      } else {
        const standardPlans = Object.values(plans).flat();
        const stdPlan = standardPlans.find(p => p.id === round.planId);
        if (stdPlan) {
          amount = stdPlan.amt;
        } else {
          const custPlan = customPlans.find(p => p.id === round.planId);
          if (custPlan) amount = Number(custPlan.amt) || 0;
        }
      }

      await reportPayment(roundId, user.uid, userData.name, amount, momoRef);
      setMomoRef("");
      await loadData();
    } catch (err) {
      console.error(err);
      alert("Failed to report payment");
    } finally {
      setReportingRound(null);
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-[#020C06] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div></div>;
  }

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
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center text-gray-400">
            You are not part of any active Susu rounds yet.
          </div>
        ) : (
          <div className="space-y-6">
            {rounds.map(round => {
              const mySlot = round.slots.find(s => s.userId === user?.uid);
              if (!mySlot) return null;

              const isPaid = mySlot.paidRounds.includes(round.roundNumber);
              const isPending = mySlot.selfReported;

              return (
                <div key={round.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {round.planId.toUpperCase()} Susu
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded uppercase tracking-wider font-bold">Round {round.roundNumber}</span>
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">Cashout Date: {round.cashoutDate.toDate().toLocaleDateString()}</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {isPaid ? (
                        <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                          <span className="text-lg">✅</span> Payment Confirmed
                        </div>
                      ) : isPending ? (
                        <div className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin"></span> Pending Confirmation
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
                          value={momoRef} 
                          onChange={(e) => setMomoRef(e.target.value)} 
                          placeholder="e.g. 123456789"
                        />
                      </div>
                      <div className="w-full md:w-auto">
                        <Button 
                          onClick={() => handleReport(round.id)} 
                          loading={reportingRound === round.id}
                          className="w-full"
                        >
                          I Have Paid
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="p-6 bg-black/20">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Round {round.roundNumber} Status</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {round.slots.sort((a, b) => a.position - b.position).map(slot => (
                        <div key={slot.userId} className={`p-3 rounded-lg border flex items-center gap-3 ${slot.userId === user?.uid ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-white/5'}`}>
                          <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center font-bold text-xs text-gray-400">
                            #{slot.position}
                          </div>
                          <div className="flex-1 truncate text-sm font-medium">
                            {slot.userId === user?.uid ? "You" : slot.userName}
                          </div>
                          <div>
                            {slot.nextToReceive ? "🛑" : slot.paidRounds.includes(round.roundNumber) ? "✅" : slot.selfReported ? "⏳" : "❌"}
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
      </main>
    </div>
  );
}
