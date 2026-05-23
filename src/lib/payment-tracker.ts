import { collection, addDoc, doc, updateDoc, getDocs, query, where, Timestamp, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface SusuRoundSlot {
  userId: string;
  userName: string;
  position: number;
  paidRounds: number[];
  selfReported: boolean;
  adminConfirmed: boolean;
  nextToReceive: boolean;
}

export interface SusuRound {
  id: string;
  planId: string;
  roundNumber: number;
  status: "active" | "completed";
  cashoutDate: Timestamp;
  momoNumber: string;
  momoName: string;
  slots: SusuRoundSlot[];
  totalSlots: number;
  createdAt: Timestamp;
}

export interface PaymentReport {
  id: string;
  roundId: string;
  userId: string;
  userName: string;
  amount: number;
  reportedAt: Timestamp;
  confirmed: boolean;
  confirmedAt?: Timestamp;
  confirmedBy?: string;
  momoRef?: string;
}

export async function createRound(data: Omit<SusuRound, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "susu-rounds"), {
    ...data,
    createdAt: Timestamp.now()
  });
  return docRef.id;
}

export async function reportPayment(roundId: string, userId: string, userName: string, amount: number, momoRef?: string) {
  // Add payment report
  const reportRef = await addDoc(collection(db, "payment-reports"), {
    roundId,
    userId,
    userName,
    amount,
    momoRef,
    reportedAt: Timestamp.now(),
    confirmed: false
  });

  // Update slot in round
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  
  if (roundSnap.exists()) {
    const roundData = roundSnap.data() as SusuRound;
    const slots = roundData.slots.map(slot => {
      if (slot.userId === userId) {
        return { ...slot, selfReported: true };
      }
      return slot;
    });
    
    await updateDoc(roundRef, { slots });
  }
  
  return reportRef.id;
}

export async function confirmPayment(roundId: string, reportId: string | null, adminId: string, currentRoundNumber: number, forceUserId?: string) {
  let targetUserId = forceUserId;

  if (reportId) {
    // Update report
    const reportRef = doc(db, "payment-reports", reportId);
    await updateDoc(reportRef, {
      confirmed: true,
      confirmedAt: Timestamp.now(),
      confirmedBy: adminId
    });

    // Update slot in round
    const reportSnap = await getDoc(reportRef);
    if (reportSnap.exists()) {
      targetUserId = reportSnap.data().userId;
    }
  }

  if (!targetUserId) return;

  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  
  if (roundSnap.exists()) {
    const roundData = roundSnap.data() as SusuRound;
    const slots = roundData.slots.map(slot => {
      if (slot.userId === targetUserId) {
        return { 
          ...slot, 
          selfReported: false, // Reset flag
          adminConfirmed: true,
          paidRounds: [...slot.paidRounds, currentRoundNumber]
        };
      }
      return slot;
    });
    
    await updateDoc(roundRef, { slots });
  }
}

export async function getActiveRounds(): Promise<SusuRound[]> {
  const q = query(collection(db, "susu-rounds"), where("status", "==", "active"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SusuRound));
}

export async function getUserRounds(userId: string): Promise<SusuRound[]> {
  const rounds = await getActiveRounds();
  return rounds.filter(round => round.slots.some(slot => slot.userId === userId));
}

export async function advanceRound(roundId: string): Promise<void> {
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  
  if (roundSnap.exists()) {
    const roundData = roundSnap.data() as SusuRound;
    const newRoundNumber = roundData.roundNumber + 1;
    const updatedSlots = roundData.slots.map(slot => ({
      ...slot,
      selfReported: false,
      adminConfirmed: false,
      nextToReceive: false
    }));
    
    await updateDoc(roundRef, {
      roundNumber: newRoundNumber,
      slots: updatedSlots
    });
  }
}

export function exportRoundDataAsCSV(round: SusuRound): string {
  const headers = ["Position", "User Name", "Paid Rounds", "Self Reported", "Admin Confirmed", "Next to Receive"];
  const rows = round.slots.map(slot => [
    slot.position,
    slot.userName,
    slot.paidRounds.join(";"),
    slot.selfReported ? "Yes" : "No",
    slot.adminConfirmed ? "Yes" : "No",
    slot.nextToReceive ? "Yes" : "No"
  ]);
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");
  
  return csvContent;
}
