/**
 * Who is allowed to receive an email through `/api/email`.
 *
 * The endpoint is public-facing, so the policy lives in one pure function that
 * is unit-tested. The contract is deliberately the narrowest useful one:
 *
 * - a signed-in member may mail their own address and nobody else. Not the
 *   owner inbox, not a friend, not a victim. Self-service only.
 * - an admin may mail anyone, because approval and rejection mail is an admin
 *   action. That path no longer runs in the browser (`/api/notify/decision`
 *   does it server-side), but the ability stays for one-off support replies.
 *
 * The owner-inbox allowance for members used to sit here and was removed on
 * purpose. New-signup alerts now come from `/api/notify/new-member`, which
 * takes the recipient from server-only config instead of from the caller, so a
 * member has no legitimate reason to address Rabi through this relay.
 */

export interface EmailActor {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  admin: boolean;
}

export type EmailPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: "not-signed-in" | "invalid-recipient" | "recipient-not-allowed" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (value: string) => EMAIL_RE.test(value) && value.length <= 254;

export function canSendTo(actor: EmailActor | null, to: string): EmailPolicyResult {
  if (!actor) return { allowed: false, reason: "not-signed-in" };
  if (!isValidEmail(to)) return { allowed: false, reason: "invalid-recipient" };

  const recipient = to.trim().toLowerCase();

  if (actor.admin) return { allowed: true };

  // The address comes from the verified ID token, never from the request body,
  // so "myself" cannot be redefined by the caller.
  if (actor.email && recipient === actor.email.trim().toLowerCase()) return { allowed: true };

  return { allowed: false, reason: "recipient-not-allowed" };
}

/** Server-only list of owner inboxes (never shipped to the browser). */
export function ownerEmails(): string[] {
  const configured =
    process.env.ADMIN_EMAILS ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
    "rabisavinghub@gmail.com";

  return configured
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
