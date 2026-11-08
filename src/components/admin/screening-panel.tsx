"use client";

import { AlertTriangle, Bot, CheckCircle2, Cpu, HelpCircle, ShieldX, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VisionScreeningRecord } from "@/lib/types";

/**
 * What the AI screening thought, in Rabi's language.
 *
 * The whole KYC pipeline routes uncertain applications here, so this panel is
 * the only place that decision becomes actionable. Three rules shaped it:
 *
 * 1. Never show a raw state token. "verification_unavailable" tells a reviewer
 *    nothing about whether to trust the photos; "We could not check this one"
 *    plus the reason does.
 * 2. Never imply the AI approved anyone. The strongest positive state is still
 *    "check by eye", because the model's job is to filter obvious fraud, not to
 *    issue identity.
 * 3. Always show the evidence behind the verdict. A reviewer who disagrees with
 *    a rejection needs the individual answers (is there a face, does the selfie
 *    match, does the card look real) to see which one was wrong.
 */

const SIGNAL_LABELS: Record<string, string> = {
  subject: "What is in the selfie",
  card: "Ghana Card authenticity",
  face_match: "Selfie vs photo on the card",
  reproduction: "Photo of a screen or print",
};

const SIGNAL_VALUES: Record<string, Record<string, { text: string; tone: "good" | "warn" | "bad" }>> = {
  subject: {
    human_face: { text: "A person's face", tone: "good" },
    non_human_or_no_face: { text: "Not a human face", tone: "bad" },
    uncertain: { text: "Could not tell", tone: "warn" },
  },
  card: {
    looks_like_ghana_card: { text: "Looks like a real Ghana Card", tone: "good" },
    not_ghana_card: { text: "Not a genuine Ghana Card", tone: "bad" },
    uncertain: { text: "Could not tell", tone: "warn" },
    not_present: { text: "No card in the photo", tone: "warn" },
  },
  face_match: {
    consistent: { text: "Matches", tone: "good" },
    not_consistent: { text: "Does not match", tone: "bad" },
    uncertain: { text: "Could not tell", tone: "warn" },
    not_present: { text: "Nothing to compare", tone: "warn" },
  },
  reproduction: {
    photo_of_original: { text: "A real photo", tone: "good" },
    screen_or_copy: { text: "A screen or a copy", tone: "bad" },
    uncertain: { text: "Could not tell", tone: "warn" },
  },
};

/** Reasons arrive as machine tokens; show a sentence instead. */
const REASON_TEXT: Record<string, string> = {
  "not-a-human-face": "The selfie does not contain a human face.",
  "screen-or-copy": "The photo looks like a picture of a screen or a printed copy, not a real document.",
  "face-does-not-match": "The selfie does not match the face printed on the Ghana Card.",
  "not-a-ghana-card": "The document does not look like a genuine Ghana Card.",
  "card-unreadable": "The card photo is too blurred or glaring to read.",
  "screening-uncertain": "The check could not reach a confident answer.",
  "manual-review-required": "The check was inconclusive, so it is with you.",
  "vision-provider-not-configured": "No AI provider is configured, so nothing was checked.",
  "vision-provider-unavailable": "Every AI provider failed to respond.",
  "vision-provider-quota-exhausted": "The free AI quota ran out before this application.",
  "vision-provider-credentials-rejected": "The AI provider rejected our key.",
  "vision-provider-unreadable-answer": "The AI replied with something we could not use.",
  "visual-screening-clear-human-review-still-required":
    "The photos passed the visual check. The AI cannot prove identity, so still compare them.",
};

const REASON_SUBSTRINGS: { match: RegExp; text: string }[] = [
  { match: /not-a-human|non_human/i, text: REASON_TEXT["not-a-human-face"] },
  { match: /screen_or_copy|screen-or-copy/i, text: REASON_TEXT["screen-or-copy"] },
  { match: /face.?match|not_consistent/i, text: REASON_TEXT["face-does-not-match"] },
  { match: /ghana.?card|not_ghana_card/i, text: REASON_TEXT["not-a-ghana-card"] },
  { match: /quota|rate.?limit|429/i, text: REASON_TEXT["vision-provider-quota-exhausted"] },
  { match: /credential|401|403|unauthor/i, text: REASON_TEXT["vision-provider-credentials-rejected"] },
  { match: /unreadable|parse/i, text: REASON_TEXT["vision-provider-unreadable-answer"] },
  { match: /unavailable|timeout|abort|not-configured/i, text: REASON_TEXT["vision-provider-unavailable"] },
];

function describeReason(reason: string) {
  const direct = REASON_TEXT[reason];
  if (direct) return direct;
  const partial = REASON_SUBSTRINGS.find((entry) => entry.match.test(reason));
  if (partial) return partial.text;
  // A token we have not seen before is still better than nothing, but strip the
  // dashes so it reads as words rather than a variable name.
  return reason.replace(/[-_]+/g, " ");
}

const STATE_PRESENTATION = {
  screened_pass: {
    title: "Photos passed the visual check",
    body: "Nothing obviously fraudulent was found. The AI cannot confirm identity, so approve only after you have looked at the photos yourself.",
    icon: CheckCircle2,
    ring: "ring-emerald-500/25",
    bg: "bg-emerald-500/[0.07]",
    text: "text-emerald-200",
  },
  manual_review_required: {
    title: "Held for your review",
    body: "The check could not confirm this application either way. That is a normal outcome for a blurry photo or a new pose, not proof of fraud.",
    icon: HelpCircle,
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/[0.08]",
    text: "text-amber-200",
  },
  verification_unavailable: {
    title: "No AI check was possible",
    body: "The screening service did not answer. This is our failure, not the member's. Decide on the photos alone.",
    icon: WifiOff,
    ring: "ring-sky-500/25",
    bg: "bg-sky-500/[0.07]",
    text: "text-sky-200",
  },
  rejected: {
    title: "Failed the automated check",
    body: "A submission in this state should not have reached you: it is refused before it is saved. If you are seeing one, the record predates that rule.",
    icon: ShieldX,
    ring: "ring-red-500/30",
    bg: "bg-red-500/[0.08]",
    text: "text-red-200",
  },
} as const;

export default function ScreeningPanel({ record }: { record?: VisionScreeningRecord | null }) {
  if (!record) {
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">AI screening</p>
        <p className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-gray-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          This application has no AI screening record. It was probably submitted before screening
          existed, or storage refused the upload. Compare the documents below by eye.
        </p>
      </section>
    );
  }

  const presentation = STATE_PRESENTATION[record.state] ?? STATE_PRESENTATION.verification_unavailable;
  const Icon = presentation.icon;
  const signals = record.signals ?? {};
  const reasons = (record.reasons ?? []).filter(Boolean);

  return (
    <section
      aria-label="AI screening"
      className={cn("rounded-2xl p-4 ring-1 ring-inset", presentation.bg, presentation.ring)}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", presentation.text)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold", presentation.text)}>{presentation.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-300">{presentation.body}</p>

          {reasons.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {reasons.map((reason) => (
                <li key={reason} className="flex gap-1.5 text-xs leading-relaxed text-gray-300">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                  <span className="min-w-0">{describeReason(reason)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* The individual answers, so a disagreement can be located. */}
          {Object.keys(SIGNAL_LABELS).some((key) => signals[key as keyof typeof signals]) && (
            <dl className="mt-3 grid grid-cols-1 gap-1.5 border-t border-white/[0.07] pt-3 sm:grid-cols-2">
              {Object.entries(SIGNAL_LABELS).map(([key, label]) => {
                const raw = signals[key as keyof typeof signals];
                if (!raw) return null;
                const value = SIGNAL_VALUES[key]?.[raw];
                return (
                  <div key={key} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-[10px] uppercase tracking-wider text-gray-400">{label}</dt>
                    <dd
                      className={cn(
                        "text-xs font-medium",
                        value?.tone === "good" && "text-emerald-300",
                        value?.tone === "warn" && "text-amber-300",
                        value?.tone === "bad" && "text-red-300",
                        !value && "text-gray-300"
                      )}
                    >
                      {value?.text ?? String(raw).replace(/_/g, " ")}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}

          {/* Provenance: which service answered, and did it need to fail over. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.07] pt-2.5 text-[10px] text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Bot className="h-3 w-3" aria-hidden="true" />
              {record.provider ? `${record.provider}${record.model ? ` · ${record.model}` : ""}` : "no provider answered"}
            </span>
            {typeof record.signals?.confidence === "number" && (
              <span>confidence {Math.round(record.signals.confidence * 100)}%</span>
            )}
            {(record.attempts?.length ?? 0) > 1 && (
              <span className="inline-flex items-center gap-1 text-amber-400/80">
                <Cpu className="h-3 w-3" aria-hidden="true" />
                {record.attempts?.length} providers tried
              </span>
            )}
            {typeof record.durationMs === "number" && <span>{(record.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
