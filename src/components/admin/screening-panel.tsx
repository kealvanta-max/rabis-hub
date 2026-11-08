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

  /* Deterministic checks: facts about the pixels, not opinions. */
  "no-human-skin-in-frame": "There is no person in the selfie slot. Nothing in the frame is human skin.",
  "face-region-flat-no-facial-structure": "The 'face' region is flat and featureless, like a wall or a blank sheet.",
  "face-region-no-light-and-shadow": "The 'face' region has no light or shadow of features.",
  "subject-indistinct-from-background": "The subject is the same tone as the wall behind it, like paper taped to a wall.",
  "card-not-landscape": "The photo in a card slot is portrait, so it is not a card.",
  "card-not-card-shaped": "That photo is not the shape of a card.",
  "card-region-too-dark": "The card slot is too dark to be a card on a desk.",
  "card-no-printed-content": "The card slot is a flat, featureless area with no printing on it.",
  "card-not-flat-lit-document": "The card slot does not look like a lit document.",
  "no-machine-readable-zone-found": "The back of the card has no machine-readable strip.",
  "no-text-found-on-card-back": "Nothing readable was found on the back of the card.",
  "mrz-issuer-gha-and-icao-checks-passed":
    "The strip on the back is a Ghana Card strip and its check digits all prove it was read correctly.",
  "typed-pin-matches-mrz": "The card number the member typed matches the number on the card.",
  "typed-pin-does-not-match-mrz":
    "The number the member typed does not match the card in the photos. Check this by hand.",
  "ocr-engine-unavailable": "The card reader did not load on this server, so the card was not read.",
  "card-bytes-unavailable": "The card image could not be downloaded to read it.",
  "selfie-pixels-unavailable": "The selfie pixels could not be retrieved to judge.",
  "pin-comparison-not-possible": "The card number could not be compared, because the strip was unreadable.",
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
  { match: /skin/i, text: REASON_TEXT["no-human-skin-in-frame"] },
  { match: /face-region/i, text: REASON_TEXT["face-region-flat-no-facial-structure"] },
  { match: /not-landscape|not-card-shaped/i, text: REASON_TEXT["card-not-landscape"] },
  { match: /mrz-check-digit-uncertain/i, text: REASON_TEXT["no-text-found-on-card-back"] },
  { match: /pin-does-not-match/i, text: REASON_TEXT["typed-pin-does-not-match-mrz"] },
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

/**
 * What the deterministic checks established, in Rabi's language.
 *
 * These are separate from the AI verdict on purpose. They are facts about the
 * bytes — is there a person in the selfie, does the strip on the card carry a
 * Ghana issuer and valid ICAO check digits, does the card agree with the number
 * the member typed — and unlike a model's opinion they do not need interpreting.
 *
 * Shown first, above the AI panel, because a fact should not be read through an
 * opinion.
 */
export function DeterministicPanel({
  checks,
}: {
  checks?: Record<string, { status?: string; reasons?: string[]; detail?: Record<string, unknown> }> | null;
}) {
  if (!checks || Object.keys(checks).length === 0) return null;

  const tone = (status?: string) =>
    status === "pass"
      ? "text-emerald-300"
      : status === "fail"
      ? "text-red-300"
      : status === "unavailable"
      ? "text-gray-400"
      : "text-amber-300";

  const heading = (status?: string) =>
    status === "pass" ? "Passed" : status === "fail" ? "Failed" : status === "unavailable" ? "Could not run" : "Unclear";

  const label = (key: string) =>
    key
      .replace(/^selfie-/, "Selfie: ")
      .replace(/^card-geometry-front$/, "Card front shape")
      .replace(/^card-geometry-back$/, "Card back shape")
      .replace(/^card-mrz$/, "Card back strip")
      .replace(/^card-pin$/, "Typed number vs card")
      .replace(/-/g, " ");

  const anyFail = Object.values(checks).some((check) => check?.status === "fail");

  return (
    <section
      aria-label="Deterministic screening"
      className={cn(
        "rounded-2xl p-4 ring-1 ring-inset",
        anyFail ? "bg-red-500/[0.08] ring-red-500/30" : "bg-white/[0.025] ring-white/[0.07]"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        Document checks (no AI)
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        These were measured from the uploaded files themselves. They do not depend on any AI provider.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {Object.entries(checks).map(([key, check]) => (
          <li key={key} className="text-xs leading-relaxed">
            <span className="text-gray-300">{label(key)}: </span>
            <span className={cn("font-medium", tone(check?.status))}>{heading(check?.status)}</span>
            {(check?.reasons ?? []).length > 0 && (
              <ul className="mt-0.5 space-y-0.5 pl-3">
                {(check?.reasons ?? []).map((reason) => (
                  <li key={reason} className="flex gap-1.5 text-gray-400">
                    <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                    <span className="min-w-0">{describeReason(reason)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
