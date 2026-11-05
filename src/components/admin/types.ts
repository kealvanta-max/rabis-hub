import type { UserDoc, TestimonialDoc } from "@/lib/types";

/** Firestore document + its id — what every admin list actually renders. */
export interface UserItem extends UserDoc {
  id: string;
}

export interface TestimonialItem extends TestimonialDoc {
  id: string;
}

export type UserStatus = UserDoc["status"];
