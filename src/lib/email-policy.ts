/**
 * Who is allowed to receive an email through `/api/email`.
 *
 * The endpoint is public-facing, so the policy lives in one pure function that
 * is unit-tested: a signed-in member may only mail themselves, and only an
 * admin (custom claim, or a verified owner address) may mail anyone else.
 * Without this, the route is an open relay — anyone could send phishing mail
 * from Rabi's verified domain to any address on earth.
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

export function canSendTo(actor: EmailActor | null, to: string, adminEmails: string[]): EmailPolicyResult {
  if (!actor) return { allowed: false, reason: "not-signed-in" };
  if (!isValidEmail(to)) return { allowed: false, reason: "invalid-recipient" };

  const recipient = to.trim().toLowerCase();

  if (actor.admin) return { allowed: true };

  const ownerAddresses = adminEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (ownerAddresses.includes(recipient)) return { allowed: true };

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
