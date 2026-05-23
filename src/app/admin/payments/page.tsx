"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { getActiveRounds, createRound, confirmPayment, SusuRound, advanceRound, exportRoundDataAsCSV } from "@/lib/payment-tracker";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Navigation from "@/components/layout/navigation";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Modal from "@/components/ui/modal";

export default function AdminPaymentsPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [rounds, setRounds] = useState<SusuRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  
  // New Round Form
  const [newPlan, setNewPlan] = useState("");
  const [newTotalSlots, setNewTotalSlots] = useState(10);
  const [newMomoNum, setNewMomoNum] = useState("0244990995");
  const [newMomoName, setNewMomoName] = useState("Rabiatu Awal");
  
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      router.push("/auth?mode=signin");
      return;
    }

    if (isAdmin) {
      loadRounds();
    }
  }, [user, isAdmin, authLoading, router]);

  const loadRounds = async () => {
    setLoading(true);
    try {
      const data = await getActiveRounds();
      setRounds(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRound = async () => {
    try {
      // Find all approved users for this plan
      const q = query(collection(db, "users"), where("plan", "==", newPlan), where("status", "==", "approved"));
      const snapshot = await getDocs(q);
      
      const slots = snapshot.docs.slice(0, newTotalSlots).map((doc, index) => ({
        userId: doc.id,
        userName: doc.data().name,
        position: index + 1,
        paidRounds: [],
        selfReported: false,
        adminConfirmed: false,
        nextToReceive: index === 0 // 1st person gets it first
      }));

      await createRound({
        planId: newPlan,
        roundNumber: 1,
        status: "active",
        cashoutDate: new Date(), // Set to something appropriate
        momoNumber: newMomoNum,
        momoName: newMomoName,
        slots,
        totalSlots: newTotalSlots
      } as any); // Ignoring Timestamp exact conversion here for brevity
      
      setCreateModalOpen(false);
      loadRounds();
    } catch (err) {
      console.error("Failed to create round", err);
      alert("Failed to create round");
    }
  };

  const handleConfirm = async (roundId: string, userId: string, currentRoundNum: number) => {
    try {
      const q = query(collection(db, "payment-reports"), where("roundId", "==", roundId), where("userId", "==", userId), where("confirmed", "==", false));
      const snap = await getDocs(q);
      
      let reportId = null;
      if (!snap.empty) {
        reportId = snap.docs[0].id;
      }

      await confirmPayment(roundId, reportId, user!.uid, currentRoundNum, userId);
      loadRounds(); // Reload to update state
    } catch (err) {
      console.error(err);
      alert("Failed to confirm");
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-[#020C06] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div></div>;
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
          
          <Button onClick={() => setCreateModalOpen(true)}>
            + Start New Round
          </Button>
        </div>

        <div className="space-y-8">
          {rounds.map(round => (
            <div key={round.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10 bg-primary/5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    {round.planId.toUpperCase()} Susu
                    <span className="text-xs bg-primary text-black px-2 py-0.5 rounded font-bold uppercase tracking-widest">Round {round.roundNumber}</span>
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">Payment MoMo: {round.momoNumber} ({round.momoName})</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => {
                    const csv = exportRoundDataAsCSV(round);
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `susu-round-${round.planId}-${round.roundNumber}.csv`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 100);
                  }}>Export Report</Button>
                  <Button variant="secondary" size="sm" onClick={async () => {
                    try {
                      await advanceRound(round.id);
                      loadRounds();
                    } catch (err) {
                      console.error("Failed to advance round:", err);
                    }
                  }}>Advance Round</Button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {round.slots.sort((a, b) => a.position - b.position).map(slot => {
                    const isPaid = slot.paidRounds.includes(round.roundNumber);
                    const isReported = slot.selfReported;
                    
                    return (
                      <div key={slot.userId} className={`p-4 rounded-xl border ${slot.nextToReceive ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-gray-500">#{slot.position}</span>
                          {slot.nextToReceive && <span className="text-xs bg-primary text-black px-2 py-0.5 rounded font-bold">NEXT TO RECEIVE 🛑</span>}
                        </div>
                        <p className="font-medium text-lg mb-4 truncate">{slot.userName}</p>
                        
                        <div className="flex items-center justify-between mt-auto">
                          {isPaid ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1"><span className="text-lg">✅</span> Paid</span>
                          ) : isReported ? (
                            <Button size="sm" onClick={() => handleConfirm(round.id, slot.userId, round.roundNumber)} className="w-full bg-amber-500 hover:bg-amber-600 text-black">
                              Confirm Payment ⏳
                            </Button>
                          ) : (
                            <div className="w-full flex gap-2">
                              <span className="text-red-400 font-bold flex items-center gap-1 w-full"><span className="text-lg">❌</span> Pending</span>
                              <Button variant="secondary" size="sm" onClick={() => handleConfirm(round.id, slot.userId, round.roundNumber)}>Force ✅</Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

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
          <Input label="Plan ID (e.g. daily, weekly)" value={newPlan} onChange={(e) => setNewPlan(e.target.value)} />
          <Input label="Total Slots" type="number" value={newTotalSlots.toString()} onChange={(e) => setNewTotalSlots(parseInt(e.target.value))} />
          <Input label="MoMo Number for Payment" value={newMomoNum} onChange={(e) => setNewMomoNum(e.target.value)} />
          <Input label="MoMo Name" value={newMomoName} onChange={(e) => setNewMomoName(e.target.value)} />
          <Button onClick={handleCreateRound} className="w-full mt-4">Start Round</Button>
        </div>
      </Modal>
    </div>
  );
}
