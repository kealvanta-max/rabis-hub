"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/*
 * What is working, in Rabi's words.
 *
 * The old panel listed variables that were empty. That is the one failure mode
 * that never actually happened: twice, every variable was present and a member
 * still could not sign up, because a key did not parse and nothing on the screen
 * said so. A list of tick marks is worse than no list, because it looks like
 * proof.
 *
 * So this asks the server to exercise each capability and reports four states:
 *
 *   ready     it works
 *   degraded  it works, with a caveat worth knowing
 *   broken    it cannot work, and here is why
 *   off       deliberately not configured; not a fault
 *
 * Each line carries one sentence and, where there is one, the exact error. No
 * credential is ever in the response.
 */

type CapabilityState = "ready" | "degraded" | "broken" | "off";

interface Capability {
  state: CapabilityState;
  summary: string;
  detail?: string;
  memberImpact?: string;
}

interface HealthPayload {
  status: CapabilityState;
  signupWorks: boolean;
  failing: string[];
  degraded: string[];
  capabilities: Record<string, Capability>;
  build: string;
  checkedAt: string;
}

const LABELS: Record<string, string> = {
  firestore: "Saving applications",
  cloudinary: "Photo uploads",
  cardReader: "Reading the card",
  faceCheck: "Checking a selfie",
  vision: "AI screening",
  email: "Email delivery",
  rateLimiting: "Abuse limits",
};

const ORDER = ["firestore", "cloudinary", "cardReader", "faceCheck", "email", "rateLimiting", "vision"];

const TONE: Record<CapabilityState, { dot: string; text: string; word: string }> = {
  ready: { dot: "bg-emerald-400", text: "text-emerald-300", word: "Working" },
  degraded: { dot: "bg-amber-400", text: "text-amber-300", word: "Partly working" },
  broken: { dot: "bg-red-400", text: "text-red-300", word: "Not working" },
  off: { dot: "bg-gray-400", text: "text-gray-400", word: "Off" },
};

function CapabilityRow({ id, capability }: { id: string; capability: Capability }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[capability.state];
  const label = LABELS[id] ?? id;
  const hasDetail = Boolean(capability.detail || capability.memberImpact);

  return (
    <li className="min-w-0 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((value) => !value)}
        aria-expanded={hasDetail ? open : undefined}
        className={`flex w-full items-start gap-2.5 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold text-white">{label}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${tone.text}`}>
              {tone.word}
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-400">
            {capability.summary}
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 border-t border-white/5 pt-2 pl-[18px]">
          {capability.memberImpact && (
            <p className="text-[11px] leading-relaxed text-gray-400">
              <span className="font-bold text-gray-300">What a member sees: </span>
              {capability.memberImpact}
            </p>
          )}
          {capability.detail && (
            <p className="break-words rounded-lg bg-black/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-gray-400">
              {capability.detail}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function SystemStatus({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const token = await getIdToken();
      const response = await fetch("/api/health", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Health check answered ${response.status}`);
      setHealth((await response.json()) as HealthPayload);
      setState("idle");
    } catch {
      setState("error");
    }
  }, [getIdToken]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * The panel is quiet when everything works. A dashboard that always shows a
   * warning trains the reader to ignore warnings, which is how the last outage
   * survived a day.
   */
  const broken = health ? Object.entries(health.capabilities).filter(([, c]) => c.state === "broken") : [];
  const quiet = health && broken.length === 0 && health.degraded.length === 0;

  if (state === "error") {
    return (
      <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5">
        <h3 className="text-sm font-bold text-red-200">Could not read the system status</h3>
        <p className="mt-1 text-xs text-red-200/70">
          The health check itself did not answer. That usually means the deployment is down rather
          than misconfigured.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-400/30 px-3 py-1.5 text-[11px] font-bold text-red-200"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  if (quiet) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <p className="text-[11px] text-gray-400">
          <span className="font-bold text-emerald-300">Everything working. </span>
          Signup, uploads, card reading and email all answered their own check.
          {health && (
            <span className="text-gray-400">
              {" "}
              Build {health.build}. Checked {new Date(health.checkedAt).toLocaleTimeString()}.
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state === "loading"}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${state === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
          Recheck
        </button>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-amber-200">
            {health?.signupWorks === false ? "Signup cannot complete" : "Setup needs attention"}
          </h3>
          <p className="mt-1 text-xs text-amber-200/70">
            {health?.signupWorks === false
              ? "Until the items marked not working are fixed, a member cannot finish registering."
              : "Signup works. These parts are limited or switched off."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state === "loading"}
          className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-amber-200/80 hover:text-amber-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${state === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
          Recheck
        </button>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(health ? ORDER.filter((id) => health.capabilities[id]) : []).map((id) => (
          <CapabilityRow key={id} id={id} capability={health!.capabilities[id]} />
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-amber-200/60">
        Tap a row for the exact error and what a member sees. Values go in Vercel then Settings then
        Environment Variables, and a redeploy is needed for any change to take effect.
        {health && <span className="text-amber-200/40"> Build {health.build}.</span>}
      </p>
    </div>
  );
}
