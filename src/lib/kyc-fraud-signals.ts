/**
 * The rule that decides whether a card submission is refused or sent to Rabi.
 *
 * The rule, stated once, in the owner's words
 * -------------------------------------------
 * A name that does not match the card is **not** evidence of fraud. It is the
 * single most common thing a genuine Ghanaian applicant does: a married name on
 * the card and a maiden name typed, a middle name dropped, `Mensah-Bonsu`
 * against `MENSAH BONSU`, a Kweku who writes his Sunday name. Refusing on that
 * basis would turn away real members by the dozen and, worse, it would do so
 * silently — the member would just be told no.
 *
 * So a mismatch alone routes to Rabi with a flag. It becomes an automatic
 * refusal only when it arrives **together with a second, independent signal**
 * that the evidence itself is manufactured:
 *
 *     name mismatch  AND  ( manufactured template
 *                        OR duplicate image
 *                        OR no live capture )
 *
 * That is deliberate symmetry. Any single signal can be a mistake, a bad
 * camera, or a coincidence. Two unrelated signals pointing the same way is the
 * pattern a fraud ring produces and an honest member does not.
 *
 * This module is pure. It takes facts other modules already established and
 * returns a decision with its reasons attached. It performs no I/O, reads no
 * clock, and never touches Firestore, so the rule can be tested exhaustively
 * and reviewed without running a signup.
 */

/** The facts this rule consumes. Every one is optional: absence is not guilt. */
export interface CardRiskEvidence {
  /**
   * Result of comparing the typed legal name with the name in the MRZ.
   *
   * `inconclusive` is not `mismatch`: an unreadable card must never be treated
   * as a disagreement, or a member with a scratched card is penalised for it.
   */
  nameMatch?: "match" | "partial" | "mismatch" | "inconclusive";
  /** True when the card carried the marks of a manufactured template. */
  templateDetected?: boolean;
  /**
   * True when a perceptual hash of this submission matched an earlier one.
   *
   * `false` and `undefined` are different: `false` means "we hashed it and it
   * is new", `undefined` means "we could not hash it". Only the first is
   * evidence that the image is original.
   */
  duplicateImage?: boolean;
  /** True when the evidence was captured through a live camera this session. */
  liveCapture?: boolean;
  /** True when vision said the evidence looks like a photo of a screen. */
  screenPhoto?: boolean;
  /** True when the MRZ failed its ICAO check digits. */
  mrzInvalid?: boolean;
}

export type CardRiskDecision = "accept-for-review" | "flag-for-review" | "auto-refuse";

export type CardRiskSignal =
  | "name-mismatch"
  | "manufactured-template"
  | "duplicate-image"
  | "no-live-capture"
  | "screen-photo"
  | "mrz-invalid";

export interface CardRiskAssessment {
  decision: CardRiskDecision;
  /** Machine-readable signals that fired, in a stable order. */
  signals: CardRiskSignal[];
  /**
   * The signals that justify the decision itself. For `auto-refuse` these are
   * exactly the two (or more) that combined; for the others it is the single
   * signal being escalated, so Rabi is never told "flagged" without being told
   * why.
   */
  because: CardRiskSignal[];
  /** One sentence for Rabi, in plain language. Never shown as a rejection. */
  sentence: string;
}

/** Reasons that justify refusing without a second signal. */
const SELF_SUFFICIENT: CardRiskSignal[] = ["manufactured-template"];

/**
 * Signals that count as the "second" in the two-signal rule.
 *
 * `manufactured-template` is deliberately absent: a detected template is
 * conclusive on its own and does not need a mismatch to accompany it. Everything
 * else here is suggestive alone and decisive only in combination.
 */
const CORROBORATING: CardRiskSignal[] = [
  "name-mismatch",
  "duplicate-image",
  "no-live-capture",
  "mrz-invalid",
];

const LABEL: Record<CardRiskSignal, string> = {
  "name-mismatch": "the name does not match the card",
  "manufactured-template": "the card is a manufactured template",
  "duplicate-image": "this photo was used on another application",
  "no-live-capture": "the photo was not taken live in the app",
  "screen-photo": "the photo looks like a picture of a screen",
  "mrz-invalid": "the card's machine-readable zone failed its checksum",
};

/**
 * Score the evidence.
 *
 * A `screen-photo` never refuses on its own. The owner's decision was explicit:
 * members with only a digital copy of their card must still be able to apply,
 * and Rabi looks closely instead. It therefore raises the flag and is reported,
 * but it is not part of the two-signal arithmetic — otherwise a member who
 * screenshotted their own card and typed their name slightly wrong would be
 * refused by a machine, which is exactly the outcome the rule exists to avoid.
 */
export function assessCardRisk(evidence: CardRiskEvidence): CardRiskAssessment {
  const fired: CardRiskSignal[] = [];

  if (evidence.nameMatch === "mismatch") fired.push("name-mismatch");
  if (evidence.templateDetected === true) fired.push("manufactured-template");
  if (evidence.duplicateImage === true) fired.push("duplicate-image");
  if (evidence.liveCapture === false) fired.push("no-live-capture");
  if (evidence.screenPhoto === true) fired.push("screen-photo");
  if (evidence.mrzInvalid === true) fired.push("mrz-invalid");

  const exhaustive = SELF_SUFFICIENT.some((signal) => fired.includes(signal));
  const corroborating = CORROBORATING.filter((signal) => fired.includes(signal));

  /*
   * Two independent signals refuse. One signal, however loud, goes to Rabi.
   *
   * The count is over distinct facts, not over severity: a name mismatch plus a
   * duplicated image is a reused identity, and a name mismatch alone is a
   * Tuesday.
   */
  if (exhaustive || corroborating.length >= 2) {
    const because = exhaustive ? fired.filter((s) => SELF_SUFFICIENT.includes(s)) : corroborating;
    const listed = because.map((signal) => LABEL[signal]).join(", and ");
    return {
      decision: "auto-refuse",
      signals: fired,
      because,
      sentence: `Refused automatically: ${listed}. These are independent findings about the documents, not a disagreement a person could have made by accident.`,
    };
  }

  if (fired.length > 0) {
    // The sentence names every signal, but leads with the screen photo when it
    // is present, because that is the one Rabi most needs to look at.
    const ordered = [
      ...fired.filter((signal) => signal === "screen-photo"),
      ...fired.filter((signal) => signal !== "screen-photo"),
    ];
    const listed = ordered.map((signal) => LABEL[signal]).join(", and ");
    const redFlag = fired.includes("screen-photo")
      ? "HIGH FRAUD RISK: screenshot of ID detected. "
      : "";
    return {
      decision: "flag-for-review",
      signals: fired,
      because: fired,
      sentence: `${redFlag}${listed[0].toUpperCase()}${listed.slice(1)}. Rabi will check this before approving.`,
    };
  }

  return {
    decision: "accept-for-review",
    signals: [],
    because: [],
    sentence: "Nothing in the documents stood out. Rabi still reviews every application.",
  };
}
