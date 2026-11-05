import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  Timestamp,
  getDoc,
} from "firebase/firestore";
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
  planName?: string;
  roundNumber: number;
  status: "active" | "completed";
  cashoutDate: Timestamp;
  momoNumber: string;
  momoName: string;
  slots: SusuRoundSlot[];
  totalSlots: number;
  /** Denormalised list of slot members – lets users query their own rounds cheaply. */
  memberIds?: string[];
  createdAt: Timestamp;
}

export interface NewRoundInput {
  planId: string;
  planName?: string;
  roundNumber?: number;
  cashoutDate: Date | Timestamp;
  momoNumber: string;
  momoName: string;
  totalSlots?: number;
  slots: Array<Partial<SusuRoundSlot> & { userId: string; userName: string }>;
}

function toTimestamp(value: Date | Timestamp | undefined): Timestamp {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Timestamp.fromDate(value);
  }
  return Timestamp.now();
}

function normalizeSlots(slots: NewRoundInput["slots"]): SusuRoundSlot[] {
  return slots
    .filter((slot) => Boolean(slot.userId))
    .map((slot, index) => ({
      userId: slot.userId,
      userName: slot.userName || "Member",
      position: slot.position ?? index + 1,
      paidRounds: Array.isArray(slot.paidRounds) ? slot.paidRounds : [],
      selfReported: slot.selfReported ?? false,
      adminConfirmed: slot.adminConfirmed ?? false,
      nextToReceive: slot.nextToReceive ?? index === 0,
      payoutConfirmed: slot.payoutConfirmed ?? false,
    }))
    .sort((a, b) => a.position - b.position)
    .map((slot, index) => ({ ...slot, position: index + 1 }));
}

export async function createRound(data: NewRoundInput) {
  const slots = normalizeSlots(data.slots);
  const payload = {
    planId: data.planId,
    planName: data.planName || data.planId,
    roundNumber: data.roundNumber ?? 1,
    status: "active" as const,
    cashoutDate: toTimestamp(data.cashoutDate),
    momoNumber: data.momoNumber,
    momoName: data.momoName,
    slots,
    totalSlots: data.totalSlots ?? slots.length,
    memberIds: Array.from(new Set(slots.map((slot) => slot.userId))),
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, "susu-rounds"), payload);
  return docRef.id;
}

/**
 * Returns every active round the given user has a slot in.
 * Includes rounds created before `memberIds` existed.
 */
export async function getUserRounds(userId: string): Promise<SusuRound[]> {
  const rounds: SusuRound[] = [];
  const seen = new Set<string>();

  const push = (id: string, data: Record<string, unknown>) => {
    if (seen.has(id)) return;
    const round = { id, ...data } as SusuRound;
    if (!Array.isArray(round.slots)) return;
    if (!round.slots.some((slot) => slot.userId === userId)) return;
    seen.add(id);
    rounds.push(round);
  };

  try {
    const memberQuery = query(
      collection(db, "susu-rounds"),
      where("memberIds", "array-contains", userId)
    );
    const memberSnap = await getDocs(memberQuery);
    memberSnap.docs.forEach((d) => push(d.id, d.data()));
  } catch (error) {
    console.error("memberIds lookup failed, falling back to slot scan:", error);
  }

  // Fallback / legacy rounds (also covers projects where the field is absent).
  try {
    const activeQuery = query(collection(db, "susu-rounds"), where("status", "==", "active"));
    const activeSnap = await getDocs(activeQuery);
    activeSnap.docs.forEach((d) => push(d.id, d.data()));
  } catch (error) {
    console.error("Active rounds lookup failed:", error);
  }

  return rounds
    .filter((round) => round.status === "active")
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function getActiveRounds(): Promise<SusuRound[]> {
  // No orderBy here on purpose: status + orderBy(createdAt) needs a composite
  // index, which made the admin payments page silently return nothing before.
  const snapshot = await getDocs(query(collection(db, "susu-rounds"), where("status", "==", "active")));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as SusuRound))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function reportPayment(
  roundId: string,
  userId: string,
  userName: string,
  amount: number,
  momoRef?: string
) {
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);

  if (!roundSnap.exists()) {
    throw new Error("This Susu round no longer exists. Please refresh the page.");
  }

  const roundData = roundSnap.data() as SusuRound;
  const slots = Array.isArray(roundData.slots) ? roundData.slots : [];
  if (!slots.some((slot) => slot.userId === userId)) {
    throw new Error("You are not a member of this Susu round.");
  }

  const reportRef = await addDoc(collection(db, "payment-reports"), {
    roundId,
    userId,
    userName,
    amount: Number(amount) || 0,
    momoRef: momoRef || "",
    roundNumber: roundData.roundNumber ?? 1,
    reportedAt: Timestamp.now(),
    confirmed: false,
  });

  const updatedSlots = slots.map((slot) =>
    slot.userId === userId ? { ...slot, selfReported: true } : slot
  );
  await updateDoc(roundRef, { slots: updatedSlots });

  return reportRef.id;
}

export async function confirmPayment(
  roundId: string,
  reportId: string | null,
  adminId: string,
  currentRoundNumber: number,
  forceUserId?: string
) {
  let targetUserId = forceUserId;

  if (reportId) {
    const reportRef = doc(db, "payment-reports", reportId);
    await updateDoc(reportRef, {
      confirmed: true,
      confirmedAt: Timestamp.now(),
      confirmedBy: adminId,
    });
    const reportSnap = await getDoc(reportRef);
    if (reportSnap.exists()) targetUserId = reportSnap.data().userId;
  }

  if (!targetUserId) return;

  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  if (!roundSnap.exists()) return;

  const roundData = roundSnap.data() as SusuRound;
  const slots = (roundData.slots || []).map((slot) => {
    if (slot.userId !== targetUserId) return slot;
    const paidRounds = slot.paidRounds || [];
    return {
      ...slot,
      selfReported: false,
      adminConfirmed: true,
      paidRounds: paidRounds.includes(currentRoundNumber)
        ? paidRounds
        : [...paidRounds, currentRoundNumber],
    };
  });

  await updateDoc(roundRef, { slots });
}

export async function confirmPayout(roundId: string, userId: string) {
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  if (!roundSnap.exists()) return;

  const roundData = roundSnap.data() as SusuRound;
  const slots = (roundData.slots || []).map((slot) =>
    slot.userId === userId ? { ...slot, payoutConfirmed: true } : slot
  );
  await updateDoc(roundRef, { slots });
}

export async function advanceRound(roundId: string): Promise<void> {
  const roundRef = doc(db, "susu-rounds", roundId);
  const roundSnap = await getDoc(roundRef);
  if (!roundSnap.exists()) return;

  const roundData = roundSnap.data() as SusuRound;
  const newRoundNumber = (roundData.roundNumber || 1) + 1;
  const totalSlots = roundData.totalSlots || (roundData.slots?.length ?? 0);

  if (newRoundNumber > totalSlots) {
    await updateDoc(roundRef, { status: "completed" });
    return;
  }

  const updatedSlots = (roundData.slots || []).map((slot) => ({
    ...slot,
    selfReported: false,
    adminConfirmed: false,
    nextToReceive: slot.position === newRoundNumber,
  }));

  await updateDoc(roundRef, { roundNumber: newRoundNumber, slots: updatedSlots });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function exportRoundDataAsCSV(round: SusuRound): string {
  const headers = [
    "Position",
    "User Name",
    "Paid Rounds",
    "Self Reported",
    "Admin Confirmed",
    "Next to Receive",
    "Payout Confirmed",
  ];
  const rows = (round.slots || []).map((slot) => [
    slot.position,
    slot.userName,
    (slot.paidRounds || []).join(";"),
    slot.selfReported ? "Yes" : "No",
    slot.adminConfirmed ? "Yes" : "No",
    slot.nextToReceive ? "Yes" : "No",
    slot.payoutConfirmed ? "Yes" : "No",
  ]);
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

export interface PaymentReport {
  id: string;
  roundId: string;
  userId: string;
  userName: string;
  amount: number;
  momoRef?: string;
  roundNumber?: number;
  reportedAt: Timestamp;
  confirmed: boolean;
  confirmedAt?: Timestamp;
  confirmedBy?: string;
}

/** Payment reports submitted by one member (newest first). */
export async function getUserPaymentReports(userId: string): Promise<PaymentReport[]> {
  const snapshot = await getDocs(query(collection(db, "payment-reports"), where("userId", "==", userId)));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as PaymentReport))
    .sort((a, b) => (b.reportedAt?.toMillis?.() ?? 0) - (a.reportedAt?.toMillis?.() ?? 0));
}

/** Every payment report still waiting for an admin decision (newest first). */
export async function getPendingReports(): Promise<PaymentReport[]> {
  const snapshot = await getDocs(
    query(collection(db, "payment-reports"), where("confirmed", "==", false))
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as PaymentReport))
    .sort((a, b) => (b.reportedAt?.toMillis?.() ?? 0) - (a.reportedAt?.toMillis?.() ?? 0));
}
