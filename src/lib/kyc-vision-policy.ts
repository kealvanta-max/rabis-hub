/**
 * KYC vision policy: the decision table, kept pure so it can be tested.
 *
 * The old policy had a structural hole. It required *every* signal to be
 * certain before it would reject, so a photo of a dog was rejected only if the
 * model was also certain about the card, the face match and the reproduction
 * at the same time. In practice the card was "uncertain" (it was never shown),
 * so a dog reached the human review queue instead of being refused. Rabi then
 * had to reject by hand what a machine should have refused in four seconds.
 *
 * This rewrite separates the two questions that were being conflated:
 *
 *   1. Is there a human in this selfie at all?     -> HARD GATE
 *   2. Does everything else agree?                  -> soft signal
 *
 * A selfie question is answered by looking at ONE image, so uncertainty there
 * is not innocent: if a model cannot find a human face in a photo that claims
 * to be a face, it is not a face photo. That is a rejection, not a review.
 * Card and face-match signals need two images compared, where uncertainty is
 * genuinely normal (glare, low light, an old portrait), so those still defer to
 * Rabi instead of blocking a real member.
 */

export type SubjectVerdict = "human_face" | "non_human_or_no_face" | "uncertain";
export type CardVerdict = "looks_like_ghana_card" | "not_ghana_card" | "uncertain";
export type FaceMatchVerdict = "consistent" | "not_consistent" | "uncertain";
export type ReproductionVerdict = "photo_of_original" | "screen_or_copy" | "uncertain";

export interface VisionSignals {
  subject: SubjectVerdict;
  card: CardVerdict;
  face_match: FaceMatchVerdict;
  reproduction: ReproductionVerdict;
  /** 0–1. How sure the model is about the signals above. */
  confidence: number;
}

export type ScreeningState =
  | "screened_pass"
  | "rejected"
  | "manual_review_required"
  | "verification_unavailable";

export interface VisionDecision {
  state: Exclude<ScreeningState, "verification_unavailable">;
  reasons: string[];
}

/** Confidence below this is treated as "do not decide automatically". */
export const DECISION_CONFIDENCE = 0.75;
/**
 * The selfie gate is deliberately easier to trip than a card decision: a
 * confident "no human here" at 0.7 rejects, because a false rejection costs a
 * retake while a false acceptance costs money.
 */
export const SUBJECT_CONFIDENCE = 0.7;

const isCertain = (confidence: number, floor = DECISION_CONFIDENCE) =>
  Number.isFinite(confidence) && confidence >= floor;

/**
 * What the model was asked to look at.
 *
 * - `full`   all three images: subject, card, face match, reproduction.
 * - `selfie` only the selfie, screened the moment it is uploaded so a member
 *            gets an answer in seconds instead of after filling in five steps.
 *
 * With `selfie` scope the card and face-match fields are *not* part of the
 * decision. Treating them as "uncertain" would be a bug: nobody asked, so their
 * silence carries no information.
 */
export type ScreeningScope = "full" | "selfie";

/**
 * The decision table.
 *
 * Order matters: the hard gates come first, because a clear "this is not a
 * person" or "this is a picture of a screen" must never be softened by a
 * well-lit card that the model happens to like.
 */
export function classifyVisionSignals(
  signals: VisionSignals,
  scope: ScreeningScope = "full"
): VisionDecision {
  const confidence = Number(signals.confidence);
  const full = scope === "full";
  const certain = isCertain(confidence);
  const subjectCertain = isCertain(confidence, SUBJECT_CONFIDENCE);

  /* ---------------------------------------------------------- hard gates */
  /*
   * 1. No human. A dog, a cartoon, a landscape, a screenshot of a face. The
   *    model is looking at one image to answer one question, so "uncertain"
   *    is only acceptable when confidence is too low to act on at all.
   */
  if (signals.subject === "non_human_or_no_face" && subjectCertain) {
    return { state: "rejected", reasons: ["not-a-human-face"] };
  }

  /*
   * 2. The selfie is a photograph of a screen, a printout, or a photocopy.
   *    This is the classic replay attack: point the camera at a photo on
   *    another phone. A still image can never prove liveness, but it can prove
   *    the *absence* of a live subject, and that is enough to refuse.
   */
  if (signals.reproduction === "screen_or_copy" && certain) {
    return { state: "rejected", reasons: ["photo-of-a-screen-or-copy"] };
  }

  /*
   * 3. The selfie is clearly not the person on the card. Identity fraud, not a
   *    bad photo. Uncertain face matches are handled further down.
   */
  if (full && signals.face_match === "not_consistent" && certain) {
    return { state: "rejected", reasons: ["selfie-does-not-match-the-card"] };
  }

  /*
   * 4. The document is clearly not a Ghana Card: a student ID, a bank card, a
   *    blank sheet, a screenshot of a text message.
   */
  if (full && signals.card === "not_ghana_card" && certain) {
    return { state: "rejected", reasons: ["not-a-ghana-card"] };
  }

  /* ------------------------------------------------- soft signals -> Rabi */
  const review: string[] = [];
  if (signals.subject === "uncertain") review.push("selfie-subject-unclear");
  if (full) {
    if (signals.card === "uncertain") review.push("card-appearance-unclear");
    if (signals.face_match === "uncertain") review.push("face-match-unclear");
    if (signals.reproduction === "uncertain") review.push("reproduction-unclear");
  }
  if (!certain && review.length === 0) review.push("vision-low-confidence");

  if (review.length > 0) {
    return { state: "manual_review_required", reasons: [...review, "human-review-required"] };
  }

  /*
   * Every signal was positive and confident. This is still not proof of
   * identity or liveness: it is a clean screening result that human review can
   * trust a little more. The reason string says so, and the admin UI repeats it.
   */
  return {
    state: "screened_pass",
    reasons: ["visual-screening-clear-human-review-still-required"],
  };
}

/** A member-facing sentence for each rejection, used by the API and the UI. */
export const REJECTION_MESSAGES: Record<string, string> = {
  "not-a-human-face":
    "Your selfie must show a real person's face. We could not find a human face in that photo. Photos of animals, cartoons, objects or screens cannot be used.",
  "photo-of-a-screen-or-copy":
    "That selfie looks like a photo of a screen or a printed copy. Take the selfie live, with the camera, not a picture of a picture.",
  "selfie-does-not-match-the-card":
    "The face in your selfie does not appear to match the photo on your Ghana Card. Use your own card and take the selfie in good light.",
  "not-a-ghana-card":
    "We could not recognise a Ghana Card in that photo. Photograph the front and back of your own Ghana Card, flat and in focus.",
  "detector-unavailable":
    "We could not check that selfie. Take it again with the camera, in good light, and make sure your whole face is in the frame.",
};

export function rejectionMessage(reasons: string[]): string {
  for (const reason of reasons) {
    const message = REJECTION_MESSAGES[reason];
    if (message) return message;
  }
  return "We could not accept those photos. Please take them again with the camera, in good light.";
}
