import { Timestamp } from "firebase/firestore";

export interface UserDoc {
  name: string;
  email: string;
  phone: string;
  location: string;
  gpsLat: number;
  gpsLng: number;
  gpsAddress: string;
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
