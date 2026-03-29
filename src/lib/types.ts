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
  ghanaCardFront: string;
  ghanaCardBack: string;
  passportPhoto: string;
  status: "pending" | "approved" | "rejected";
  whatsappLink: string;
  createdAt: Timestamp;
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
  ghanaCardFront: string;
  ghanaCardBack: string;
  passportPhoto: string;
  gpsLat: number;
  gpsLng: number;
  gpsAddress: string;
}

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}
