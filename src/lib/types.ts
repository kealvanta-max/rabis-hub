import type { Timestamp } from "firebase/firestore";

/**
 * One AI screening decision, as persisted for Rabi.
 *
 * The raw signals are stored next to the verdict on purpose: a reviewer who
 * disagrees with "reject" needs to see which question the model answered badly,
 * and a future policy change can be replayed over old submissions without
 * asking anyone to re-upload their ID.
 */
export interface VisionScreeningRecord {
  state:
    | "screened_pass"
    | "manual_review_required"
    | "verification_unavailable"
    | "rejected";
  provider?: string;
  model?: string;
  reasons?: string[];
  signals?: {
    subject?: string;
    card?: string;
    face_match?: string;
    reproduction?: string;
    confidence?: number;
  };
  durationMs?: number;
  attempts?: { provider: string; model?: string; outcome: string }[];
  at?: Timestamp | string;
}

export interface UserDoc {
  name: string;
  email: string;
  phone: string;
  location: string;
  gpsLat: number;
  gpsLng: number;
  gpsAddress: string;
  /** How the pin was obtained: a real fix, the network, or typed by the member. */
  locationSource?: "gps" | "network" | "manual" | "unknown";
  /** Radius of uncertainty in metres, when a fix was read. */
  locationAccuracy?: number | null;
  /** Set when there was no fix, or the pin was outside Ghana. */
  locationReview?: boolean;
  /** Human-readable KYC exception for Rabi's pending queue. */
  kycReviewReason?: string;
  kycReviewStatus?: "manual_review_required" | "verification_unavailable" | "screened_pass" | "rejected" | "approved";
  /**
   * The automated verdict, kept separate from `kycReviewStatus`.
   *
   * `kycReviewStatus` answers "where is this in the process" and is
   * `manual_review_required` for every fresh submission, clean or not, because
   * approval always needs Rabi. This answers "what did the machine actually
   * decide", which is the only way to tell a clean pass from a held case.
   */
  kycScreeningState?: "screened_pass" | "manual_review_required" | "verification_unavailable" | "rejected";
  /** Human-readable reason tokens, joined for display. */
  kycScreeningReasons?: string[];
  /** Version stamp for the policy that produced the verdict. */
  kycScreeningModelVersion?: string;
  kycSubmittedAt?: Timestamp;
  kycPolicyVersion?: string;
  /**
   * What each screening layer concluded. Written only by the server.
   *
   * `vision` is the AI pass over the three photos (Ghana Card front, back and
   * selfie) and `worker` is the Python service that reads the card text. They
   * are kept side by side because they answer different questions and either
   * can be the one that is unavailable.
   */
  kycScreeningChecks?: {
    vision?: VisionScreeningRecord;
    worker?: Record<string, unknown>;
    /** Measured from the files themselves; no AI involved. */
    deterministic?: Record<string, { status?: string; reasons?: string[]; detail?: Record<string, unknown> }>;
    [key: string]: unknown;
  };
  reviewerUid?: string;
  reviewerEmail?: string;
  reviewedAt?: Timestamp;
  reviewChecklist?: Record<string, boolean>;
  decisionId?: string;
  evidenceHashes?: Record<string, string>;
  plan: string;
  plans?: string[];
  ghanaCardNumber?: string;
  ghanaCardValid?: boolean;
  /** The nine digits read from the card's machine-readable zone by the server. */
  ghanaCardMrzNumber?: string;
  /**
   * How the legal name typed at signup compared with the name on the card.
   * Written by `/api/signup/submit`; informational for Rabi, never an automatic
   * decision.
   */
  kycIdentityOutcome?: "consistent" | "mostly-consistent" | "inconsistent" | "not-checked";
  kycIdentitySentence?: string;
  /*
   * The fraud evidence added with the two-signal rule. All written by the
   * server, all immutable afterwards, and all read by Rabi's review sheet.
   */
  /** 8-byte perceptual hashes, keyed by the field they came from. */
  kycPerceptualHashes?: Record<string, string>;
  /** How the two-signal rule concluded, and why. */
  kycRiskDecision?: "accept-for-review" | "flag-for-review" | "auto-refuse";
  kycRiskSignals?: string[];
  kycRiskSentence?: string;
  /** The sha256 card lock this application holds, empty when it could not lock. */
  kycCardLock?: string;
  /** True when the evidence looked like a photograph of a screen. */
  kycScreenPhoto?: boolean;
  /** The earlier submission this picture matched, when one did. */
  kycDuplicateOf?: { hash: string; field: string } | null;
  /** "live-camera", "fallback-no-camera", or empty from an older client. */
  kycSelfieCaptureMode?: string;
  firstName?: string;
  lastName?: string;
  otherNames?: string;
  previousNames?: string;
  dateOfBirth?: string;
  sex?: string;
  nationality?: string;
  placeOfIssuance?: string;
  ghanaCardFront: string;
  ghanaCardBack: string;
  passportPhoto: string;
  faceScanVideo?: string;
  status: "pending" | "approved" | "rejected";
  whatsappLink: string;
  createdAt: Timestamp;
  ghanaCardOcrResult?: string;
  /** True when storage refused the documents and the member sends them on WhatsApp. */
  documentsDeferred?: boolean;
  /** Money Rabi has actually received, recorded by her in the admin panel. */
  contributions?: { date: string; amount: number; note?: string }[];
  /*
   * Delivery bookkeeping, written only by the server. `adminAlertAt` marks a
   * signup Rabi has been told about, so the sweep does not announce it twice.
   * The decision fields record whether the member was actually emailed and by
   * which provider, which the browser can no longer fake.
   */
  adminAlertAt?: Timestamp | Date | null;
  adminAlertProvider?: string | null;
  decisionEmailAt?: Timestamp | Date | null;
  decisionEmailFor?: "approved" | "rejected" | null;
  decisionEmailStatus?: "sent" | "logged" | "failed" | null;
  decisionEmailProvider?: string | null;
}

export interface TestimonialDoc {
  id?: string;
  userId: string;
  userName: string;
  userPhoto: string;
  planName: string;
  rating: number;
  review: string;
  status: "pending" | "approved" | "rejected";
  isStatic: boolean;
  createdAt: Timestamp;
}

export interface PlanItem {
  id: string;
  name: string;
  amt: number;
  freq: string;
  ret: number;
  slots?: number;
}

export interface AchieverTier {
  days: number;
  ret: number;
}

export interface RegistrationData {
  firstName: string;
  lastName: string;
  /*
   * Legal identity, collected on step one and compared with the card on step
   * two. All optional except the two names: a member with no former name, or
   * who would rather not label their sex, must still be able to register.
   */
  previousNames?: string;
  otherNames?: string;
  dateOfBirth?: string;
  sex?: string;
  nationality?: string;
  placeOfIssuance?: string;
  email: string;
  phone: string;
  location: string;
  password: string;
  plan: string;
  ghanaCardNumber?: string;
  ghanaCardValid?: boolean;
  ghanaCardFront: string;
  ghanaCardBack: string;
  passportPhoto: string;
  /**
   * How the passport photo was obtained.
   *
   * `"live-camera"` means the frames came from a getUserMedia stream this page
   * was holding open. `"fallback-no-camera"` means the member could not open a
   * camera and Rabi will verify them by hand. Empty means an older client that
   * still had the gallery picker.
   *
   * Recorded rather than inferred, because a saved image and a live frame are
   * indistinguishable once uploaded, and this is the only place the difference
   * survives.
   */
  captureMode?: string;
  faceScanVideo?: string;
  gpsLat: number;
  gpsLng: number;
  gpsAddress: string;
  ghanaCardOcrResult?: string;
  faceDetectionResult?: string;
}

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}
