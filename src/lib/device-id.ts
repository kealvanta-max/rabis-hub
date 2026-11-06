/**
 * A stable, anonymous name for this phone.
 *
 * The upload limiter used to count only the caller's IP address. In Ghana most
 * members arrive through carrier-grade NAT, which means hundreds of strangers
 * share one address, and a member who retried a failing upload paid for it out of
 * the same bucket as everybody else on that tower. The budget now follows the
 * device, so one person's retries can never touch another person's allowance.
 *
 * This is a random string, not a fingerprint. It says nothing about the phone, the
 * member or the school they went to. It only answers "is this the same browser as
 * a minute ago?".
 */

const STORAGE_KEY = "rabis-device-id";

let sessionFallback: string | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* older browsers, fall through */
  }

  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.random() * 256;
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Returns the id, creating it on first use. Never throws: private mode on iOS
 * throws on `localStorage`, and a signup must not die because of a quota rule.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = randomId();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Storage is blocked. The id lives for this page load only, which still
    // separates this member from every other phone on the same tower.
    if (!sessionFallback) sessionFallback = randomId();
    return sessionFallback;
  }
}
