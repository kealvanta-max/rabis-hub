import { collection, addDoc, doc, updateDoc, getDocs, query, where, Timestamp, getDoc, orderBy } from "firebase/firestore";
import { db } from "./firebase";

export interface SusuRoundSlot {
  userId: string;
  userName: string;
  position: number;
  paidRounds: number[];
  selfReported: boolean;
  adminConfirmed: boolean;
  nextToReceive: boolean;
  payoutConfirmed: boolean;
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

export async function createRound(data: Omit<SusuRound, "id" | "createdAt">) {
  const docRef = await addDoc(collection(db, "susu-rounds"), { ...data, createdAt: Timestamp.now() });
  return docRef.id;
}

export async function reportPayment(roundId: string, userId: string, userName: string, amount: number, momoRef?: string) {
  const reportRef = await addDoc(collection(db, "payment-reports"), { roundId, userId, userName, amount, momoRef, reportedAt: Timestamp.now(), confirmed: false });
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  if (roundSnap.exists()) {
    const roundData = roundSnap.data() as SusuRound;
    const slots = roundData.slots.map(slot => slot.userId === userId ? { ...slot, selfReported: true } : slot);
    await updateDoc(roundRef, { slots });
  }
  return reportRef.id;
}

export async function confirmPayment(roundId: string, reportId: string | null, adminId: string, currentRoundNumber: number, forceUserId?: string) {
  let targetUserId = forceUserId;
  if (reportId) {
    const reportRef = doc(db, "payment-reports", reportId);
    await updateDoc(reportRef, { confirmed: true, confirmedAt: Timestamp.now(), confirmedBy: adminId });
    const reportSnap = await getDoc(reportRef);
    if (reportSnap.exists()) targetUserId = reportSnap.data().userId;
  }
  if (!targetUserId) return;
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  if (roundSnap.exists()) {
    const roundData = roundSnap.data() as SusuRound;
    const slots = roundData.slots.map(slot => slot.userId === targetUserId ? { ...slot, selfReported: false, adminConfirmed: true, paidRounds: slot.paidRounds.includes(currentRoundNumber) ? slot.paidRounds : [...slot.paidRounds, currentRoundNumber] } : slot);
    await updateDoc(roundRef, { slots });
  }
}

export async function confirmPayout(roundId: string, userId: string) {
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  if (roundSnap.exists()) {
    const roundData = roundSnap.data() as SusuRound;
    const slots = roundData.slots.map(slot => slot.userId === userId ? { ...slot, payoutConfirmed: true } : slot);
    await updateDoc(roundRef, { slots });
  }
}

export async function getActiveRounds(): Promise<SusuRound[]> {
  const q = query(collection(db, "susu-rounds"), where("status", "==", "active"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SusuRound));
}

export async function advanceRound(roundId: string): Promise<void> {
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  if (roundSnap.exists()) {
    const roundData = roundSnap.data() as SusuRound;
    const newRoundNumber = roundData.roundNumber + 1;
    if (newRoundNumber > roundData.totalSlots) {
      await updateDoc(roundRef, { status: "completed" });
      return;
    }
    const updatedSlots = roundData.slots.map(slot => ({ ...slot, selfReported: false, adminConfirmed: false, nextToReceive: slot.position === newRoundNumber }));
    await updateDoc(roundRef, { roundNumber: newRoundNumber, slots: updatedSlots });
  }
}

export function exportRoundDataAsCSV(round: SusuRound): string {
  const headers = ["Position", "User Name", "Paid Rounds", "Self Reported", "Admin Confirmed", "Next to Receive", "Payout Confirmed"];
  const rows = round.slots.map(slot => [slot.position, slot.userName, slot.paidRounds.join(";"), slot.selfReported ? "Yes" : "No", slot.adminConfirmed ? "Yes" : "No", slot.nextToReceive ? "Yes" : "No", slot.payoutConfirmed ? "Yes" : "No"]);
  return [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
}
