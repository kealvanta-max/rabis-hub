export interface VisionSignals {
  subject: "human_face" | "non_human_or_no_face" | "uncertain";
  card: "looks_like_ghana_card" | "not_ghana_card" | "uncertain";
  face_match: "consistent" | "not_consistent" | "uncertain";
  reproduction: "photo_of_original" | "screen_or_copy" | "uncertain";
  confidence: number;
}

export interface VisionDecision {
  state: "screened_pass" | "rejected" | "manual_review_required";
  reasons: string[];
}

/** Pure decision policy: visual screening can flag only unequivocal, high-confidence negatives. */
export function classifyVisionSignals(signals: VisionSignals): VisionDecision {
  const redFlags: string[] = [];
  if (signals.subject === "non_human_or_no_face") redFlags.push("no-human-face-signal");
  if (signals.card === "not_ghana_card") redFlags.push("document-appearance-mismatch");
  if (signals.face_match === "not_consistent") redFlags.push("face-consistency-mismatch");
  if (signals.reproduction === "screen_or_copy") redFlags.push("possible-screen-or-copy");
  const uncertain = signals.subject === "uncertain" || signals.card === "uncertain" ||
    signals.face_match === "uncertain" || signals.reproduction === "uncertain" || signals.confidence < 0.85;

  if (redFlags.length > 0 && !uncertain) return { state: "rejected", reasons: redFlags };
  if (uncertain || redFlags.length > 0) {
    return { state: "manual_review_required", reasons: [...redFlags, "vision-uncertain-human-review"] };
  }
  return { state: "screened_pass", reasons: ["visual-screening-signals-clear-human-review-required"] };
}
