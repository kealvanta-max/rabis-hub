"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { Check, Clock3, MessageCircle, X } from "lucide-react";

import { db } from "@/lib/firebase";
import { useToastContext } from "@/components/layout/toast-provider";
import ActionButton from "@/components/admin/action-button";
import Badge from "@/components/ui/badge";
import { sortAdvanceRequests, type AdvanceRequest } from "@/lib/savings";
import { formatDate } from "@/lib/utils";

interface AdvanceRequestsPanelProps {
  /** Called whenever the pending count changes, so the tab badge stays honest. */
  onPendingChange?: (count: number) => void;
}

const WA_BASE = "https://wa.me/233504701032";

/**
 * Advance Susu requests.
 *
 * No payment gateway anywhere: a member asks, Rabi decides and settles on
 * Mobile Money / WhatsApp. This screen only makes the decision visible and
 * one tap away, so a request cannot sit unanswered for a week.
 */
export default function AdvanceRequestsPanel({ onPendingChange }: AdvanceRequestsPanelProps) {
  const { addToast } = useToastContext();
  const [requests, setRequests] = useState<AdvanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "advanceRequests"));
      const list = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() } as AdvanceRequest));
      setRequests(sortAdvanceRequests(list));
    } catch {
      addToast("Could not load advance requests.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onPendingChange?.(requests.filter((request) => request.status === "pending").length);
  }, [requests, onPendingChange]);

  const decide = async (request: AdvanceRequest, status: "approved" | "declined") => {
    if (!request.id) return;
    setBusyId(request.id);
    try {
      await updateDoc(doc(db, "advanceRequests", request.id), {
        status,
        decidedAt: serverTimestamp(),
      });
      setRequests((previous) =>
        previous.map((entry) => (entry.id === request.id ? { ...entry, status } : entry))
      );
      addToast(status === "approved" ? "Approved — settle it on Mobile Money." : "Request declined.", "success");
    } catch {
      addToast("Could not update that request.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const decided = useMemo(() => requests.filter((r) => r.status !== "pending"), [requests]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1].map((key) => (
          <div key={key} className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  const Card = ({ request }: { request: AdvanceRequest }) => (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-grotesk text-sm font-semibold text-white">
            {request.userName || "Member"}
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {request.plan || "No plan"} · requested {formatDate(request.createdAt as never)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-grotesk text-base font-semibold text-emerald-300">
            GH₵{request.amount}
          </p>
          <Badge status={request.status === "approved" ? "approved" : request.status === "declined" ? "rejected" : "pending"} />
        </div>
      </div>

      <p className="mt-3 break-words rounded-xl bg-black/25 p-3 text-xs leading-relaxed text-gray-300">
        {request.reason}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <a
          href={`${WA_BASE}?text=${encodeURIComponent(
            `Hello ${request.userName || "member"}, about your advance request of GH₵${request.amount}…`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="sm:w-auto"
        >
          <ActionButton variant="ghost" size="sm" className="w-full gap-1.5 sm:w-auto">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
          </ActionButton>
        </a>
        {request.status === "pending" && (
          <div className="flex gap-2">
            <ActionButton
              variant="danger"
              size="sm"
              className="flex-1 gap-1.5 sm:flex-none"
              loading={busyId === request.id}
              onClick={() => void decide(request, "declined")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Decline
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              className="flex-1 gap-1.5 sm:flex-none"
              loading={busyId === request.id}
              onClick={() => void decide(request, "approved")}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve
            </ActionButton>
          </div>
        )}
      </div>
    </article>
  );

  return (
    <div className="space-y-6">
      <section aria-label="Pending advance requests" className="space-y-3">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="font-grotesk text-sm font-semibold text-white">Waiting on you</h2>
          <span className="text-[11px] uppercase tracking-[0.14em] text-gray-500">
            {pending.length} pending
          </span>
        </header>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500">
            No one is waiting. New requests appear here the moment a member asks.
          </p>
        ) : (
          pending.map((request) => <Card key={request.id} request={request} />)
        )}
      </section>

      {decided.length > 0 && (
        <section aria-label="Decided advance requests" className="space-y-3">
          <header className="flex items-center gap-2">
            <Clock3 className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
            <h2 className="font-grotesk text-sm font-semibold text-gray-300">Already decided</h2>
          </header>
          {decided.map((request) => (
            <Card key={request.id} request={request} />
          ))}
        </section>
      )}
    </div>
  );
}
