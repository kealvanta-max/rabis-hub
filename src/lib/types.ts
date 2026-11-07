import type { Timestamp } from "firebase/firestore";

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
  plan: string;
  plans?: string[];
  ghanaCardNumber?: string;
  ghanaCardValid?: boolean;
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
