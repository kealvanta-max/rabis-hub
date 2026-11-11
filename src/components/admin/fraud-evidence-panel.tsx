"use client";

/**
 * The fraud evidence panel on Rabi's review sheet.
 *
 * This exists because every finding the two-signal rule produces is worthless if
 * it stays in a Firestore field she never opens. The rule itself is deliberately
 * conservative, so the things that reach her here are the ones a machine could
 * not settle: a name that disagrees with the card, a photo that was used before,
 * a selfie that was never taken live, or a card photographed off a screen.
 *
 * Three design rules, all learned from the bugs that led here:
 *
 * 1. **Say what was found, not what it means.** "This picture appears on the
 *    application of another account" is a fact; "fraud" is a conclusion, and the
 *    conclusion is hers to draw.
 * 2. **Never present a flag as a block.** Nothing on this panel prevents her
 *    approving, because machine checks in this app are a screen, not a verdict.
 * 3. **Show the absence too.** If the card could not be locked, or the image
 *    could not be hashed, that is stated, because a blank panel looks like a
 *    clean pass and is the most dangerous thing this component could imply.
 */

import { AlertTriangle, CameraOff, Copy, Fingerprint, MonitorSmartphone, ShieldAlert } from "lucide-react";
import type { UserDoc } from "@/lib/types";

/** Human sentences for the machine-readable signals, in her language. */
const SIGNAL_COPY: Record<string, string> = {
  "name-mismatch": "The name typed on the form does not match the name on the card.",
  "manufactured-template": "The card carries the markings of a manufactured template, not a real document.",
  "duplicate-image": "One of these photos appears on another application.",
  "no-live-capture": "The selfie was not taken live in the app; the camera was not used.",
  "screen-photo": "A photo looks like it was taken of a screen rather than a real document or person.",
  "mrz-invalid": "The card's machine-readable zone did not pass its check digits.",
};

const CAPTURE_COPY: Record<string, string> = {
  "live-camera": "Taken live with the camera.",
  "fallback-no-camera": "Member could not open their camera, so no live photo exists.",
};

export default function FraudEvidencePanel({ user }: { user: UserDoc }) {
  const signals = user.kycRiskSignals ?? [];
  const decision = user.kycRiskDecision;
  const screenPhoto = user.kycScreenPhoto === true;
  const duplicate = user.kycDuplicateOf ?? null;
  const captureMode = user.kycSelfieCaptureMode ?? "";
  const hashes = user.kycPerceptualHashes ?? {};
  const hashCount = Object.keys(hashes).length;

  /*
   * Nothing to say and nothing missing: an ordinary application. Saying so in one
   * quiet line is better than an empty box that could be read as either a clean
   * pass or a failed load.
   */
  const nothingNoticed = signals.length === 0 && !screenPhoto && !duplicate && hashCount > 0;

  if (nothingNoticed && captureMode === "live-camera") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs leading-relaxed text-gray-400">
          No fraud signals were found. This is not a verification: the documents still need your eyes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* The single loudest thing, first, and impossible to miss. */}
      {screenPhoto && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.10] p-4" role="alert">
          <p className="flex items-center gap-2 text-sm font-bold text-red-200">
            <MonitorSmartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
            HIGH FRAUD RISK: screenshot of ID detected
          </p>
          <p className="mt-1 text-xs leading-relaxed text-red-100/90">
            This does not automatically mean fraud. Some members hold only a digital copy of their card.
            Look closely at the edges, the reflections and the portrait printed on the card itself before you approve.
          </p>
        </div>
      )}

      {duplicate && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.07] p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
            This picture was used before
          </p>
          <p className="mt-1 text-xs leading-relaxed text-red-100/90">
            The {duplicate.field} photo matches an earlier application closely enough that it is almost
            certainly the same picture, not merely a similar one. Check whether that account belongs to the
            same person: a spouse sharing a card looks like this, and so does a stolen identity.
          </p>
        </div>
      )}

      {signals.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {decision === "auto-refuse" ? "Would have been refused automatically" : "Flagged for your review"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {signals.map((signal: string) => (
              <li key={signal} className="flex gap-2 text-xs leading-relaxed text-amber-100/90">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
                <span>{SIGNAL_COPY[signal] ?? signal}</span>
              </li>
            ))}
          </ul>
          {user.kycRiskSentence && (
            <p className="mt-2 text-xs leading-relaxed text-amber-100/70">{user.kycRiskSentence}</p>
          )}
        </div>
      )}

      {/* Missing evidence is evidence of a gap, and she needs to know. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
          <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
          Evidence checks
        </p>
        <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
          <div className="flex gap-2">
            <dt className="text-gray-400">Selfie capture:</dt>
            <dd className={captureMode === "live-camera" ? "text-gray-200" : "text-amber-200"}>
              {CAPTURE_COPY[captureMode] ?? "Not recorded (older application or older app version)."}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-400">Duplicate check:</dt>
            <dd className={hashCount > 0 ? "text-gray-200" : "text-amber-200"}>
              {hashCount > 0
                ? `${hashCount} of 3 photos hashed and compared with recent applications.`
                : "Could not be run: the photos could not be reduced to a perceptual hash."}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-400">One card, one account:</dt>
            <dd className={user.kycCardLock ? "text-gray-200" : "text-amber-200"}>
              {user.kycCardLock
                ? "This card is locked to this account."
                : "Not applied: the card number could not be read from the machine-readable zone."}
            </dd>
          </div>
        </dl>
      </div>

      {captureMode === "fallback-no-camera" && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <p className="flex items-center gap-2 text-xs leading-relaxed text-amber-100/90">
            <CameraOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            No live selfie exists for this application. The member could not open a camera, so the face you
            are checking is a photograph of unknown origin. Verify them by video call or in person before
            approving.
          </p>
        </div>
      )}

      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-gray-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          None of this is identity verification. A live deepfake defeats every automatic check in this app.
          The decision is yours, and the notes above say what a machine noticed, not what is true.
        </span>
      </p>
    </div>
  );
}
